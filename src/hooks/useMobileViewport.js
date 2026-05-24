/**
 * useMobileViewport — gestiona el viewport en iOS Safari / Android Chrome
 *
 * Arquitectura: en lugar de usar transform:translateY en el input (que causa bugs
 * de touch en iOS Safari), el chat-root trackea la altura del visual viewport.
 * Cuando el teclado abre, visualViewport.height se reduce → chat-root se achica →
 * el input bar (flex item natural, sin position:fixed) queda visible arriba del teclado.
 *
 * Resuelve:
 * - Input bloqueado en iOS Safari (el bug clásico de position:fixed + overflow:hidden)
 * - Teclado virtual en iOS/Android (visualViewport API)
 * - Safe areas (notch / Dynamic Island / home indicator)
 * - Layout jumps: solo se modifica height del root, no transform del input
 */

import { useState, useEffect } from 'react'

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useMobileViewport() {
  const [visualHeight, setVisualHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  )
  const [visualOffsetTop, setVisualOffsetTop] = useState(
    () => window.visualViewport?.offsetTop ?? 0
  )
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport

    if (!vv) {
      // Fallback: iOS < 13 / Chrome 61 — no visualViewport support
      const handleResize = () => {
        setVisualHeight(window.innerHeight)
        setVisualOffsetTop(0)
        setKeyboardVisible(false)
      }
      window.addEventListener('resize', handleResize, { passive: true })
      return () => window.removeEventListener('resize', handleResize)
    }

    const handleChange = () => {
      // diff > 150px es el umbral conservador para detectar teclado en todos los
      // tamaños de pantalla y orientaciones
      const isOpen = (window.innerHeight - vv.height) > 150
      setVisualHeight(vv.height)
      setVisualOffsetTop(vv.offsetTop)
      setKeyboardVisible(isOpen)
    }

    vv.addEventListener('resize', handleChange, { passive: true })
    // 'scroll' se dispara cuando iOS hace pan del viewport para seguir el cursor
    vv.addEventListener('scroll', handleChange, { passive: true })

    return () => {
      vv.removeEventListener('resize', handleChange)
      vv.removeEventListener('scroll', handleChange)
    }
  }, [])

  /**
   * chatRootStyle: aplicar al div.chat-root como inline style.
   *
   * Hace que el chat-root ocupe exactamente el visual viewport visible.
   * Cuando el teclado abre → visualHeight se reduce → chat-root se achica →
   * el input bar (flex item sin position:fixed) sube sobre el teclado.
   *
   * `top: visualOffsetTop` compensa el pan que iOS hace cuando el usuario toca
   * un input y el sistema scrollea para mantenerlo visible.
   */
  const chatRootStyle = {
    height: `${visualHeight}px`,
    top: `${visualOffsetTop}px`,
  }

  return {
    chatRootStyle,
    keyboardVisible,
    visualHeight,
    isIOS: isIOS(),
  }
}

/**
 * useMobileViewport — trackea visualViewport.height para keyboard avoidance.
 *
 * Arquitectura limpia (sin position:fixed en chat-root):
 * - chat-root es position:relative, en flujo normal
 * - html/body tienen overflow:hidden (seteado en ChatInterface via useEffect)
 * - #root tiene minHeight:0 (seteado en ChatInterface via useEffect)
 * - chat-root.height = visualViewport.height → cuando el teclado abre, el
 *   chat-root se achica → el input bar (último flex item) sube naturalmente
 *
 * `top` ya NO está en chatRootStyle — solo aplica a position:fixed/absolute.
 */

import { useState, useEffect } from 'react'

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function useMobileViewport() {
  const [visualHeight, setVisualHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  )
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport

    if (!vv) {
      const handleResize = () => {
        setVisualHeight(window.innerHeight)
        setKeyboardVisible(false)
      }
      window.addEventListener('resize', handleResize, { passive: true })
      return () => window.removeEventListener('resize', handleResize)
    }

    const handleChange = () => {
      const isOpen = (window.innerHeight - vv.height) > 150
      setVisualHeight(vv.height)
      setKeyboardVisible(isOpen)
    }

    vv.addEventListener('resize', handleChange, { passive: true })
    vv.addEventListener('scroll', handleChange, { passive: true })

    return () => {
      vv.removeEventListener('resize', handleChange)
      vv.removeEventListener('scroll', handleChange)
    }
  }, [])

  const chatRootStyle = {
    height: `${visualHeight}px`,
  }

  return {
    chatRootStyle,
    keyboardVisible,
    visualHeight,
    isIOS: isIOS(),
  }
}

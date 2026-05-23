/**
 * useMobileViewport — gestiona el viewport en iOS Safari / Android Chrome
 *
 * Resuelve:
 * - Teclado virtual en iOS (visualViewport API)
 * - Safe areas (notch / Dynamic Island / home indicator)
 * - Offset del input sticky cuando el teclado abre/cierra
 * - Layout jumps: transición suave con transform en lugar de height changes
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// Detecta iOS Safari (incluye WKWebView embebido en Chrome/Firefox iOS)
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// Detecta si el teclado virtual probablemente está abierto
// Heurística: viewport height cayó más del 30% del window.screen.height
const KEYBOARD_THRESHOLD = 0.30

export function useMobileViewport() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [visualHeight, setVisualHeight] = useState(
    () => window.visualViewport?.height ?? window.innerHeight
  )
  const [stableHeight] = useState(
    () => window.screen.availHeight || window.innerHeight
  )

  // Ref para evitar closures stale en el listener
  const keyboardHeightRef = useRef(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return // Fallback: navegadores sin soporte (< iOS 13 / Chrome 61)

    const handleResize = () => {
      const currentHeight = vv.height
      const diff = window.innerHeight - currentHeight

      // diff > 150px = teclado abierto (umbral conservador, funciona en
      // todos los tamaños de pantalla y orientaciones)
      const isOpen = diff > 150
      const kbHeight = isOpen ? diff : 0

      keyboardHeightRef.current = kbHeight
      setKeyboardHeight(kbHeight)
      setKeyboardVisible(isOpen)
      setVisualHeight(currentHeight)
    }

    // 'resize' se dispara al abrir/cerrar teclado y al cambiar orientación
    vv.addEventListener('resize', handleResize, { passive: true })
    // 'scroll' se dispara cuando iOS hace pan del viewport sobre el teclado
    vv.addEventListener('scroll', handleResize, { passive: true })

    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
    }
  }, [])

  // Fallback para browsers sin visualViewport (iOS < 13)
  // Usa window resize + heurística de screen height
  useEffect(() => {
    if (window.visualViewport) return // ya cubierto arriba

    const handleWindowResize = () => {
      const ratio = window.innerHeight / stableHeight
      const isOpen = ratio < (1 - KEYBOARD_THRESHOLD)
      const kbHeight = isOpen ? stableHeight - window.innerHeight : 0
      setKeyboardHeight(kbHeight)
      setKeyboardVisible(isOpen)
      setVisualHeight(window.innerHeight)
    }

    window.addEventListener('resize', handleWindowResize, { passive: true })
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [stableHeight])

  /**
   * Calcula el offset CSS que debe aplicarse al input sticky para que
   * quede SOBRE el teclado en lugar de debajo.
   *
   * En iOS Safari con `position: fixed`, los elementos fixed se posicionan
   * relativo al LAYOUT viewport (el grande), no al visual viewport (el que
   * se mueve). Por eso el input queda tapado por el teclado.
   *
   * Solución: leer visualViewport.offsetTop (cuántos px scrolleó el layout
   * viewport) y mover el input con transform: translateY(-kbHeight).
   */
  const getInputOffset = useCallback(() => {
    if (!keyboardVisible) return 0
    // visualViewport.offsetTop indica el offset del visual viewport
    // respecto al layout viewport — lo usamos para compensar
    const vvOffsetTop = window.visualViewport?.offsetTop ?? 0
    return -(keyboardHeight + vvOffsetTop)
  }, [keyboardVisible, keyboardHeight])

  return {
    keyboardHeight,
    keyboardVisible,
    visualHeight,
    getInputOffset,
    isIOS: isIOS(),
  }
}

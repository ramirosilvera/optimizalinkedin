/**
 * useAutoResizeTextarea — textarea que crece de 1 a MAX_ROWS líneas
 *
 * Problemas en iOS que resuelve:
 * - scrollHeight reporting incorrecto cuando el textarea tiene padding
 * - Reflow visible durante el resize (usar requestAnimationFrame)
 * - El zoom automático cuando font-size < 16px (prevenido en CSS global)
 * - Textarea que no colapsa al borrar texto (reset height antes de medir)
 *
 * Fórmula: reset height → medir scrollHeight → clamp entre min y max.
 * El reset a 'auto' es CRÍTICO: sin él scrollHeight no baja al borrar texto.
 */

import { useRef, useCallback, useEffect } from 'react'

const LINE_HEIGHT_PX = 22  // line-height del textarea en px — ajustar si cambia el CSS
const MIN_ROWS = 1
const MAX_ROWS = 4

export function useAutoResizeTextarea(value) {
  const textareaRef = useRef(null)
  const rafRef = useRef(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    // Cancelar RAF pendiente para no acumular
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(() => {
      // 1. Guardar el scroll position del contenedor padre para no saltar
      const parent = el.closest('[data-chat-container]') || el.parentElement
      const prevScrollTop = parent?.scrollTop ?? 0

      // 2. Reset a 'auto' para que scrollHeight refleje el contenido real
      //    (sin esto, scrollHeight solo sube, nunca baja)
      el.style.height = 'auto'

      // 3. Medir el contenido real
      const contentHeight = el.scrollHeight

      // 4. Calcular altura mínima y máxima
      // Tomamos el padding del elemento para el cálculo preciso
      const style = window.getComputedStyle(el)
      const paddingTop    = parseFloat(style.paddingTop)    || 0
      const paddingBottom = parseFloat(style.paddingBottom) || 0
      const totalPadding  = paddingTop + paddingBottom

      const minHeight = MIN_ROWS * LINE_HEIGHT_PX + totalPadding
      const maxHeight = MAX_ROWS * LINE_HEIGHT_PX + totalPadding

      // 5. Clamp y aplicar — solo se modifica el inline style, sin reflow adicional
      const newHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight)
      el.style.height = `${newHeight}px`

      // 6. Si llegamos al máximo, mostrar scrollbar; si no, ocultarla
      //    (overflow hidden evita el doble-scroll en iOS)
      el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden'

      // 7. Restaurar scroll del contenedor para evitar jump
      if (parent) parent.scrollTop = prevScrollTop
    })
  }, [])

  // Resize en cada cambio de value
  useEffect(() => {
    resize()
  }, [value, resize])

  // Cleanup RAF al desmontar
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { textareaRef, resize }
}

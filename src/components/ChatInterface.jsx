/**
 * ChatInterface — componente de chat WhatsApp-style para entrenamiento de entrevistas
 *
 * Resuelve todos los problemas mobile/iOS:
 * 1. Teclado virtual: visualViewport API + transform translateY (no position jump)
 * 2. Safe areas: env(safe-area-inset-*) en header e input
 * 3. Auto-scroll inteligente con IntersectionObserver (no scrollea si el usuario subió)
 * 4. Textarea auto-resize: 1→4 líneas con scrollHeight, no causa zoom en iOS
 * 5. Overscroll: contain en el área de mensajes, previene body scroll bleed
 * 6. Performance: transform+opacity para animaciones, will-change en elementos animados
 * 7. Tap targets: mínimo 44px en todos los controles
 * 8. Text selection: -webkit-user-select en burbujas del coach para permitir copiar
 * 9. touch-action: pan-y en el scroll area para scroll vertical sin interferencias
 */

import { useEffect, useCallback } from 'react'
import { useMobileViewport } from '../hooks/useMobileViewport'
import { useChatScroll } from '../hooks/useChatScroll'
import { useAutoResizeTextarea } from '../hooks/useAutoResizeTextarea'

// ─── Constantes de diseño ──────────────────────────────────────────────────────
const COACH_AVATAR_GRADIENT = 'linear-gradient(135deg, #6366f1, #8b5cf6)'
const USER_BUBBLE_STYLE = {
  background: 'linear-gradient(135deg, #0077B5, #0ea5e9)',
  color: 'white',
  borderRadius: '18px 18px 4px 18px',
}
const COACH_BUBBLE_STYLE = {
  background: 'white',
  color: '#0d2137',
  border: '1px solid rgba(0,119,181,0.12)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  borderRadius: '18px 18px 18px 4px',
  // Permite larga pulsación → copiar en iOS
  WebkitUserSelect: 'text',
  userSelect: 'text',
}

// ─── Avatar helper ────────────────────────────────────────────────────────────
function CoachAvatar({ src, size = 8 }) {
  if (src) {
    return (
      <div className={`shrink-0 w-${size} h-${size} rounded-full overflow-hidden`}
        style={{ minWidth: `${size * 4}px` }} aria-hidden="true">
        <img src={src} alt="" className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className={`shrink-0 w-${size} h-${size} rounded-full flex items-center justify-center text-white text-xs font-bold`}
      style={{ background: COACH_AVATAR_GRADIENT, minWidth: `${size * 4}px` }} aria-hidden="true">
      AI
    </div>
  )
}

// ─── Burbuja del coach ─────────────────────────────────────────────────────────
function CoachBubble({ message, isTyping, avatarSrc }) {
  return (
    <div className="flex items-end gap-2 chat-bubble-in" style={{ maxWidth: '85%' }}>
      {/* Avatar */}
      <CoachAvatar src={avatarSrc} size={8} />

      {/* Burbuja */}
      <div style={COACH_BUBBLE_STYLE} className="px-4 py-3 text-sm leading-relaxed">
        {isTyping ? (
          // Indicador de "escribiendo" — 3 dots animados
          <span className="flex gap-1 items-center h-5" aria-label="El coach está escribiendo">
            <span className="typing-dot" style={{ animationDelay: '0ms' }} />
            <span className="typing-dot" style={{ animationDelay: '160ms' }} />
            <span className="typing-dot" style={{ animationDelay: '320ms' }} />
          </span>
        ) : (
          // Preserve saltos de línea del coach
          <span style={{ whiteSpace: 'pre-wrap' }}>{message}</span>
        )}
      </div>
    </div>
  )
}

// ─── Burbuja del usuario ───────────────────────────────────────────────────────
function UserBubble({ message }) {
  return (
    <div className="flex justify-end chat-bubble-in" style={{ maxWidth: '85%', alignSelf: 'flex-end' }}>
      <div style={USER_BUBBLE_STYLE} className="px-4 py-3 text-sm leading-relaxed">
        <span style={{ whiteSpace: 'pre-wrap' }}>{message}</span>
      </div>
    </div>
  )
}

// ─── Mensaje de sistema / estado ──────────────────────────────────────────────
function SystemMessage({ text }) {
  return (
    <div className="flex justify-center my-1">
      <span className="text-xs px-3 py-1 rounded-full"
        style={{ background: 'rgba(0,119,181,0.08)', color: '#0077B5' }}>
        {text}
      </span>
    </div>
  )
}

// ─── Badge "nuevo mensaje" ─────────────────────────────────────────────────────
function NewMessageBadge({ onPress }) {
  return (
    <button
      onClick={onPress}
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-semibold shadow-lg"
      style={{
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        bottom: '1rem',
        // Asegurar tap target 44px
        minHeight: '44px',
        // Hardware-accelerated
        transform: 'translateX(-50%)',
        willChange: 'transform, opacity',
      }}
      aria-label="Ir al último mensaje"
    >
      ↓ Nuevo mensaje
    </button>
  )
}

// ─── Input area ───────────────────────────────────────────────────────────────
// NO position:fixed — es un flex item natural del chat-root.
// El keyboard avoidance lo maneja el chat-root via visualViewport height.
function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  textareaRef,
}) {
  const handleKeyDown = (e) => {
    // Enter sin Shift = enviar en desktop
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) {
      e.preventDefault()
      if (!disabled && value.trim()) onSend()
    }
  }

  return (
    <div className="chat-input-bar">
      <div className="chat-input-inner">
        {/* Textarea auto-resize */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Escribí tu respuesta...'}
          disabled={disabled}
          rows={1}
          maxLength={1000}
          className="chat-textarea"
          // inputMode="text" evita que iOS muestre teclado numérico
          inputMode="text"
          // autoComplete off para evitar sugerencias en iOS que desplazan el layout
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck={true}
          aria-label="Tu respuesta"
        />

        {/* Botón enviar — posicionado para pulgar derecho */}
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="chat-send-btn spring-tap"
          aria-label="Enviar respuesta"
        >
          {/* Ícono de flecha hacia arriba (WhatsApp-style) */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 17V3M10 3L4 9M10 3l6 6" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────────
/**
 * @param {Object} props
 * @param {string}   props.title        - Título que aparece en el header
 * @param {string}   props.subtitle     - Subtítulo (ej: "Pregunta 2/5")
 * @param {Array}    props.messages     - [{ id, role: 'coach'|'user'|'system', text, isTyping? }]
 * @param {string}   props.inputValue   - Valor del textarea controlado
 * @param {Function} props.onInputChange
 * @param {Function} props.onSend       - Callback al enviar
 * @param {boolean}  props.sendDisabled
 * @param {string}   props.inputPlaceholder
 * @param {Function} props.onBack       - Callback del botón atrás en el header
 * @param {React.ReactNode} props.headerRight - Slot para contenido extra en el header (ej: progress bar)
 * @param {React.ReactNode} props.belowChat   - Contenido extra debajo del chat (ej: upsell cards)
 * @param {string}   props.avatarSrc        - URL de imagen para el avatar del coach (opcional)
 */
export default function ChatInterface({
  title,
  subtitle,
  messages = [],
  inputValue,
  onInputChange,
  onSend,
  sendDisabled,
  inputPlaceholder,
  onBack,
  headerRight,
  belowChat,
  avatarSrc,
}) {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { chatRootStyle, keyboardVisible } = useMobileViewport()

  const { containerRef, sentinelRef, hasNewMessage, scrollToBottom, handleScrollToBottomBtn } =
    useChatScroll({ messagesCount: messages.length, keyboardVisible })

  const { textareaRef } = useAutoResizeTextarea(inputValue)

  // ── Document normalization ─────────────────────────────────────────────────
  // Locks html/body scroll and zeroes #root min-height while chat is mounted.
  // Prevents iOS Safari UIKit from treating the document as "scrollable" when
  // the keyboard opens (which intercepts touch events and blocks input focus).
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const root = document.getElementById('root')
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevRootMinHeight = root ? root.style.minHeight : ''
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    if (root) root.style.minHeight = '0'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      if (root) root.style.minHeight = prevRootMinHeight
    }
  }, [])

  // ── Scroll inicial al montar ───────────────────────────────────────────────
  useEffect(() => {
    scrollToBottom('instant')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handler de envío con focus management ─────────────────────────────────
  const handleSend = useCallback(() => {
    if (sendDisabled || !inputValue.trim()) return
    onSend()
    // Mantener el focus en el textarea después de enviar (iOS conserva el teclado)
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [sendDisabled, inputValue, onSend, textareaRef])

  return (
    /*
     * Layout raíz del chat — ocupa toda la pantalla
     * dvh = dynamic viewport height — se ajusta automáticamente al teclado
     * en Chrome Android y iOS 15.4+. Fallback: 100vh para browsers viejos.
     */
    <div className="chat-root" style={chatRootStyle}>
      {/* ── Header ── */}
      <div className="chat-header">
        <div className="chat-header-inner">
          {/* Botón atrás — 44px tap target */}
          {onBack && (
            <button
              onClick={onBack}
              className="chat-back-btn spring-tap"
              aria-label="Volver"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M12 4L6 10l6 6" stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}

          {/* Avatar del coach */}
          <CoachAvatar src={avatarSrc} size={9} />

          {/* Título + subtítulo */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
              {title || 'Coach de Entrevistas'}
            </p>
            {subtitle && (
              <p className="text-xs text-slate-500 truncate leading-tight">{subtitle}</p>
            )}
          </div>

          {/* Slot derecho del header (ej: ícono premium, menú) */}
          {headerRight && (
            <div className="shrink-0">{headerRight}</div>
          )}
        </div>

        {/* Línea de progreso u otro contenido extra del header */}
        {/* Ej: <div slot="header-extra"><ProgressBar /></div> */}
      </div>

      {/* ── Área de mensajes — scrollable ── */}
      {/*
       * touch-action: pan-y — permite scroll vertical con el dedo sin
       * interferir con gestos horizontales del sistema (swipe para navegar).
       * overscroll-behavior: contain — previene que el body scrollee cuando
       * el chat llega al tope o al fondo (critical en iOS).
       */}
      <div
        ref={containerRef}
        className="chat-messages"
        data-chat-container
        role="log"
        aria-live="polite"
        aria-label="Mensajes del chat"
      >
        {/* Lista de mensajes */}
        <div className="chat-messages-list">
          {messages.map((msg) => {
            if (msg.role === 'system') {
              return <SystemMessage key={msg.id} text={msg.text} />
            }
            if (msg.role === 'coach') {
              return (
                <CoachBubble
                  key={msg.id}
                  message={msg.text}
                  isTyping={msg.isTyping}
                  avatarSrc={avatarSrc}
                />
              )
            }
            return <UserBubble key={msg.id} message={msg.text} />
          })}

          {/* Sentinel: IntersectionObserver lo observa para detectar si el
              usuario está al fondo del chat */}
          <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
        </div>

        {/* Contenido extra debajo del chat (upsell, acciones post-respuesta) */}
        {belowChat && (
          <div className="px-4 pb-4">
            {belowChat}
          </div>
        )}
      </div>

      {/* Badge "nuevo mensaje" — aparece si el usuario subió y llega un mensaje */}
      {hasNewMessage && (
        <div className="chat-new-msg-badge">
          <NewMessageBadge onPress={handleScrollToBottomBtn} />
        </div>
      )}

      {/* ── Input sticky ── */}
      <ChatInput
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        disabled={sendDisabled}
        placeholder={inputPlaceholder}
        textareaRef={textareaRef}
      />
    </div>
  )
}

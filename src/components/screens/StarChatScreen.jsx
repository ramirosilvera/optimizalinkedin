/**
 * StarChatScreen — versión chat del entrenador STAR
 *
 * El coach explica la metodología STAR como burbujas de mensaje,
 * luego el candidato practica respondiendo en el chat.
 * El feedback de IA aparece como mensajes del coach.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { STAR_QUESTIONS } from '../../data'
import { STEPS, trackEvent } from '../../constants'
import ChatInterface from '../ChatInterface'

let _msgId = 1000 // offset para no colisionar con InterviewChatScreen si se usan juntos
const nextId = () => ++_msgId

function coachMsg(text) {
  return { id: nextId(), role: 'coach', text }
}

function userMsg(text) {
  return { id: nextId(), role: 'user', text }
}

function systemMsg(text) {
  return { id: nextId(), role: 'system', text }
}

function typingMsg() {
  return { id: nextId(), role: 'coach', text: '', isTyping: true }
}

// Contenido de la teoría STAR formateado para chat
const STAR_THEORY_MESSAGES = [
  `El método STAR es la técnica que usan los mejores candidatos para responder preguntas conductuales de manera que impacta.`,
  `S — Situación\nDescribí el contexto. ¿Cuándo y dónde ocurrió? ¿Qué estaba en juego?\n\nEj: "Era finales de año y el sistema de facturación colapsó justo antes del cierre."`,
  `T — Tarea\n¿Cuál era tu responsabilidad específica en esa situación?\n\nEj: "Yo era el responsable de garantizar que los pagos se procesaran a tiempo."`,
  `A — Acción\n¿Qué hiciste vos concretamente? Usá verbos de acción en primera persona.\n\nEj: "Coordiné al equipo, prioricé manualmente las cuentas críticas y contacté al proveedor."`,
  `R — Resultado\n¿Qué lograste? Con métricas si podés. ¿Qué aprendiste?\n\nEj: "Procesamos el 95% de los pagos en tiempo. El cliente renovó el contrato por 2 años más."`,
  `Ejemplo completo bien estructurado:\n\nPregunta: "Contame sobre un logro profesional del que estés orgulloso/a."\n\nS: "En mi anterior empresa, el equipo de ventas no tenía visibilidad en tiempo real de los resultados."\n\nT: "Como analista de datos, me propuse crear un dashboard que resolviera ese problema sin presupuesto adicional."\n\nA: "Dediqué 3 semanas fuera del horario laboral, aprendí Power BI y coordiné con el equipo de IT para los accesos."\n\nR: "El dashboard redujo el tiempo de reporte semanal de 4 horas a 20 minutos. El gerente lo adoptó para toda la región."`,
  `¿Listo para practicar? Respondé "listo" o cualquier texto para empezar con la primera pregunta.`,
]

// ─── Componente ───────────────────────────────────────────────────────────────
export default function StarChatScreen({
  starPhase,
  setStarPhase,
  starQuestionIdx,
  setStarQuestionIdx,
  starAnswer,
  setStarAnswer,
  starFeedback,
  setStarFeedback,
  starLoading,
  starError,
  setStarError,
  callStarFeedback,
  // resetInterview, user, setShowPremiumModal: recibidos para compatibilidad de API,
  // el chat los usa implícitamente a través del flujo de navegación
  interviewFeedback,
  result,
  setStep,
}) {
  // ── Estado de mensajes ─────────────────────────────────────────────────────
  const [messages, setMessages] = useState(() => {
    const initial = [systemMsg('Entrenador STAR')]
    if (starPhase === 'theory') {
      // Mostrar los mensajes de teoría uno a uno
      STAR_THEORY_MESSAGES.forEach(text => initial.push(coachMsg(text)))
    } else {
      // Ir directo a la práctica
      initial.push(coachMsg(`Entrenamiento STAR — Pregunta ${starQuestionIdx + 1} de ${STAR_QUESTIONS.length}`))
      initial.push(coachMsg(STAR_QUESTIONS[starQuestionIdx]))
      initial.push(coachMsg('Recordá estructurar tu respuesta en S · T · A · R'))
    }
    return initial
  })

  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Fase anterior — para detectar cuando cambia theory → practice
  const prevPhaseRef = useRef(starPhase)

  // ── Cuando el usuario pasa de theory a practice ────────────────────────────
  useEffect(() => {
    if (prevPhaseRef.current === 'theory' && starPhase === 'practice') {
      prevPhaseRef.current = 'practice'
      setMessages(prev => [
        ...prev,
        systemMsg('Práctica STAR'),
        coachMsg(`Empecemos. Pregunta ${starQuestionIdx + 1} de ${STAR_QUESTIONS.length}:`),
        coachMsg(STAR_QUESTIONS[starQuestionIdx]),
        coachMsg('Usá la estructura S · T · A · R en tu respuesta. Mínimo 40 caracteres.'),
      ])
    }
    prevPhaseRef.current = starPhase
  }, [starPhase, starQuestionIdx])

  // ── Cuando llega feedback de IA ────────────────────────────────────────────
  const prevFeedbackRef = useRef(starFeedback)
  useEffect(() => {
    if (!starFeedback || starFeedback === prevFeedbackRef.current) return
    prevFeedbackRef.current = starFeedback

    setMessages(prev => {
      const filtered = prev.filter(m => !m.isTyping)

      // Construir mensaje de feedback estructurado
      const score = starFeedback.puntaje
      const scoreEmoji = score >= 8 ? '🌟' : score >= 6 ? '✅' : '⚠️'
      const scoreLine = `${scoreEmoji} Puntaje: ${score}/10`

      const breakdown = [
        { key: 'situacion', letra: 'S', nombre: 'Situación' },
        { key: 'tarea', letra: 'T', nombre: 'Tarea' },
        { key: 'accion', letra: 'A', nombre: 'Acción' },
        { key: 'resultado', letra: 'R', nombre: 'Resultado' },
      ].map(({ key, letra, nombre }) => {
        const item = starFeedback[key]
        return `${item?.presente ? '✓' : '✗'} ${letra} · ${nombre}: ${item?.comentario || ''}`
      }).join('\n')

      const sugerencia = starFeedback.sugerencia_clave
        ? `\n💡 ${starFeedback.sugerencia_clave}`
        : ''

      const feedbackText = `${scoreLine}\n\n${breakdown}${sugerencia}`

      const nextAvailable = starQuestionIdx < STAR_QUESTIONS.length - 1

      return [
        ...filtered,
        coachMsg(feedbackText),
        coachMsg(
          score >= 8
            ? nextAvailable
              ? 'Excelente respuesta. ¿Querés intentar de nuevo o pasar a la siguiente pregunta? Respondé "siguiente" o "de nuevo".'
              : '¡Completaste todas las preguntas! Respondé "de nuevo" para practicar otra vez o cerrá el entrenador.'
            : 'Para mejorar, intentá agregar más detalle. Respondé "de nuevo" para reformular, o "siguiente" para avanzar.'
        ),
      ]
    })
  }, [starFeedback, starQuestionIdx])

  // ── Cuando llega error ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!starError) return
    queueMicrotask(() => {
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isTyping)
        return [...filtered, coachMsg(`Ocurrió un error: ${starError}\n\nPodés intentar de nuevo.`)]
      })
    })
  }, [starError])

  // ── Handler de envío ───────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = starAnswer.trim()
    if (!text || starLoading) return

    // Comandos especiales post-feedback
    if (starFeedback) {
      const lower = text.toLowerCase()
      if (lower.includes('siguiente') || lower.includes('next')) {
        // Siguiente pregunta
        const next = (starQuestionIdx + 1) % STAR_QUESTIONS.length
        setMessages(prev => [
          ...prev,
          userMsg(text),
          systemMsg(`Pregunta ${next + 1} de ${STAR_QUESTIONS.length}`),
          coachMsg(STAR_QUESTIONS[next]),
          coachMsg('Usá la estructura S · T · A · R.'),
        ])
        setStarQuestionIdx(next)
        setStarFeedback(null)
        setStarAnswer('')
        setStarError('')
        trackEvent('star_next_question', { question_idx: next })
        return
      }

      if (lower.includes('nuevo') || lower.includes('again') || lower.includes('otra')) {
        // Intentar de nuevo
        setMessages(prev => [
          ...prev,
          userMsg(text),
          coachMsg('Perfecto, te reescucho. Tomá tu tiempo y estructurá bien la respuesta.'),
        ])
        setStarFeedback(null)
        setStarAnswer('')
        setStarError('')
        trackEvent('star_retry', { question_idx: starQuestionIdx })
        return
      }
    }

    // Fase teoría: cualquier texto avanza a práctica
    if (starPhase === 'theory') {
      setMessages(prev => [...prev, userMsg(text)])
      setStarAnswer('')
      setStarPhase('practice')
      trackEvent('star_phase_change', { phase: 'practice' })
      return
    }

    // Fase práctica: respuesta para feedback
    if (text.length < 40) {
      setMessages(prev => [
        ...prev,
        userMsg(text),
        coachMsg(`Necesito un poco más de detalle (${40 - text.length} caracteres más). Agregá más contexto usando S·T·A·R.`),
      ])
      setStarAnswer('')
      return
    }

    // Enviar para feedback de IA
    const userBubble = userMsg(text)
    const typing = typingMsg()
    setMessages(prev => [...prev, userBubble, typing])
    setStarAnswer('')
    trackEvent('star_practice_submit', { question_idx: starQuestionIdx })
    callStarFeedback()
  }, [
    starAnswer, starLoading, starFeedback, starPhase, starQuestionIdx,
    setStarQuestionIdx, setStarFeedback, setStarAnswer, setStarError,
    setStarPhase, callStarFeedback,
  ])

  // ── Subtitle ───────────────────────────────────────────────────────────────
  const subtitle = starPhase === 'theory'
    ? 'Metodología STAR'
    : `Práctica · ${starQuestionIdx + 1}/${STAR_QUESTIONS.length}`

  // ── Back handler ──────────────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    trackEvent('star_back', { from: starPhase })
    if (interviewFeedback) {
      setStep(STEPS.INTERVIEW_FEEDBACK)
    } else if (result) {
      setStep(STEPS.RESULTS)
    } else {
      setStep(STEPS.MODE_SELECT)
    }
  }, [starPhase, interviewFeedback, result, setStep])

  // ── Placeholder ───────────────────────────────────────────────────────────
  const placeholder = starPhase === 'theory'
    ? 'Respondé "listo" para empezar a practicar...'
    : starFeedback
      ? 'Respondé "siguiente" o "de nuevo"...'
      : starAnswer.trim().length > 0 && starAnswer.trim().length < 40
        ? `${40 - starAnswer.trim().length} caracteres más para enviar`
        : 'Tu respuesta STAR...'

  return (
    <ChatInterface
      title="Entrenador STAR"
      subtitle={subtitle}
      messages={messages}
      inputValue={starAnswer}
      onInputChange={setStarAnswer}
      onSend={handleSend}
      sendDisabled={starLoading}
      inputPlaceholder={placeholder}
      onBack={handleBack}
    />
  )
}

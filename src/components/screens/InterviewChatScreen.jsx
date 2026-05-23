import { useState, useCallback, useRef, useEffect } from 'react'
import { trackEvent } from '../../constants'
import ChatInterface from '../ChatInterface'

let _id = 0
const nid = () => ++_id

function coachMsg(text) { return { id: nid(), role: 'coach', text } }
function userMsg(text) { return { id: nid(), role: 'user', text } }
function systemMsg(text) { return { id: nid(), role: 'system', text } }

// Per-type typing simulation delay with ±15% jitter
const TYPE_BASE_MS = { intro: 1400, reaction: 900, question: null, followup: 1200, closing: 2000 }
function getDelay(type, text = '') {
  const base = type === 'question'
    ? Math.min(Math.max(text.length * 16, 400), 2200)
    : (TYPE_BASE_MS[type] ?? 1000)
  return base * (0.85 + Math.random() * 0.30)
}

// ─── ClosingSummary inline card ────────────────────────────────────────────────
const NIVEL_COLOR = { 'Básico': '#ef4444', 'Intermedio': '#f97316', 'Sólido': '#10b981', 'Premium': '#6366f1' }

function ClosingSummary({ summary, onRetrain, retrainLabel }) {
  if (!summary) return null
  const lvlColor = NIVEL_COLOR[summary.nivel] ?? '#6366f1'
  return (
    <div className="mx-4 mb-4 rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(0,119,181,0.15)', background: 'white', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #0077B5, #0ea5e9)' }}>
        <div>
          <p className="text-white font-bold text-2xl leading-none">
            {summary.score}<span className="text-sm font-normal opacity-80">/10</span>
          </p>
          <p className="text-white text-xs opacity-90 mt-0.5">Puntaje de sesión</p>
        </div>
        <span className="text-white text-sm font-semibold px-3 py-1.5 rounded-full"
          style={{ background: lvlColor }}>
          {summary.nivel}
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        {summary.fortalezas?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Fortalezas</p>
            {summary.fortalezas.map((f, i) => (
              <p key={i} className="text-sm text-slate-700 flex gap-2 items-start mb-1">
                <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>{f}
              </p>
            ))}
          </div>
        )}
        {summary.gaps?.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">A mejorar</p>
            {summary.gaps.map((g, i) => (
              <p key={i} className="text-sm text-slate-700 flex gap-2 items-start mb-1">
                <span className="text-amber-400 mt-0.5 shrink-0">△</span>{g}
              </p>
            ))}
          </div>
        )}
        {summary.tip && (
          <div className="p-3 rounded-xl"
            style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color: '#6366f1' }}>Consejo clave</p>
            <p className="text-sm text-slate-700">{summary.tip}</p>
          </div>
        )}
        {onRetrain && (
          <button
            onClick={onRetrain}
            className="w-full py-3 rounded-xl text-sm font-semibold spring-tap mt-1"
            style={{ background: 'linear-gradient(135deg, #0077B5, #0ea5e9)', color: 'white' }}
          >
            Practicar de nuevo{retrainLabel ? ` — ${retrainLabel}` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function InterviewChatScreen({
  questions,
  jobContext,
  interviewMode,
  callInterviewChat,
  onSessionComplete,
  onBack,
  onRetrain,
  retrainLabel,
}) {
  const totalQs = questions.length

  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [inputLocked, setInputLocked] = useState(true)
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [followupUsed, setFollowupUsed] = useState(false)
  const [exchanges, setExchanges] = useState([]) // rolling context: [{ userText, coachJson }]
  const [sessionDone, setSessionDone] = useState(false)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  const [initError, setInitError] = useState(false)

  // Stable refs to avoid stale closures in async callbacks
  const currentQIndexRef = useRef(0)
  const followupUsedRef = useRef(false)
  const exchangesRef = useRef([])
  useEffect(() => { currentQIndexRef.current = currentQIndex }, [currentQIndex])
  useEffect(() => { followupUsedRef.current = followupUsed }, [followupUsed])
  useEffect(() => { exchangesRef.current = exchanges }, [exchanges])

  // Build Gemini-format contents: last 2 exchanges as history + current user message
  const buildContents = useCallback((userText, exs) => {
    const history = exs.slice(-2).flatMap(ex => [
      { role: 'user', parts: [{ text: ex.userText }] },
      { role: 'model', parts: [{ text: ex.coachJson }] },
    ])
    return [...history, { role: 'user', parts: [{ text: userText }] }]
  }, [])

  const buildMeta = useCallback((qIndex, followup) => ({
    job_context: jobContext || '',
    questions: questions.map(q => q.pregunta),
    current_q_index: qIndex,
    total_questions: totalQs,
    followup_used: followup,
    mode: interviewMode || 'coaching',
  }), [jobContext, questions, totalQs, interviewMode])

  // Display coach messages one by one with per-type typing delays
  const enqueueMessages = useCallback(async (coachMsgs, response, snapQIndex) => {
    for (let i = 0; i < coachMsgs.length; i++) {
      const { type, text } = coachMsgs[i]
      const typingId = nid()
      setMessages(prev => [...prev, { id: typingId, role: 'coach', text: '', isTyping: true }])
      await new Promise(r => setTimeout(r, getDelay(type, text)))
      setMessages(prev => prev.map(m => m.id === typingId ? { id: typingId, role: 'coach', text } : m))
      if (i < coachMsgs.length - 1) await new Promise(r => setTimeout(r, 250))
    }

    const { next_q, done, summary: newSummary } = response

    if (done) {
      setSessionDone(true)
      if (newSummary) setSummary(newSummary)
      onSessionComplete?.(newSummary, exchangesRef.current)
    } else if (next_q !== null && next_q !== undefined && next_q !== snapQIndex) {
      setCurrentQIndex(next_q)
      setFollowupUsed(false)
      setMessages(prev => [...prev, systemMsg(`Pregunta ${next_q + 1} de ${totalQs}`)])
    } else if (coachMsgs.some(m => m.type === 'followup')) {
      setFollowupUsed(true)
    }

    setInputLocked(false)
  }, [totalQs, onSessionComplete])

  // Core AI turn: build context, call worker, sequence response messages
  const callAI = useCallback(async (userText, exs, qIndex, followup, isIntro = false) => {
    setError('')
    if (isIntro) setInitError(false)
    try {
      const contents = buildContents(userText, exs)
      const meta = buildMeta(qIndex, followup)
      const response = await callInterviewChat(contents, meta)
      if (!response?.messages?.length) throw new Error('Respuesta vacía del coach')

      setExchanges(prev => [...prev, { userText, coachJson: JSON.stringify(response) }])
      await enqueueMessages(response.messages, response, qIndex)
    } catch (err) {
      setError(err.message || 'Error al conectar con el coach. Intentá de nuevo.')
      if (isIntro) setInitError(true)
      setInputLocked(false)
    }
  }, [buildContents, buildMeta, callInterviewChat, enqueueMessages])

  // Fire intro turn on mount exactly once
  const introFiredRef = useRef(false)
  useEffect(() => {
    if (introFiredRef.current) return
    introFiredRef.current = true
    callAI('Comenzar', [], 0, false, true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || text.length < 20 || inputLocked || sessionDone) return

    const snap = {
      exs: [...exchangesRef.current],
      qIndex: currentQIndexRef.current,
      followup: followupUsedRef.current,
    }

    setMessages(prev => [...prev, userMsg(text)])
    setInputValue('')
    setInputLocked(true)
    setError('')

    trackEvent('interview_chat_answer', { q: snap.qIndex, mode: interviewMode })
    callAI(text, snap.exs, snap.qIndex, snap.followup)
  }, [inputValue, inputLocked, sessionDone, interviewMode, callAI])

  const subtitle = sessionDone
    ? 'Sesión completada ✓'
    : `Pregunta ${Math.min(currentQIndex + 1, totalQs)} de ${totalQs}`

  const headerRight = interviewMode === 'presion' ? (
    <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
      style={{ background: 'rgba(239,68,68,0.10)', color: '#ef4444' }}>
      Presión
    </span>
  ) : null

  const placeholder = sessionDone
    ? 'Sesión completada'
    : inputLocked
      ? 'Ramiro está escribiendo...'
      : inputValue.trim().length > 0 && inputValue.trim().length < 20
        ? `${20 - inputValue.trim().length} caracteres más para enviar`
        : 'Escribí tu respuesta (mín. 20 caracteres)...'

  const belowChat = (
    <>
      {error && (
        <div className="mx-4 mb-3 p-3 rounded-xl text-sm flex items-start justify-between gap-2"
          style={{ background: 'rgba(239,68,68,0.06)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.15)' }}>
          <span>{error}</span>
          <button
            className="shrink-0 text-xs font-semibold underline whitespace-nowrap"
            onClick={() => {
              setError('')
              if (initError) {
                introFiredRef.current = false
                setInitError(false)
                setInputLocked(true)
                callAI('Comenzar', [], 0, false, true)
              }
            }}
          >
            {initError ? 'Reintentar' : 'OK'}
          </button>
        </div>
      )}
      {sessionDone && (
        <ClosingSummary summary={summary} onRetrain={onRetrain} retrainLabel={retrainLabel} />
      )}
    </>
  )

  return (
    <ChatInterface
      title="Ramiro IA"
      subtitle={subtitle}
      messages={messages}
      inputValue={inputValue}
      onInputChange={setInputValue}
      onSend={handleSend}
      sendDisabled={inputLocked || sessionDone || inputValue.trim().length < 20}
      inputPlaceholder={placeholder}
      onBack={onBack}
      headerRight={headerRight}
      belowChat={belowChat}
      avatarSrc="/Ramiro.PNG"
    />
  )
}

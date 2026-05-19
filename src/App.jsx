import { useState, useRef, useEffect } from 'react'

const SYSTEM_PROMPT = `You are a calm health journal assistant. Log the user's current symptom episode quickly. Under 1 minute total.

CORE RULES:
- ONE question at a time, max 1 sentence
- No filler phrases. No diagnosis. No conclusions.
- Subtle emojis only: 🌙 💧 ☕ 🍜 — sparingly
- For any 1–5 scale question, say exactly: "X on a scale of 1–5?" — UI renders a slider
- Numbered lists for options (1. option per line)

REASONING APPROACH:
Do NOT follow a generic trigger checklist. Instead, reason from context:
- What time of day is it? Morning reflux → ask about last night's meal/sleep. Evening reflux → ask about today's meals.
- What did the user already mention? Use that to form the next question.
- Think like a detective: what happened in the hours BEFORE this symptom that could be relevant?
- Ask about the most likely cause first, not all possible causes.

QUESTION FLOW:
1. Ask severity first: "Severity on a scale of 1–5?"
2. Ask ONE timing/context question based on when they're experiencing it (morning vs afternoon vs evening vs night)
3. Ask ONE follow-up based on their answer
4. Ask: "Anything else you think might be related? Even a small thing." — this is the open field
5. Done. Summarize possible contributors in 1 line, gently.

TIMING CONTEXT REASONING (use to ask smarter questions, not as a checklist):
- Morning symptoms → likely related to: previous night (meal timing, alcohol, sleep quality, sleeping position)
- Midday symptoms → likely related to: morning habits (breakfast, coffee, hydration, stress start of day)
- Evening symptoms → likely related to: today's meals, afternoon stress, caffeine, energy levels
- Night symptoms → likely related to: dinner timing/content, day's cumulative stress, hydration throughout day

GENERAL TRIGGER KNOWLEDGE (background reasoning only, not a script):
Use this only if timing context isn't enough to form a smart question.
- Digestive (reflux, bloating, nausea): meal timing, food content, eating speed, stress, lying down
- Head (headache, migraine, brain fog): sleep, hydration, screen time, caffeine, meals, stress
- Energy (fatigue, dizziness): sleep quality, hydration, food intake, stress, iron/B12
- Skin (acne, rash): hormonal cycle, diet changes, stress, sleep, new products
- Respiratory/ENT (ear pressure, congestion): allergies, stress, posture, altitude, jaw
- Mood/mental (anxiety, stress): sleep, caffeine, workload, social dynamics, exercise
- Unknown symptom: ask timing, then sleep (1–5), stress (1–5), anything unusual

PERSONALIZATION:
Previous logs for this symptom: {PREVIOUS_LOGS}
If previous logs exist: check if current timing matches past patterns. Reference specific past triggers naturally.
Example: "Last time this was in the morning too — did you eat late the night before again? 🍜"
If pattern differs: "This one seems to be at a different time than usual 👀 — what's been different today?"

SYNTHESIS (after step 4 only):
"Possible contributors today: [2–3 specific things based on what they said]"
Never list generic triggers. Only reflect back what the user actually told you.`

const STORAGE_KEY = 'health-journal-logs'

const C = {
  bg: '#FDF8F3',
  surface: '#FFFFFF',
  text: '#2D2416',
  textSecondary: '#8C7B6B',
  textMuted: '#B5A898',
  green: '#4A7C59',
  terracotta: '#C4673A',
  amber: '#D4A84B',
  lightGreen: '#EAF2EC',
  lightTerracotta: '#FAF0EB',
  lightAmber: '#FDF4E0',
  border: '#EDE5D8',
}


const serif = "'Lora', 'Georgia', serif"

function getLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLog(entry) {
  const logs = getLogs()
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...logs]))
}

function deleteLog(id) {
  const logs = getLogs().filter((e) => e.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs))
}

function TypingIndicator() {
  return (
    <div
      className="flex gap-1 items-center px-4 py-3 rounded-2xl w-fit"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full animate-bounce"
          style={{ background: C.textMuted, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function parseAiResponse(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const items = []
  const preambleLines = []
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(.+)/)
    if (match) {
      items.push(match[1])
    } else if (items.length === 0) {
      preambleLines.push(line)
    }
  }
  if (items.length >= 2) {
    return { preamble: preambleLines.join(' '), items }
  }
  return null
}

function OptionCards({ items, onSelect }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(item)}
          className="text-left flex items-center gap-3 transition-opacity hover:opacity-75 active:opacity-60"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '10px 14px',
          }}
        >
          <span className="text-base leading-none" style={{ minWidth: 24, textAlign: 'center' }}>
            {extractLeadingEmoji(item) || '·'}
          </span>
          <span className="text-sm leading-snug" style={{ color: C.text }}>
            {stripLeadingEmoji(item)}
          </span>
        </button>
      ))}
    </div>
  )
}

function AiAvatar() {
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{ width: 28, height: 28, background: C.lightGreen }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </svg>
    </div>
  )
}

function SeveritySlider({ onSubmit }) {
  const [value, setValue] = useState(3)
  const pct = ((value - 1) / 4) * 100
  return (
    <div
      className="rounded-2xl px-3 py-2.5 flex flex-col gap-1.5"
      style={{ background: '#F5EFE8', border: `1px solid ${C.border}`, minWidth: 200, maxWidth: '85%' }}
    >
      <div className="flex items-center justify-between gap-3">
        <span style={{ fontSize: 20, fontWeight: 600, color: C.terracotta, fontFamily: serif, lineHeight: 1 }}>{value}</span>
        <button
          type="button"
          onClick={() => onSubmit(`${value} out of 5`)}
          className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 shrink-0"
          style={{ background: C.terracotta, color: '#fff' }}
        >
          Submit
        </button>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="severity-slider"
        style={{
          background: `linear-gradient(to right, ${C.amber} 0%, ${C.amber} ${pct}%, ${C.border} ${pct}%, ${C.border} 100%)`,
        }}
      />
      <div className="flex justify-between">
        <span style={{ fontSize: 10, color: C.textMuted }}>1 = barely noticeable</span>
        <span style={{ fontSize: 10, color: C.textMuted }}>5 = worst ever</span>
      </div>
    </div>
  )
}

const EMOJI_RE = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u

function extractLeadingEmoji(text) {
  const m = text.match(EMOJI_RE)
  return m ? m[0].trim() : null
}

function stripLeadingEmoji(text) {
  return text.replace(EMOJI_RE, '').trim()
}

function LogSavedScreen({ symptom, timestamp, onDone }) {
  const date = new Date(timestamp)
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: C.bg }}>
      <div className="w-full max-w-md flex flex-col items-center gap-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: C.lightGreen }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <p className="text-sm mb-2" style={{ color: C.textSecondary }}>Log saved</p>
          <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: serif, color: C.text }}>{symptom}</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>{formatted}</p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="mt-2 font-medium rounded-2xl px-8 py-3 text-sm transition-opacity hover:opacity-80"
          style={{ background: C.green, color: '#fff' }}
        >
          Done
        </button>
      </div>
    </div>
  )
}

function buildSystemPrompt(symptom) {
  const matching = getLogs()
    .filter((e) => e.symptom.toLowerCase() === symptom.toLowerCase())
    .slice(0, 3)
  const logsText = matching.length === 0
    ? 'None yet.'
    : matching.map((entry) => {
        const date = new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const sev = extractSeverity(entry) ?? 'unknown'
        const context = entry.summary ?? 'no summary'
        return `Log ${date}: severity ${sev}, context: ${context}`
      }).join('\n')
  return SYSTEM_PROMPT.replace('{PREVIOUS_LOGS}', logsText)
}

function ChatScreen({ symptom, onBack, onSaved }) {
  const [systemPrompt] = useState(() => buildSystemPrompt(symptom))
  const [messages, setMessages] = useState([
    { role: 'user', content: symptom },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef(null)
  const hasFired = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (!hasFired.current) {
      hasFired.current = true
      sendToApi([{ role: 'user', content: symptom }])
    }
  }, [])

  async function sendToApi(history) {
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          system: systemPrompt,
          messages: history,
        }),
      })
      const data = await res.json()
      if (!res.ok) console.error('API error response:', res.status, data)
      const raw = data.content?.[0]?.text ?? 'Sorry, something went wrong.'
      setMessages((prev) => [...prev, { role: 'assistant', content: raw }])
    } catch (err) {
      console.error('API call failed:', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Unable to reach the server. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleSend(override) {
    const text = (typeof override === 'string' ? override : input).trim()
    if (!text || loading) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    sendToApi(next)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSaveAndFinish() {
    setSaving(true)
    const timestamp = Date.now()
    let summaryCard = null
    let summaryText = null
    try {
      const transcript = messages
        .filter((m) => m.content)
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: 'Extract a structured summary from this health symptom conversation. Return ONLY valid JSON, no other text: {"fields":[{"label":"Symptom","value":"..."},{"label":"Started","value":"..."},{"label":"Severity","value":"..."},{"label":"Context","value":"..."}],"note":"one warm closing sentence"}. If a field was not discussed, use "Not mentioned" as the value.',
          messages: [{ role: 'user', content: transcript }],
        }),
      })
      const data = await res.json()
      const raw = data.content?.[0]?.text ?? ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        summaryCard = parsed
        summaryText = parsed.fields?.map((f) => `${f.label}: ${f.value}`).join(', ') ?? null
      }
    } catch {
      // proceed without summary card
    }
    const finalMessages = summaryCard
      ? [...messages, { role: 'assistant', summary: summaryCard }]
      : messages
    setMessages(finalMessages)
    saveLog({ id: timestamp.toString(), symptom, messages: finalMessages, summary: summaryText, timestamp })
    onSaved({ symptom, timestamp })
  }

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: C.bg }}>
      <div className="w-full max-w-md flex flex-col h-screen">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 pt-12 pb-4 shrink-0"
          style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}
        >
          <button
            type="button"
            onClick={onBack}
            className="transition-opacity hover:opacity-60 p-1 -ml-1"
            aria-label="Back"
            style={{ color: C.textSecondary }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <span className="font-semibold flex-1 text-base" style={{ fontFamily: serif, color: C.text }}>{symptom}</span>
          <button
            type="button"
            onClick={handleSaveAndFinish}
            disabled={saving}
            className="transition-opacity hover:opacity-60 disabled:opacity-30 p-1"
            aria-label="Save & finish"
            style={{ color: C.textMuted }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.map((msg, i) => {
            if (msg.summary) {
              const { fields, note } = msg.summary
              return (
                <div
                  key={i}
                  className="w-full rounded-2xl overflow-hidden mt-2 mb-1"
                  style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 6px rgba(45,36,22,0.06)' }}
                >
                  <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{ background: C.lightGreen, borderBottom: `1px solid ${C.border}` }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.green }}>Session Summary</span>
                  </div>
                  <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                    {fields?.map((f, j) => (
                      <div
                        key={j}
                        className="px-4 py-3"
                        style={{
                          borderRight: j % 2 === 0 ? `1px solid ${C.border}` : 'none',
                          borderBottom: j < fields.length - 2 ? `1px solid ${C.border}` : 'none',
                        }}
                      >
                        <p className="text-xs mb-1" style={{ color: C.textMuted }}>{f.label}</p>
                        <p className="text-sm font-medium leading-snug" style={{ color: C.text }}>{f.value}</p>
                      </div>
                    ))}
                  </div>
                  {note && (
                    <div className="px-4 py-3">
                      <p className="text-sm leading-relaxed" style={{ color: C.textSecondary }}>{note}</p>
                    </div>
                  )}
                </div>
              )
            }
            if (msg.role === 'assistant') {
              const parsed = parseAiResponse(msg.content)
              const isLast = i === messages.length - 1
              const isSeverityQ = (msg.content || '').toLowerCase().includes('scale of 1')
              return (
                <div key={i} className="flex items-end gap-2">
                  <AiAvatar />
                  <div className="flex flex-col gap-2 items-start flex-1 min-w-0">
                    {(parsed ? parsed.preamble : msg.content) && (
                      <div
                        className="max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                        style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderBottomLeftRadius: 6 }}
                      >
                        {parsed ? parsed.preamble : msg.content}
                      </div>
                    )}
                    {isSeverityQ && isLast && !loading && (
                      <SeveritySlider onSubmit={handleSend} />
                    )}
                    {!isSeverityQ && parsed && isLast && !loading && (
                      <OptionCards items={parsed.items} onSelect={handleSend} />
                    )}
                    {!isSeverityQ && parsed && !isLast && (
                      <div className="flex flex-col gap-1.5 w-full">
                        {parsed.items.map((item, j) => (
                          <div
                            key={j}
                            className="flex items-center gap-3 text-sm"
                            style={{ color: C.textSecondary, paddingLeft: 4 }}
                          >
                            <span style={{ minWidth: 20, textAlign: 'center', fontSize: 13 }}>
                              {extractLeadingEmoji(item) || '·'}
                            </span>
                            <span>{stripLeadingEmoji(item)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            }
            return (
              <div
                key={i}
                className="flex justify-end"
              >
                <div
                  className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                  style={{ background: C.terracotta, color: '#fff', borderBottomRightRadius: 6 }}
                >
                  {msg.content}
                </div>
              </div>
            )
          })}
          {loading && (
            <div className="flex justify-start">
              <TypingIndicator />
            </div>
          )}
          {(() => {
            const last = messages[messages.length - 1]
            const concluded = !loading && last?.role === 'assistant' && !last?.summary &&
              (last?.content || '').toLowerCase().includes('possible contributors')
            if (!concluded) return null
            return (
              <div className="flex justify-center pt-1 pb-1">
                <button
                  type="button"
                  onClick={handleSaveAndFinish}
                  disabled={saving}
                  className="font-medium rounded-2xl px-6 py-2.5 text-sm transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: C.terracotta, color: '#fff' }}
                >
                  {saving ? 'Saving…' : 'Save & finish'}
                </button>
              </div>
            )
          })()}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className="shrink-0 px-4 pb-8 pt-3 flex gap-2 items-end"
          style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="flex-1 resize-none rounded-2xl px-4 py-3 text-sm outline-none max-h-32 overflow-y-auto"
            style={{
              background: C.surface,
              color: C.text,
              border: `1px solid ${C.border}`,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-full w-10 h-10 flex items-center justify-center disabled:opacity-30 transition-opacity"
            style={{ background: C.terracotta, color: '#fff' }}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const PATTERNS_SYSTEM_PROMPT = `You are a longitudinal health pattern analyst.

Analyze the user's symptom logs and return ONLY valid JSON.

Do not return markdown, explanations, or extra text.

OUTPUT FORMAT:

{
  "summary": "One sentence describing the single strongest recurring pattern (max 15 words)",
  "insights": [
    {
      "title": "Short specific title",
      "body": "1-2 observational sentences grounded in actual logs",
      "tag": "frequency | timing | trigger | co_occurrence | sequence | deviation | action",
      "confidence": "weak | moderate | strong",
      "action": "Optional concrete observation or experiment"
    }
  ]
}

ANALYSIS GOAL:
Identify meaningful recurring patterns in the user's symptom history.

Focus on:
- recurring triggers
- symptom timing
- co-occurring symptoms
- behavioral sequences
- repeated lifestyle associations
- deviations from usual patterns

IMPORTANT:
Do NOT force insights.
Return fewer insights if evidence quality is weak.

It is better to return:
- 2 strong insights
than:
- 5 speculative ones.

EVIDENCE RULES:
Only surface patterns that:
- occur multiple times
- show strong contextual consistency
- are clearly supported by the logs

Avoid weak speculation.

Good:
"Morning reflux episodes repeatedly followed poor sleep and late meals."

Bad:
"Stress may be causing symptoms."

TEMPORAL REASONING:
Prioritize sequence-aware observations.

Strong observations identify:
- what happened BEFORE symptoms
- recurring time windows
- repeated behavioral patterns

Good:
"Reflux episodes often appeared 1–2 hours after coffee on empty stomach."

Weak:
"Coffee and reflux both appear in logs."

PERSONALIZATION:
Focus on THIS user's patterns.
Do not give generic wellness advice.

Every insight must reference:
- actual symptoms
- actual timing
- actual behaviors/triggers
from the logs.

DEVIATION DETECTION:
Meaningful deviations are valuable.

Example:
"Recent dizziness episodes occurred despite normal sleep, unlike earlier patterns."

UNCERTAINTY:
If evidence is inconsistent or limited:
- say so clearly
- lower confidence
- avoid overconfident conclusions

TONE:
- calm
- observational
- non-alarming
- specific
- reflective

Never:
- diagnose
- speculate about diseases
- give generic health advice
- moralize behavior

ACTION RULES:
Only include actions if strongly supported by repeated patterns.

Actions should be:
- lightweight
- experimental
- observational

Good:
"Could be worth noticing whether earlier dinners reduce next-morning reflux."

Bad:
"Improve your sleep hygiene."

INSIGHT TAG DEFINITIONS:
- frequency:
most recurring symptoms or behaviors

- timing:
time-of-day or sequence timing patterns

- trigger:
repeated lifestyle factors preceding symptoms

- co_occurrence:
symptoms that frequently appear together

- sequence:
ordered event chains before symptoms

- deviation:
episodes differing from historical patterns

- action:
small observational experiments grounded in evidence`

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

function renderMarkdown(text) {
  const lines = (text || '').split('\n')
  const elements = []
  let listItems = []
  let k = 0

  function flushList() {
    if (listItems.length === 0) return
    elements.push(
      <ul key={k++} style={{ margin: '2px 0 6px 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {listItems.map((item, i) => (
          <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: C.text, listStyleType: 'disc' }}>{renderInline(item)}</li>
        ))}
      </ul>
    )
    listItems = []
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) { flushList(); continue }
    if (t.startsWith('## ')) {
      flushList()
      elements.push(
        <p key={k++} style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: k > 1 ? 10 : 2, marginBottom: 3 }}>
          {t.slice(3)}
        </p>
      )
    } else if (t.startsWith('* ') || t.startsWith('- ')) {
      listItems.push(t.slice(2))
    } else {
      flushList()
      elements.push(
        <p key={k++} style={{ fontSize: 13, lineHeight: 1.55, color: C.text, margin: '2px 0' }}>
          {renderInline(t)}
        </p>
      )
    }
  }
  flushList()
  return elements
}

function getTimeOfDay(timestamp) {
  const h = new Date(timestamp).getHours()
  if (h >= 5 && h < 11) return 'Morning'
  if (h >= 11 && h < 16) return 'Midday'
  if (h >= 16 && h < 21) return 'Evening'
  return 'Night'
}

function PatternsScreen() {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [followUp, setFollowUp] = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState(null)
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const hasFired = useRef(false)
  const logs = getLogs()
  const allSymptoms = [...new Set(logs.map((e) => e.symptom).filter(Boolean))].sort()

  const TIME_SLOTS = ['Morning', 'Midday', 'Evening', 'Night']

  const freqMap = {}
  for (const entry of logs) {
    freqMap[entry.symptom] = (freqMap[entry.symptom] || 0) + 1
  }
  const freqData = Object.entries(freqMap).sort((a, b) => b[1] - a[1])
  const maxFreq = freqData[0]?.[1] || 1

  const timingMap = {}
  for (const entry of logs) {
    if (!timingMap[entry.symptom]) timingMap[entry.symptom] = { Morning: 0, Midday: 0, Evening: 0, Night: 0 }
    timingMap[entry.symptom][getTimeOfDay(entry.timestamp)]++
  }
  const uniqueSymptoms = Object.keys(timingMap).sort()
  const maxTimingCount = Math.max(1, ...Object.values(timingMap).flatMap((v) => Object.values(v)))

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    const summary = logs.map((entry) => ({
      symptom: entry.symptom,
      timestamp: new Date(entry.timestamp).toISOString(),
      conversation: entry.messages
        .filter((m) => m.content && (m.role !== 'user' || m.content !== entry.symptom))
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n'),
    }))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: PATTERNS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Here are my symptom logs:\n\n${JSON.stringify(summary, null, 2)}` }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || 'API error')
      const raw = data.content?.[0]?.text ?? ''
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Invalid response format')
      setAnalysis(JSON.parse(jsonMatch[0]))
    } catch (err) {
      console.error('Patterns API error:', err)
      setError('Unable to analyze patterns. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!hasFired.current && logs.length >= 2) {
      hasFired.current = true
      runAnalysis()
    }
  }, [])

  async function handleFollowUp() {
    const q = followUp.trim()
    if (!q || followUpLoading) return
    setFollowUpLoading(true)
    setFollowUp('')
    const summary = logs.map((entry) => ({
      symptom: entry.symptom,
      timestamp: new Date(entry.timestamp).toISOString(),
      summary: entry.summary,
    }))
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: `You are a health pattern analyst. The user has logged symptoms and wants to ask a follow-up question about their patterns.

If the user asks about seeing a doctor, what to tell a doctor, or how to describe their symptoms to a medical professional, respond using this exact structure with markdown headers:

## Patterns to mention
- [2-3 specific observed patterns from the logs, 1 sentence each]

## Questions to ask
- [3-4 specific questions grounded in the findings, 1 sentence each]

## Things to watch for
- [2-3 hypotheses worth validating, 1 sentence each]

Frame everything as "worth discussing" not "you have". Never diagnose.

For all other questions, answer specifically and gently based on the actual log data. Use markdown for structure when helpful (**bold** for key terms, ## for sections, - for lists). Never diagnose. Be concise and grounded in the logs.`,
          messages: [{ role: 'user', content: `My logs: ${JSON.stringify(summary, null, 2)}\n\nQuestion: ${q}` }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || 'API error')
      setFollowUpAnswer(data.content?.[0]?.text ?? 'No response.')
    } catch {
      setFollowUpAnswer('Unable to get a response. Please try again.')
    } finally {
      setFollowUpLoading(false)
    }
  }

  if (logs.length < 2) {
    return (
      <div className="flex-1 flex flex-col px-5 pt-12 pb-4">
        <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: serif, color: C.text }}>Patterns</h1>
        <p className="text-sm mb-10" style={{ color: C.textSecondary }}>{logs.length} of 2 logs needed</p>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-center" style={{ color: C.textMuted }}>
            Log at least 2 symptoms to see patterns.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-12 pb-8 flex flex-col gap-5">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: serif, color: C.text }}>Patterns</h1>
        <p className="text-sm" style={{ color: C.textSecondary }}>{logs.length} log{logs.length !== 1 ? 's' : ''} analyzed</p>
      </div>

      {/* AI Insights */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-6">
          <TypingIndicator />
          <p className="text-sm" style={{ color: C.textSecondary }}>Analyzing your logs…</p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <p className="text-sm" style={{ color: '#B54B2A' }}>{error}</p>
          <button type="button" onClick={runAnalysis} className="self-start text-sm transition-opacity hover:opacity-70" style={{ color: C.textSecondary }}>
            Try again →
          </button>
        </div>
      )}

      {analysis && (
        <>
          {/* Summary — green card */}
          <div className="rounded-2xl px-4 py-3" style={{ background: '#EAF2EC' }}>
            <p className="text-sm leading-relaxed" style={{ color: C.text, fontFamily: serif }}>{analysis.summary}</p>
          </div>

          {/* Bullet insights + follow-up — white card */}
          <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 8px rgba(45,36,22,0.06)' }}>
            <div className="flex items-center gap-2">
              <AiAvatar />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.green }}>AI Insights</span>
            </div>
            {analysis.insights?.length > 0 && (
              <div className="flex flex-col">
                {analysis.insights.map((insight, i) => {
                  const confColor = insight.confidence === 'strong' ? '#4A7C59' : insight.confidence === 'moderate' ? '#92631A' : '#8C7B6B'
                  const confBg = insight.confidence === 'strong' ? C.lightGreen : insight.confidence === 'moderate' ? C.lightAmber : '#F0EAE2'
                  const tagLabel = (insight.tag || '').replace(/_/g, ' ')
                  return (
                    <div key={i} className="flex flex-col gap-1.5 py-3" style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: C.lightTerracotta, color: C.terracotta }}>{tagLabel}</span>
                        {insight.confidence && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: confBg, color: confColor }}>{insight.confidence}</span>
                        )}
                      </div>
                      {insight.title && (
                        <p className="text-sm font-semibold" style={{ color: C.text }}>{insight.title}</p>
                      )}
                      <p className="text-sm leading-relaxed" style={{ color: C.text }}>{insight.body}</p>
                      {insight.action && (
                        <p className="text-sm leading-relaxed" style={{ color: '#92631A', fontStyle: 'italic' }}>💡 {insight.action}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="pt-2 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
              {followUpAnswer && (
                <div className="flex items-start gap-2">
                  <AiAvatar />
                  <div className="flex-1 rounded-2xl px-3 py-2.5" style={{ background: C.lightGreen, color: C.text }}>
                    {renderMarkdown(followUpAnswer)}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFollowUp() } }}
                  placeholder="Ask a follow-up…"
                  className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                />
                <button
                  type="button"
                  onClick={handleFollowUp}
                  disabled={!followUp.trim() || followUpLoading}
                  className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ background: C.terracotta, color: '#fff' }}
                >
                  {followUpLoading ? '…' : 'Ask'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Most Frequent Symptoms */}
      <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 8px rgba(45,36,22,0.06)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.green }}>Most Frequent</span>
        <div className="flex flex-col gap-2.5">
          {freqData.map(([symptom, count]) => {
            const color = getSymptomColor(symptom, allSymptoms)
            const pct = (count / maxFreq) * 100
            return (
              <div key={symptom} className="flex items-center gap-2.5">
                <span className="shrink-0" style={{ color: C.textSecondary, width: 90, fontSize: 12, lineHeight: 1.35 }}>{symptom}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, background: C.border }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="text-xs shrink-0 text-right" style={{ color: C.textMuted, width: 16 }}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Timing Patterns */}
      <div className="rounded-2xl px-4 py-4 flex flex-col gap-3" style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 8px rgba(45,36,22,0.06)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.green }}>Timing Patterns</span>
        <div className="flex" style={{ marginLeft: 120 }}>
          {TIME_SLOTS.map((slot) => (
            <div key={slot} className="flex-1 text-center" style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{slot}</div>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {uniqueSymptoms.map((symptom) => {
            const color = getSymptomColor(symptom, allSymptoms)
            return (
              <div key={symptom} className="flex items-start">
                <span className="shrink-0" style={{ color: C.textSecondary, width: 120, paddingRight: 10, fontSize: 12, lineHeight: 1.35 }}>{symptom}</span>
                {TIME_SLOTS.map((slot) => {
                  const count = timingMap[symptom][slot]
                  const size = count === 0 ? 0 : Math.max(18, 8 + Math.round((count / maxTimingCount) * 20))
                  const fontSize = count === 1 ? 9 : count <= 3 ? 10 : 11
                  return (
                    <div key={slot} className="flex-1 flex items-center justify-center" style={{ height: 36 }}>
                      {count > 0 && (
                        <div
                          className="rounded-full flex items-center justify-center"
                          style={{ width: size, height: size, background: color, opacity: 0.85 }}
                          title={`${count}×`}
                        >
                          <span style={{ fontSize, color: '#fff', fontWeight: 700, lineHeight: 1 }}>{count}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const SYMPTOM_PALETTE = ['#C4673A', '#D4A84B', '#9B7FD4', '#4A9B8F', '#6B8CAE', '#4A7C59', '#D4874A', '#8C7B6B']

function getSymptomColor(symptom, allSymptoms) {
  const sorted = [...allSymptoms].sort()
  const idx = sorted.indexOf(symptom)
  return SYMPTOM_PALETTE[(idx >= 0 ? idx : 0) % SYMPTOM_PALETTE.length]
}

function extractSeverity(entry) {
  const text = [entry.summary || '', ...(entry.messages || []).map((m) => m.content || '')].join(' ')
  const m = text.match(/(\d+)\s*(?:\/\s*10|out of 10)/i) || text.match(/severity[:\s]+(\d+)/i)
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 10) return n }
  return null
}

function getDotSize(severity, mode) {
  if (mode === 'week') {
    if (severity === null) return 22
    if (severity <= 3) return 18
    if (severity <= 6) return 26
    return 34
  }
  if (severity === null) return 11
  if (severity <= 3) return 8
  if (severity <= 6) return 11
  return 14
}

function getWeekStart(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}


function NavArrows({ onPrev, onNext, label }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <button type="button" onClick={onPrev} className="w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-60" style={{ color: C.textSecondary }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <span className="text-sm font-medium" style={{ fontFamily: serif, color: C.text }}>{label}</span>
      <button type="button" onClick={onNext} className="w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-60" style={{ color: C.textSecondary }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>
  )
}

function LogModal({ entry, onClose, onViewFull, onDelete, allSymptoms }) {
  const [confirming, setConfirming] = useState(false)
  const color = getSymptomColor(entry.symptom, allSymptoms)
  const dt = new Date(entry.timestamp)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const summaryMsg = entry.messages?.find((m) => m.summary)
  const fields = summaryMsg?.summary?.fields
  const note = summaryMsg?.summary?.note

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-5"
      style={{ background: 'rgba(45,36,22,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: C.surface, boxShadow: '0 8px 32px rgba(45,36,22,0.22)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ background: color + '22', color }}>
            {entry.symptom}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-60"
              style={{ background: C.lightTerracotta, color: C.terracotta }}
              aria-label="Delete log"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-60"
              style={{ background: C.bg, color: C.textSecondary }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* Date & time */}
        <div className="px-4 pb-3">
          <p style={{ fontSize: 12, color: C.textMuted }}>{dateStr} · {timeStr}</p>
        </div>

        {/* Summary fields */}
        {fields && fields.length > 0 && (
          <div className="mx-4 mb-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-2">
              {fields.map((f, i) => (
                <div
                  key={i}
                  className="px-3 py-2.5"
                  style={{
                    background: i % 2 === 0 ? C.lightGreen : C.surface,
                    borderRight: i % 2 === 0 ? `1px solid ${C.border}` : 'none',
                    borderBottom: i < fields.length - 2 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <p style={{ fontSize: 10, color: C.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                  <p style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{f.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        {note && (
          <p className="px-4 pb-3 text-sm leading-relaxed" style={{ color: C.textSecondary, fontStyle: 'italic', fontFamily: serif }}>
            "{note}"
          </p>
        )}

        {/* Footer */}
        <div className="px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
          {confirming ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-sm text-center" style={{ color: C.text }}>Delete this log?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: C.bg, color: C.textSecondary, border: `1px solid ${C.border}` }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { onDelete(entry.id); onClose() }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: C.terracotta, color: '#fff' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onViewFull}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: C.terracotta, color: '#fff' }}
            >
              View full log →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConversationView({ entry, onBack }) {
  const dt = new Date(entry.timestamp)
  const dateStr = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-12 pb-4 shrink-0" style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
        <button type="button" onClick={onBack} className="transition-opacity hover:opacity-60 p-1 -ml-1" style={{ color: C.textSecondary }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate" style={{ fontFamily: serif, color: C.text }}>{entry.symptom}</p>
          <p style={{ fontSize: 11, color: C.textMuted }}>{dateStr}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {(entry.messages || []).map((msg, i) => {
          if (msg.summary) {
            const { fields, note } = msg.summary
            return (
              <div key={i} className="w-full rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: C.lightGreen, borderBottom: `1px solid ${C.border}` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Session Summary</span>
                </div>
                <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${C.border}` }}>
                  {fields?.map((f, j) => (
                    <div key={j} className="px-4 py-3" style={{ borderRight: j % 2 === 0 ? `1px solid ${C.border}` : 'none', borderBottom: j < fields.length - 2 ? `1px solid ${C.border}` : 'none' }}>
                      <p style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>{f.label}</p>
                      <p style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{f.value}</p>
                    </div>
                  ))}
                </div>
                {note && <div className="px-4 py-3"><p className="text-sm leading-relaxed" style={{ color: C.textSecondary }}>{note}</p></div>}
              </div>
            )
          }
          if (!msg.content) return null
          return (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { background: C.terracotta, color: '#fff', borderBottomRightRadius: 6 }
                  : { background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderBottomLeftRadius: 6 }}
              >
                {msg.content}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TimelineScreen() {
  const todayDate = new Date()
  const [viewMode, setViewMode] = useState('week')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [viewYear, setViewYear] = useState(todayDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth())
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [readOnlyEntry, setReadOnlyEntry] = useState(null)
  const [logs, setLogs] = useState(() => getLogs())
  const allSymptoms = [...new Set(logs.map((e) => e.symptom).filter(Boolean))].sort()

  function handleDelete(id) {
    deleteLog(id)
    setLogs((prev) => prev.filter((e) => e.id !== id))
  }

  const logsByDate = {}
  for (const entry of logs) {
    const d = new Date(entry.timestamp)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!logsByDate[key]) logsByDate[key] = []
    logsByDate[key].push(entry)
  }

  // Read-only conversation view
  if (readOnlyEntry) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: C.bg }}>
        <ConversationView entry={readOnlyEntry} onBack={() => setReadOnlyEntry(null)} />
      </div>
    )
  }

  // Week navigation
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d
  })
  const weekEnd = weekDays[6]
  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.toLocaleDateString('en-US', { month: 'long' })} ${weekStart.getDate()}–${weekEnd.getDate()}`
    : `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }

  // Month navigation
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const monthCells = [...Array(firstDayOfWeek).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  function prevMonth() { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) } else setViewMonth((m) => m - 1) }
  function nextMonth() { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) } else setViewMonth((m) => m + 1) }

  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  return (
    <div className="flex-1 overflow-y-auto px-4 pt-12 pb-6" style={{ background: C.bg }}>
      <h1 className="text-2xl font-semibold mb-4" style={{ fontFamily: serif, color: C.text }}>History</h1>

      {/* Week / Month toggle */}
      <div className="flex mb-5 rounded-xl overflow-hidden self-start" style={{ background: C.surface, border: `1px solid ${C.border}`, width: 'fit-content' }}>
        {['week', 'month'].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className="px-5 py-1.5 text-sm font-medium transition-colors capitalize"
            style={{
              background: viewMode === mode ? C.terracotta : 'transparent',
              color: viewMode === mode ? '#fff' : C.textSecondary,
            }}
          >
            {mode === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>

      {/* ── WEEK VIEW ── */}
      {viewMode === 'week' && (
        <>
          <NavArrows onPrev={prevWeek} onNext={nextWeek} label={weekLabel} />
          <div
            className="rounded-2xl overflow-hidden mb-5"
            style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 8px rgba(45,36,22,0.06)' }}
          >
            <div className="grid grid-cols-7">
              {weekDays.map((day, i) => {
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
                const dayLogs = logsByDate[key] || []
                const isToday = day.toDateString() === todayDate.toDateString()
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center py-3 gap-2"
                    style={{
                      borderRight: i < 6 ? `1px solid ${C.border}` : 'none',
                      background: isToday ? C.lightGreen : 'transparent',
                      minHeight: 90,
                    }}
                  >
                    <p style={{ fontSize: 9, fontWeight: 600, color: isToday ? C.green : C.textMuted, letterSpacing: '0.06em' }}>{DAY_NAMES[i]}</p>
                    <p style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? C.green : C.text }}>{day.getDate()}</p>
                    <div className="flex flex-col items-center gap-1.5">
                      {dayLogs.map((entry, di) => {
                        const size = getDotSize(extractSeverity(entry), 'week')
                        const color = getSymptomColor(entry.symptom, allSymptoms)
                        const initial = (entry.symptom || '?').charAt(0).toUpperCase()
                        return (
                          <button
                            key={di}
                            type="button"
                            onClick={() => setSelectedEntry(entry)}
                            className="rounded-full flex items-center justify-center font-bold transition-opacity hover:opacity-80 active:opacity-60 shrink-0"
                            style={{ width: size, height: size, background: color, color: '#fff', fontSize: Math.max(size * 0.38, 8), lineHeight: 1 }}
                          >
                            {initial}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── MONTH VIEW ── */}
      {viewMode === 'month' && (
        <>
          <NavArrows onPrev={prevMonth} onNext={nextMonth} label={monthLabel} />
          <div
            className="rounded-2xl overflow-hidden mb-5"
            style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: '0 1px 8px rgba(45,36,22,0.06)' }}
          >
            <div className="grid grid-cols-7 border-b" style={{ borderColor: C.border }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="py-2 text-center text-xs font-medium" style={{ color: C.textMuted }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthCells.map((day, i) => {
                if (!day) return <div key={i} style={{ minHeight: 52 }} />
                const key = `${viewYear}-${viewMonth}-${day}`
                const dayLogs = logsByDate[key] || []
                const isToday = day === todayDate.getDate() && viewMonth === todayDate.getMonth() && viewYear === todayDate.getFullYear()
                const hasBorderRight = (i + 1) % 7 !== 0
                const hasBorderBottom = i < monthCells.length - 7
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center pt-2 pb-1.5 gap-1"
                    style={{
                      minHeight: 52,
                      borderRight: hasBorderRight ? `1px solid ${C.border}` : 'none',
                      borderBottom: hasBorderBottom ? `1px solid ${C.border}` : 'none',
                      background: isToday ? C.lightGreen : 'transparent',
                    }}
                  >
                    <span
                      className="text-xs w-6 h-6 flex items-center justify-center rounded-full"
                      style={{ color: isToday ? C.green : C.text, fontWeight: isToday ? 700 : 400 }}
                    >
                      {day}
                    </span>
                    <div className="flex gap-0.5 flex-wrap justify-center" style={{ maxWidth: 36 }}>
                      {dayLogs.slice(0, 4).map((entry, di) => {
                        const size = getDotSize(extractSeverity(entry), 'month')
                        const color = getSymptomColor(entry.symptom, allSymptoms)
                        const initial = (entry.symptom || '?').charAt(0).toUpperCase()
                        return (
                          <button
                            key={di}
                            type="button"
                            onClick={() => setSelectedEntry(entry)}
                            className="rounded-full flex items-center justify-center font-bold transition-opacity hover:opacity-80 shrink-0"
                            style={{ width: size, height: size, background: color, color: '#fff', fontSize: Math.max(size * 0.45, 6) }}
                          >
                            {initial}
                          </button>
                        )
                      })}
                      {dayLogs.length > 4 && (
                        <span style={{ fontSize: 8, color: C.textMuted, lineHeight: 1, alignSelf: 'center' }}>+{dayLogs.length - 4}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Legend */}
      {allSymptoms.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 px-1">
          {allSymptoms.map((label) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 8, height: 8, background: getSymptomColor(label, allSymptoms), display: 'inline-block' }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {logs.length === 0 && (
        <p className="text-sm text-center mt-8" style={{ color: C.textMuted, fontFamily: serif, fontStyle: 'italic' }}>
          No logs yet. Start by writing a symptom.
        </p>
      )}

      {/* Modal */}
      {selectedEntry && (
        <LogModal
          entry={selectedEntry}
          allSymptoms={allSymptoms}
          onClose={() => setSelectedEntry(null)}
          onViewFull={() => { setSelectedEntry(null); setReadOnlyEntry(selectedEntry) }}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}


function HomeScreen({ onSelectSymptom }) {
  const [input, setInput] = useState('')
  const allLogs = getLogs()
  const allSymptoms = [...new Set(allLogs.map((e) => e.symptom).filter(Boolean))].sort()
  const symptoms = [...new Map(
    allLogs
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((e) => [e.symptom, e.symptom])
  ).values()]

  function handleSubmit() {
    const text = input.trim()
    if (!text) return
    onSelectSymptom(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="flex-1 overflow-y-auto flex flex-col justify-center" style={{ background: C.bg }}>
      <div className="px-4 py-8">
        {/* App title above card */}
        <p
          className="px-1 mb-3"
          style={{ fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 400, color: C.terracotta, letterSpacing: '0.15em', textTransform: 'uppercase' }}
        >
          Health Journal
        </p>

        {/* Journal page card */}
        <div
          className="rounded-2xl"
          style={{
            background: '#FFFEF9',
            boxShadow: '0 2px 16px rgba(45,36,22,0.08), 0 1px 4px rgba(45,36,22,0.04)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
        {/* Left margin rule */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 40,
            width: 2,
            bottom: 0,
            background: '#EDE8DF',
          }}
        />

        {/* Card content */}
        <div style={{ paddingLeft: 64, paddingRight: 20, paddingTop: 24, paddingBottom: 24 }}>
          {/* Date */}
          <p style={{ fontFamily: serif, fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
            {today}
          </p>

          {/* Prompt */}
          <h1 className="font-semibold leading-snug" style={{ fontFamily: serif, fontSize: 28, color: C.text, marginBottom: 28 }}>
            How are you feeling?
          </h1>

          {/* Journal-style input */}
          <div className="flex items-center gap-3" style={{ marginBottom: 0 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write here…"
              className="flex-1 outline-none"
              style={{
                background: 'transparent',
                color: C.text,
                border: 'none',
                borderBottom: '1.5px solid #C4B8A8',
                borderRadius: 0,
                padding: '10px 0',
                fontFamily: serif,
                fontSize: 15,
              }}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="shrink-0 rounded-full w-9 h-9 flex items-center justify-center disabled:opacity-25 transition-opacity"
              style={{ background: C.terracotta, color: '#fff' }}
              aria-label="Start"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>

          {/* Recent entries */}
          {symptoms.length === 0 ? (
            <p style={{ fontFamily: serif, fontSize: 13, color: C.textMuted, fontStyle: 'italic', marginTop: 24 }}>
              Your past entries will appear here.
            </p>
          ) : (
            <div style={{ marginTop: 24 }}>
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: C.textMuted, marginBottom: 10 }}>Recent entries</p>
              <div className="flex flex-wrap gap-2">
                {symptoms.map((symptom) => {
                  const color = getSymptomColor(symptom, allSymptoms)
                  return (
                    <button
                      key={symptom}
                      type="button"
                      onClick={() => onSelectSymptom(symptom)}
                      className="rounded-xl font-medium text-left transition-opacity hover:opacity-80"
                      style={{ background: color + '28', color, border: 'none', padding: '6px 12px', fontFamily: serif, fontStyle: 'italic', fontSize: 15 }}
                    >
                      {symptom}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

function TabBar({ activeTab, onTabChange }) {
  const tabs = [
    {
      id: 'home',
      label: 'Home',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <polyline points="9 21 9 12 15 12 15 21" />
        </svg>
      ),
    },
    {
      id: 'timeline',
      label: 'History',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      id: 'patterns',
      label: 'Patterns',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      ),
    },
  ]

  return (
    <div
      className="shrink-0 flex"
      style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors focus:outline-none"
            style={{ color: active ? C.terracotta : C.textMuted, outline: 'none' }}
            aria-label={tab.label}
          >
            {tab.icon}
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function App() {
  const [activeSymptom, setActiveSymptom] = useState(null)
  const [savedInfo, setSavedInfo] = useState(null)
  const [activeTab, setActiveTab] = useState('home')

  if (activeSymptom) {
    return (
      <ChatScreen
        symptom={activeSymptom}
        onBack={() => setActiveSymptom(null)}
        onSaved={(info) => {
          setActiveSymptom(null)
          setSavedInfo(info)
        }}
      />
    )
  }

  if (savedInfo) {
    return (
      <LogSavedScreen
        symptom={savedInfo.symptom}
        timestamp={savedInfo.timestamp}
        onDone={() => setSavedInfo(null)}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background: C.bg }}>
      <div className="w-full max-w-md flex flex-col h-screen">
        {activeTab === 'home' && <HomeScreen onSelectSymptom={setActiveSymptom} />}
        {activeTab === 'timeline' && <TimelineScreen />}
        {activeTab === 'patterns' && <PatternsScreen />}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  )
}

export default App

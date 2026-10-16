import { useEffect, useState, useRef } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe2,
  LoaderCircle,
  MessageSquare,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  XCircle,
} from 'lucide-react'

const API = 'http://127.0.0.1:8000'

export default function App() {
  const [task, setTask] = useState('Find the instructions for scholarship applicants.')
  const [selectedPortal, setSelectedPortal] = useState('up-scholarship')
  const [portals, setPortals] = useState([])
  const [mode, setMode] = useState('plan')
  const [busy, setBusy] = useState(false)
  const [apiStatus, setApiStatus] = useState('unknown')
  const [result, setResult] = useState(null)
  const [activeTask, setActiveTask] = useState(null)
  const [error, setError] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatBusy, setChatBusy] = useState(false)
  const [browserState, setBrowserState] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [events, setEvents] = useState([
    { kind: 'system', text: 'PortalPilot is ready. Browser automation and safety guardrails loaded.' },
  ])

  const pollIntervalRef = useRef(null)

  const addEvent = (kind, text) =>
    setEvents(current => [...current, { kind, text }])

  async function checkBackend() {
    try {
      const response = await fetch(`${API}/api/health`)
      if (!response.ok) throw new Error('Backend returned an error.')
      const data = await response.json()
      setApiStatus(data.status === 'ok' ? 'online' : 'unknown')
    } catch {
      setApiStatus('offline')
    }
  }

  async function fetchPortals() {
    try {
      const response = await fetch(`${API}/api/portals`)
      if (response.ok) {
        const data = await response.json()
        setPortals(data)
      }
    } catch {
      setPortals([])
    }
  }

  async function fetchBrowserState() {
    try {
      const response = await fetch(`${API}/api/browser/state`)
      if (response.ok) {
        const data = await response.json()
        setBrowserState(data.state)
        addEvent('success', `Active browser on: ${data.state?.title || 'Blank'}`)
      }
    } catch (err) {
      addEvent('error', 'Browser not currently inspecting a page.')
    }
  }

  useEffect(() => {
    checkBackend()
    fetchPortals()
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  async function planTask(event) {
    event?.preventDefault()
    const cleanTask = task.trim()
    if (!cleanTask || busy) return

    setBusy(true)
    setError('')
    setResult(null)
    setActiveTask(null)
    setEvents([
      { kind: 'system', text: `New task: ${cleanTask}` },
      { kind: 'system', text: 'Observing the portal and constructing structured plan…' },
    ])

    try {
      const response = await fetch(`${API}/api/portal/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: cleanTask }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || 'PortalPilot could not create a plan.')
      }

      setResult(data)
      setApiStatus('online')

      addEvent('success', `Observed: ${data.observation?.title || 'Portal page'}`)

      const plan = data.plan
      addEvent('success', `Plan proposed action: ${plan.action} (provider: ${plan.provider || 'AI'})`)

      if (plan.rationale) addEvent('system', plan.rationale)
      if (plan.target_url) addEvent('system', `Proposed destination: ${plan.target_url}`)

      addEvent(
        'system',
        data.executed
          ? 'The backend reports that an action was executed.'
          : 'Plan ready. No browser action was executed.'
      )
    } catch (err) {
      setError(err.message || 'Could not connect to the backend.')
      setApiStatus('offline')
      addEvent('error', err.message || 'Planning failed.')
    } finally {
      setBusy(false)
    }
  }

  async function executeAutonomousTask(event) {
    event?.preventDefault()
    const cleanTask = task.trim()
    if (!cleanTask || busy) return

    setBusy(true)
    setError('')
    setResult(null)
    setActiveTask(null)
    setEvents([
      { kind: 'system', text: `Initiating autonomous task: ${cleanTask}` },
      { kind: 'system', text: 'Launching agent harness with safety guardrails…' },
    ])

    try {
      const response = await fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective: cleanTask, portal_id: selectedPortal }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to create agent task.')
      }

      const initialTask = await response.json()
      setActiveTask(initialTask)
      addEvent('system', `Task ID created: ${initialTask.task_id.slice(0, 8)}…`)

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API}/api/tasks/${initialTask.task_id}`)
          if (!pollRes.ok) return
          const updated = await pollRes.json()
          setActiveTask(updated)

          if (updated.status === 'completed') {
            clearInterval(pollIntervalRef.current)
            setBusy(false)
            addEvent('success', `Task completed: ${updated.result || 'Finished.'}`)
            fetchBrowserState()
          } else if (updated.status === 'failed') {
            clearInterval(pollIntervalRef.current)
            setBusy(false)
            setError(updated.error || 'Task execution failed.')
            addEvent('error', `Task failed: ${updated.error}`)
          } else if (updated.status === 'cancelled') {
            clearInterval(pollIntervalRef.current)
            setBusy(false)
            addEvent('system', 'Task was cancelled.')
          } else if (updated.status === 'waiting_for_approval') {
            addEvent('system', `Awaiting user approval for ${updated.pending_action?.action_type || 'action'}.`)
          }
        } catch {
          clearInterval(pollIntervalRef.current)
          setBusy(false)
        }
      }, 1500)
    } catch (err) {
      setError(err.message || 'Failed to execute task.')
      setBusy(false)
      addEvent('error', err.message || 'Execution failed.')
    }
  }

  async function approvePendingAction() {
    if (!activeTask?.pending_action?.action_id) return
    try {
      addEvent('system', 'User approved pending action. Resuming execution…')
      const response = await fetch(`${API}/api/tasks/${activeTask.task_id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: activeTask.pending_action.action_id }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Approval failed.')
      }
    } catch (err) {
      setError(err.message)
      addEvent('error', err.message)
    }
  }

  async function cancelCurrentTask() {
    if (!activeTask?.task_id) return
    try {
      addEvent('system', 'Cancelling task…')
      const response = await fetch(`${API}/api/tasks/${activeTask.task_id}/cancel`, {
        method: 'POST',
      })
      if (response.ok) {
        addEvent('system', 'Cancellation request sent.')
      }
    } catch (err) {
      addEvent('error', 'Cancellation request failed.')
    }
  }

  async function sendAssistantMessage(event) {
    event?.preventDefault()
    const msg = chatMessage.trim()
    if (!msg || chatBusy) return

    setChatBusy(true)
    setChatHistory(prev => [...prev, { sender: 'user', text: msg }])
    setChatMessage('')

    try {
      const response = await fetch(`${API}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, portal_id: selectedPortal }),
      })
      if (!response.ok) throw new Error('Assistant response failed.')
      const data = await response.json()
      setChatHistory(prev => [...prev, { sender: 'assistant', text: data.response }])
    } catch (err) {
      setChatHistory(prev => [...prev, { sender: 'assistant', text: 'Error contacting assistant.' }])
    } finally {
      setChatBusy(false)
    }
  }

  const currentPortalDef = portals.find(p => p.id === selectedPortal) || {
    name: 'UP Scholarship',
    url: 'https://scholarship.up.gov.in/',
  }

  const plan = result?.plan
  const observation = result?.observation

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PortalPilot home">
          <span className="brand-mark"><Workflow size={21} /></span>
          <span>
            Portal<span className="brand-accent">Pilot</span>
            <small>GOVERNMENT SERVICES, GUIDED</small>
          </span>
        </a>

        <div className="topbar-right">
          <button
            className="icon-button"
            onClick={() => setShowChat(!showChat)}
            title="Toggle Assistant Chat"
            aria-label="Toggle Assistant Chat"
          >
            <MessageSquare size={16} />
          </button>
          <button
            className="icon-button"
            onClick={fetchBrowserState}
            title="Inspect active browser state"
            aria-label="Inspect active browser state"
          >
            <RefreshCw size={15} />
          </button>
          <span className={`status-dot ${apiStatus}`} />
          <span className="status-label">
            {apiStatus === 'online'
              ? 'Backend connected'
              : apiStatus === 'offline'
                ? 'Backend offline'
                : 'Checking connection'}
          </span>
          <button
            className="icon-button"
            onClick={checkBackend}
            title="Check backend connection"
            aria-label="Check backend connection"
          >
            <ArrowUpRight size={17} />
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          <Sparkles size={14} /> YOUR AI-POWERED PORTAL GUIDE
        </div>
        <h1>Government services,<br /><span>without the guesswork.</span></h1>
        <p>
          Tell PortalPilot what you need. It observes real portal pages, constructs safe
          actions, verifies outcomes, and keeps you in explicit control of sensitive steps.
        </p>
      </section>

      <section className="workspace">
        <div className="left-column">
          <form
            className="panel task-panel"
            onSubmit={mode === 'plan' ? planTask : executeAutonomousTask}
          >
            <div className="panel-heading">
              <div className="heading-icon"><Bot size={19} /></div>
              <div>
                <h2>What do you need help with?</h2>
                <p>Start with a goal in plain English.</p>
              </div>
            </div>

            <label className="field-label" htmlFor="task">YOUR TASK</label>
            <textarea
              id="task"
              value={task}
              onChange={event => setTask(event.target.value)}
              placeholder="e.g. Find the instructions for scholarship applicants or check registration form…"
              rows={3}
              maxLength={1000}
              disabled={busy}
            />

            <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
              <button
                type="button"
                className={`step-tag ${mode === 'plan' ? '' : 'muted'}`}
                style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', border: '1px solid #d4dfd7' }}
                onClick={() => setMode('plan')}
              >
                Plan Only (Safe)
              </button>
              <button
                type="button"
                className={`step-tag ${mode === 'execute' ? '' : 'muted'}`}
                style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', border: '1px solid #d4dfd7' }}
                onClick={() => setMode('execute')}
              >
                Autonomous Execution
              </button>
            </div>

            <div className="portal-chip">
              <Globe2 size={15} />
              <span>Target portal</span>
              <select
                value={selectedPortal}
                onChange={e => setSelectedPortal(e.target.value)}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#315f4d', fontWeight: 'bold', fontSize: '11px' }}
                disabled={busy}
              >
                {portals.length > 0 ? (
                  portals.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                ) : (
                  <option value="up-scholarship">UP Scholarship</option>
                )}
              </select>
              <a
                href={currentPortalDef.url}
                target="_blank"
                rel="noreferrer"
                title="Open portal destination"
              >
                <ExternalLink size={14} />
              </a>
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={busy || !task.trim()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : mode === 'plan' ? (
                <Sparkles size={18} />
              ) : (
                <Play size={18} />
              )}
              {busy
                ? mode === 'plan'
                  ? 'Planning your next step…'
                  : 'Running autonomous agent…'
                : mode === 'plan'
                  ? 'Ask PortalPilot to Plan'
                  : 'Start Autonomous Agent'}
              {!busy && <ArrowUpRight size={17} />}
            </button>

            <p className="helper-text">
              <ShieldCheck size={14} />
              {mode === 'plan'
                ? 'Planning mode: inspects page and proposes safe next action.'
                : 'Execution mode: navigates and verifies steps with human-in-the-loop safety.'}
            </p>
          </form>

          {activeTask?.status === 'waiting_for_approval' && activeTask.pending_action && (
            <div className="panel" style={{ padding: '16px', border: '2px solid #e08c38', background: '#fff9f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c26217', fontWeight: 'bold', fontSize: '13px' }}>
                <AlertTriangle size={18} /> ACTION REQUIRES EXPLICIT APPROVAL
              </div>
              <p style={{ fontSize: '12px', margin: '8px 0', color: '#7a4214' }}>
                {activeTask.pending_action.reason}
              </p>
              <div style={{ fontSize: '11px', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #ebd4c0', marginBottom: '12px' }}>
                <strong>Action:</strong> {activeTask.pending_action.action_type} | <strong>Target:</strong> {activeTask.pending_action.target}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: '#257a54', flex: 1, padding: '9px' }}
                  onClick={approvePendingAction}
                >
                  <CheckCircle2 size={15} /> Approve Safe Action
                </button>
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: '#b33939', flex: 1, padding: '9px' }}
                  onClick={cancelCurrentTask}
                >
                  <XCircle size={15} /> Cancel Task
                </button>
              </div>
            </div>
          )}

          {showChat && (
            <div className="panel" style={{ padding: '16px' }}>
              <div className="section-title">
                <MessageSquare size={16} /> <h2>Portal Assistant Chat</h2>
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '10px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {chatHistory.length === 0 && (
                  <p style={{ color: '#888', fontStyle: 'italic', margin: 0 }}>Ask any question grounded in the current portal state.</p>
                )}
                {chatHistory.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: item.sender === 'user' ? 'flex-end' : 'flex-start',
                      background: item.sender === 'user' ? '#e2efe7' : '#f0f3ee',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      maxWidth: '85%',
                    }}
                  >
                    <strong>{item.sender === 'user' ? 'You' : 'Assistant'}:</strong> {item.text}
                  </div>
                ))}
              </div>
              <form onSubmit={sendAssistantMessage} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={chatMessage}
                  onChange={e => setChatMessage(e.target.value)}
                  placeholder="Ask about guidelines, requirements, fields…"
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #d4dfd7', fontSize: '12px' }}
                  disabled={chatBusy}
                />
                <button
                  type="submit"
                  className="primary-button"
                  style={{ width: 'auto', padding: '8px 14px' }}
                  disabled={chatBusy || !chatMessage.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          )}

          <div className="panel steps-panel">
            <div className="section-title">
              <span>01</span><h2>How PortalPilot works</h2>
            </div>

            <div className="step-row">
              <div className="step-number"><Globe2 size={17} /></div>
              <div>
                <strong>Observe</strong>
                <p>Read the live page and extract headings, buttons, and safe form inputs.</p>
              </div>
              <span className="step-tag">Playwright</span>
            </div>

            <div className="step-row">
              <div className="step-number"><Bot size={17} /></div>
              <div>
                <strong>Plan</strong>
                <p>Gemma proposes structured actions grounded strictly in real content.</p>
              </div>
              <span className="step-tag">Gemma</span>
            </div>

            <div className="step-row">
              <div className="step-number"><ShieldCheck size={17} /></div>
              <div>
                <strong>Validate & verify</strong>
                <p>Enforce human control on OTP, passwords, and final submissions.</p>
              </div>
              <span className="step-tag muted">Harness</span>
            </div>
          </div>
        </div>

        <div className="right-column">
          <div className="panel activity-panel">
            <div className="activity-heading">
              <div>
                <h2><Terminal size={18} /> Agent activity</h2>
                <p>
                  {activeTask
                    ? `Task State: ${activeTask.status.toUpperCase()} (${activeTask.stage})`
                    : 'Live progress and observed results'}
                </p>
              </div>
              <span className="live-pill">
                <span /> {busy ? 'RUNNING' : activeTask?.status === 'waiting_for_approval' ? 'PAUSED' : 'READY'}
              </span>
            </div>

            {activeTask && (
              <div style={{ marginTop: '12px', background: '#f5f7f4', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
                <div style={{ background: '#257a54', height: '100%', width: `${activeTask.progress}%`, transition: 'width 0.3s' }} />
              </div>
            )}

            <div className="timeline">
              {events.map((event, index) => (
                <div
                  className={`timeline-item ${event.kind}`}
                  key={`${index}-${event.text}`}
                >
                  <div className="timeline-icon">
                    {event.kind === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : event.kind === 'error' ? (
                      <Circle size={16} />
                    ) : (
                      <Circle size={16} />
                    )}
                  </div>
                  <p>{event.text}</p>
                </div>
              ))}

              {busy && (
                <div className="timeline-item running">
                  <div className="timeline-icon">
                    <LoaderCircle className="spin" size={16} />
                  </div>
                  <p>Observing portal state and executing verified actions…</p>
                </div>
              )}
            </div>

            {error && <div className="error-box">{error}</div>}

            {activeTask && activeTask.steps?.length > 0 && (
              <div className="result-card" style={{ marginBottom: '12px' }}>
                <div className="result-label">
                  <CheckCircle2 size={16} /> EXECUTED STEPS ({activeTask.steps.length})
                </div>
                {activeTask.steps.map((st, i) => (
                  <div key={i} style={{ fontSize: '11px', marginTop: '6px', borderBottom: '1px dashed #d5e5db', paddingBottom: '4px' }}>
                    <strong>Step {st.step_number}:</strong> {st.action_type} on <code>{st.target}</code> &mdash; {st.verified ? 'Verified' : 'Unverified'}
                  </div>
                ))}
                {activeTask.result && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#27523f', fontWeight: '500' }}>
                    <strong>Outcome:</strong> {activeTask.result}
                  </div>
                )}
              </div>
            )}

            {result && (
              <div className="result-card">
                <div className="result-label">
                  <CheckCircle2 size={16} /> PLAN GENERATED
                </div>
                <h3>{observation?.title || 'Portal observation'}</h3>
                <p>{result.message}</p>

                {plan && (
                  <div className="plan-details">
                    <p><strong>Proposed action:</strong> {plan.action}</p>
                    <p><strong>Reasoning:</strong> {plan.rationale}</p>
                    {plan.response && <p>{plan.response}</p>}

                    {plan.target_url && (
                      <p className="proposed-link">
                        <strong>Proposed destination</strong><br />
                        <a
                          href={plan.target_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {plan.target_url} <ExternalLink size={13} />
                        </a>
                      </p>
                    )}
                  </div>
                )}

                {observation && (
                  <details className="observation-details">
                    <summary>
                      View page observation ({observation.links?.length || 0} links)
                    </summary>
                    <p><strong>Page:</strong> {observation.title}</p>
                    <p><strong>Headings:</strong></p>
                    <ul>
                      {observation.headings?.map((heading, index) => (
                        <li key={`${index}-${heading}`}>{heading}</li>
                      ))}
                    </ul>
                    <p><strong>Observed links:</strong></p>
                    <ul>
                      {observation.links?.slice(0, 10).map((link, index) => (
                        <li key={`${index}-${link.url}`}>
                          {link.text || link.url}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="helper-text">
                  <ShieldCheck size={14} />
                  {result.executed
                    ? 'The backend reports an action was executed.'
                    : 'Proposal only. No browser action was executed.'}
                </div>
              </div>
            )}

            {browserState && !result && !activeTask && (
              <div className="result-card">
                <div className="result-label">
                  <Globe2 size={16} /> LIVE BROWSER STATE
                </div>
                <h3>{browserState.title}</h3>
                <p style={{ fontSize: '11px' }}><strong>URL:</strong> {browserState.url}</p>
                <div style={{ fontSize: '11px' }}>
                  <strong>Interactive Fields ({browserState.fields?.length || 0}):</strong>
                  <ul>
                    {browserState.fields?.map((f, i) => (
                      <li key={i}>{f.label || f.selector} ({f.type})</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {!result && !error && !activeTask && !browserState && (
              <div className="empty-state">
                <div className="empty-icon"><Globe2 size={24} /></div>
                <strong>No portal activity yet</strong>
                <p>Submit a task to observe the site and generate an AI plan or execute autonomous navigation.</p>
              </div>
            )}
          </div>

          <div className="safety-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Human-in-the-Loop Safeguards</strong>
              <p>
                PortalPilot autonomously navigates allowlisted domains only. OTP entry,
                password authentication, and final application submission require explicit
                human authorization.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <span>PORTALPILOT <span className="footer-separator">/</span> OPEN-SOURCE AI AGENT</span>
        <span>Version 0.2.0 · Team CommitKebabs</span>
      </footer>
    </main>
  )
}

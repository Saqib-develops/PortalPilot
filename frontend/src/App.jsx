
import { useEffect, useState } from 'react'
import {
  ArrowUpRight, Bot, CheckCircle2, Circle, ExternalLink,
  Globe2, LoaderCircle, ShieldCheck, Sparkles, Terminal, Workflow,
} from 'lucide-react'

const API = 'http://127.0.0.1:8000'

export default function App() {
  const [task, setTask] = useState(
    'Find the instructions for scholarship applicants.'
  )
  const [busy, setBusy] = useState(false)
  const [apiStatus, setApiStatus] = useState('unknown')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [events, setEvents] = useState([
    { kind: 'system', text: 'PortalPilot is ready. No browser actions have run yet.' },
  ])

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

  useEffect(() => {
    checkBackend()
  }, [])

  async function planTask(event) {
    event?.preventDefault()

    const cleanTask = task.trim()
    if (!cleanTask || busy) return

    setBusy(true)
    setError('')
    setResult(null)
    setEvents([
      { kind: 'system', text: `New task: ${cleanTask}` },
      { kind: 'system', text: 'Observing the live UP Scholarship Portal…' },
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
      addEvent(
        'success',
        `Gemma proposed: ${plan.action}`
      )

      if (plan.rationale) addEvent('system', plan.rationale)

      if (plan.target_url) {
        addEvent('system', `Proposed destination: ${plan.target_url}`)
      }

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
          Tell PortalPilot what you need. It will inspect supported government
          websites, propose a next step, and keep you in control.
        </p>
      </section>

      <section className="workspace">
        <div className="left-column">
          <form className="panel task-panel" onSubmit={planTask}>
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
              placeholder="e.g. Find the documents required for a scholarship…"
              rows={4}
              maxLength={1000}
              disabled={busy}
            />

            <div className="portal-chip">
              <Globe2 size={15} />
              <span>Target portal</span>
              <strong>UP Scholarship</strong>
              <a
                href="https://scholarship.up.gov.in/"
                target="_blank"
                rel="noreferrer"
                title="Open official portal"
              >
                <ExternalLink size={14} />
              </a>
            </div>

            <button
              className="primary-button"
              type="submit"
              disabled={busy || !task.trim()}
            >
              {busy
                ? <LoaderCircle className="spin" size={18} />
                : <Sparkles size={18} />}
              {busy ? 'Planning your next step…' : 'Ask PortalPilot'}
              {!busy && <ArrowUpRight size={17} />}
            </button>

            <p className="helper-text">
              <ShieldCheck size={14} />
              Planning mode: no navigation or forms are executed.
            </p>
          </form>

          <div className="panel steps-panel">
            <div className="section-title">
              <span>01</span><h2>How PortalPilot works</h2>
            </div>

            <div className="step-row">
              <div className="step-number"><Globe2 size={17} /></div>
              <div>
                <strong>Observe</strong>
                <p>Read the live page and identify useful context.</p>
              </div>
              <span className="step-tag">Playwright</span>
            </div>

            <div className="step-row">
              <div className="step-number"><Bot size={17} /></div>
              <div>
                <strong>Plan</strong>
                <p>Gemma proposes a structured next action.</p>
              </div>
              <span className="step-tag">Gemma</span>
            </div>

            <div className="step-row">
              <div className="step-number"><ShieldCheck size={17} /></div>
              <div>
                <strong>Validate & verify</strong>
                <p>Check permissions before acting and confirm results.</p>
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
                <p>Live progress and observed results</p>
              </div>
              <span className="live-pill">
                <span /> {busy ? 'RUNNING' : 'READY'}
              </span>
            </div>

            <div className="timeline">
              {events.map((event, index) => (
                <div
                  className={`timeline-item ${event.kind}`}
                  key={`${index}-${event.text}`}
                >
                  <div className="timeline-icon">
                    {event.kind === 'success'
                      ? <CheckCircle2 size={16} />
                      : event.kind === 'error'
                        ? <Circle size={16} />
                        : <Circle size={16} />}
                  </div>
                  <p>{event.text}</p>
                </div>
              ))}

              {busy && (
                <div className="timeline-item running">
                  <div className="timeline-icon">
                    <LoaderCircle className="spin" size={16} />
                  </div>
                  <p>Waiting for observation and AI planning…</p>
                </div>
              )}
            </div>

            {error && <div className="error-box">{error}</div>}

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

            {!result && !error && (
              <div className="empty-state">
                <div className="empty-icon"><Globe2 size={24} /></div>
                <strong>No portal activity yet</strong>
                <p>Submit a task to observe the site and generate an AI plan.</p>
              </div>
            )}
          </div>

          <div className="safety-note">
            <ShieldCheck size={18} />
            <div>
              <strong>You stay in control</strong>
              <p>
                PortalPilot is currently in planning-only mode. It does not
                navigate automatically, fill forms, or submit applications.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <span>PORTALPILOT <span className="footer-separator">/</span> OPEN-SOURCE AI AGENT</span>
        <span>Prototype v0.1 · Planning-only mode</span>
      </footer>
    </main>
  )
}


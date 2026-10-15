import { useState } from 'react'
import {
  ArrowUpRight, Bot, CheckCircle2, Circle, ExternalLink,
  Globe2, LoaderCircle, ShieldCheck, Sparkles, Terminal, Workflow,
} from 'lucide-react'

const API = 'http://127.0.0.1:8000'

export default function App() {
  const [task, setTask] = useState('Help me find the scholarship application instructions.')
  const [busy, setBusy] = useState(false)
  const [apiStatus, setApiStatus] = useState('unknown')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [events, setEvents] = useState([
    { kind: 'system', text: 'PortalPilot is ready. No browser actions have run yet.' },
  ])

  const addEvent = (kind, text) => setEvents(current => [...current, { kind, text }])

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

  async function inspectPortal() {
    setBusy(true)
    setError('')
    setResult(null)
    addEvent('system', 'Starting a read-only inspection of the live UP Scholarship portal…')
    try {
      const response = await fetch(`${API}/api/portal/inspect`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Portal inspection failed.')
      setResult(data)
      setApiStatus('online')
      addEvent('success', `Observed page title: ${data.title}`)
      addEvent('success', `Verified destination: ${data.url}`)
    } catch (err) {
      setError(err.message || 'Could not connect to the backend.')
      setApiStatus('offline')
      addEvent('error', err.message || 'Inspection failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="PortalPilot home">
          <span className="brand-mark"><Workflow size={21} /></span>
          <span>Portal<span className="brand-accent">Pilot</span><small>GOVERNMENT SERVICES, GUIDED</small></span>
        </a>
        <div className="topbar-right">
          <span className={`status-dot ${apiStatus}`} />
          <span className="status-label">{apiStatus === 'online' ? 'Backend connected' : apiStatus === 'offline' ? 'Backend offline' : 'Checking connection'}</span>
          <button className="icon-button" onClick={checkBackend} title="Check backend connection"><ArrowUpRight size={17} /></button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={14} /> YOUR AI-POWERED PORTAL GUIDE</div>
        <h1>Government services,<br /><span>without the guesswork.</span></h1>
        <p>Tell PortalPilot what you need. It will help navigate supported government websites, explain the next steps, and keep you in control.</p>
      </section>

      <section className="workspace">
        <div className="left-column">
          <div className="panel task-panel">
            <div className="panel-heading">
              <div className="heading-icon"><Bot size={19} /></div>
              <div><h2>What do you need help with?</h2><p>Start with a goal in plain English.</p></div>
            </div>
            <label className="field-label" htmlFor="task">YOUR TASK</label>
            <textarea id="task" value={task} onChange={e => setTask(e.target.value)} placeholder="e.g. Help me find the documents required for a scholarship…" rows={4} />
            <div className="portal-chip"><Globe2 size={15} /><span>Target portal</span><strong>UP Scholarship</strong><a href="https://scholarship.up.gov.in/" target="_blank" rel="noreferrer" title="Open official portal"><ExternalLink size={14} /></a></div>
            <button className="primary-button" onClick={inspectPortal} disabled={busy || !task.trim()}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {busy ? 'Inspecting live portal…' : 'Start read-only inspection'}
              {!busy && <ArrowUpRight size={17} />}
            </button>
            <p className="helper-text"><ShieldCheck size={14} /> First milestone is read-only. No login, form filling, or submission.</p>
          </div>

          <div className="panel steps-panel">
            <div className="section-title"><span>01</span><h2>How PortalPilot works</h2></div>
            <div className="step-row"><div className="step-number"><Globe2 size={17} /></div><div><strong>Observe</strong><p>Read the live page and identify useful context.</p></div><span className="step-tag">Browser</span></div>
            <div className="step-row"><div className="step-number"><Bot size={17} /></div><div><strong>Plan</strong><p>AI proposes a structured next action.</p></div><span className="step-tag muted">Gemma next</span></div>
            <div className="step-row"><div className="step-number"><ShieldCheck size={17} /></div><div><strong>Validate & verify</strong><p>Check permissions before acting and confirm the result.</p></div><span className="step-tag muted">Harness</span></div>
          </div>
        </div>

        <div className="right-column">
          <div className="panel activity-panel">
            <div className="activity-heading"><div><h2><Terminal size={18} /> Agent activity</h2><p>Live progress and observed results</p></div><span className="live-pill"><span /> {busy ? 'RUNNING' : 'READY'}</span></div>
            <div className="timeline">
              {events.map((event, index) => (
                <div className={`timeline-item ${event.kind}`} key={`${index}-${event.text}`}>
                  <div className="timeline-icon">{event.kind === 'success' ? <CheckCircle2 size={16} /> : event.kind === 'error' ? <Circle size={16} /> : <Circle size={16} />}</div>
                  <p>{event.text}</p>
                </div>
              ))}
              {busy && <div className="timeline-item running"><div className="timeline-icon"><LoaderCircle className="spin" size={16} /></div><p>Waiting for the browser to report the page state…</p></div>}
            </div>
            {error && <div className="error-box">{error}</div>}
            {result && <div className="result-card"><div className="result-label"><CheckCircle2 size={16} /> INSPECTION COMPLETE</div><h3>{result.title}</h3><p>{result.message}</p><a href={result.url} target="_blank" rel="noreferrer">{result.url} <ExternalLink size={13} /></a></div>}
            {!result && !error && <div className="empty-state"><div className="empty-icon"><Globe2 size={24} /></div><strong>No portal activity yet</strong><p>Start an inspection to see what the browser observes.</p></div>}
          </div>
          <div className="safety-note"><ShieldCheck size={18} /><div><strong>You stay in control</strong><p>PortalPilot will pause for sensitive steps like OTPs, CAPTCHAs, and final submissions. This starter only inspects the public homepage.</p></div></div>
        </div>
      </section>

      <footer><span>PORTALPILOT <span className="footer-separator">/</span> OPEN-SOURCE AI AGENT</span><span>Prototype v0.1 · Read-only mode</span></footer>
    </main>
  )
}

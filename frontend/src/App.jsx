import { useEffect, useState, useRef } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Camera,
  CheckCircle2,
  Circle,
  Compass,
  ExternalLink,
  Eye,
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
  const [customUrl, setCustomUrl] = useState('https://')
  const [portals, setPortals] = useState([])
  const [mode, setMode] = useState('execute')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [busy, setBusy] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [apiStatus, setApiStatus] = useState('unknown')
  const [result, setResult] = useState(null)
  const [activeTask, setActiveTask] = useState(null)
  const [error, setError] = useState('')
  const [crawlData, setCrawlData] = useState(null)
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatBusy, setChatBusy] = useState(false)
  const [browserState, setBrowserState] = useState(null)
  const [showAccessDialog, setShowAccessDialog] = useState(false)
  const [accessGranted, setAccessGranted] = useState(false)
  const [accessConfirmed, setAccessConfirmed] = useState(false)
  const [events, setEvents] = useState([
    { kind: 'system', text: 'PortalPilot ready. Launch live browser or start autonomous agent.' },
  ])

  const pollIntervalRef = useRef(null)
  const pendingAccessActionRef = useRef(null)
  const accessGrantedRef = useRef(false)

  function requestAgentAccess(action) {
    if (accessGrantedRef.current) {
      action()
      return
    }
    pendingAccessActionRef.current = action
    setAccessConfirmed(false)
    setShowAccessDialog(true)
  }

  function grantAgentAccess() {
    if (!accessConfirmed) return
    accessGrantedRef.current = true
    setAccessGranted(true)
    setShowAccessDialog(false)
    addEvent('system', 'User granted page access for this session.')
    const action = pendingAccessActionRef.current
    pendingAccessActionRef.current = null
    action?.()
  }

  function revokeAgentAccess() {
    accessGrantedRef.current = false
    setAccessGranted(false)
    setAccessConfirmed(false)
    addEvent('system', 'Page access revoked for new agent tasks.')
  }

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
    if (!accessGrantedRef.current) {
      requestAgentAccess(() => fetchBrowserState())
      return
    }
    try {
      const response = await fetch(`${API}/api/browser/state`)
      if (response.ok) {
        const data = await response.json()
        setBrowserState(data.state)
        setScreenshotUrl(`${API}/api/browser/screenshot?t=${Date.now()}`)
        addEvent('success', `Inspected active browser page: ${data.state?.title || 'Active'}`)
      }
    } catch {
      addEvent('error', 'Browser not currently inspecting an active page.')
    }
  }

  async function launchLiveBrowser() {
    if (!accessGrantedRef.current) {
      requestAgentAccess(() => launchLiveBrowser())
      return
    }
    setBusy(true)
    const targetLabel = selectedPortal === 'custom' ? customUrl : selectedPortal
    addEvent('system', `Opening targeted website (${targetLabel}) with on-page bubble chatbot…`)
    try {
      const body = selectedPortal === 'custom'
        ? { portal_id: 'portalpilot-demo', custom_url: customUrl }
        : { portal_id: selectedPortal }
      const res = await fetch(`${API}/api/browser/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to launch browser.')
      }
      const data = await res.json()
      addEvent('success', `Target website opened in a new browser tab: ${data.title} (${data.url})`)
      addEvent('system', 'Floating bubble chatbot injected and active on target page.')
      await fetchBrowserState()
      setActiveTab('live')
    } catch (err) {
      setError(err.message)
      addEvent('error', err.message)
    } finally {
      setBusy(false)
    }
  }

  async function startLiveCrawl() {
    if (!accessGrantedRef.current) {
      requestAgentAccess(() => startLiveCrawl())
      return
    }
    setCrawling(true)
    addEvent('system', 'Crawling target website structure, links, sections, and fields…')
    try {
      const res = await fetch(`${API}/api/browser/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: task.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Live crawl failed. Ensure browser is open.')
      }
      const data = await res.json()
      setCrawlData(data.crawl)
      addEvent('success', `Crawl complete for "${task.trim() || 'the current page'}": ${data.crawl.query_matches?.length || 0} relevant results, ${data.crawl.links_discovered} links, and ${data.crawl.interactive_fields?.length || 0} form fields.`)
      setActiveTab('crawl')
    } catch (err) {
      setError(err.message)
      addEvent('error', err.message)
    } finally {
      setCrawling(false)
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
    if (!accessGrantedRef.current) {
      requestAgentAccess(() => planTask())
      return
    }
    const cleanTask = task.trim()
    if (!cleanTask || busy) return

    setBusy(true)
    setError('')
    setResult(null)
    setActiveTask(null)
    setEvents([
      { kind: 'system', text: `Planning task: ${cleanTask}` },
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
      addEvent('system', 'Plan ready. No browser action was executed.')
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
    if (!accessGrantedRef.current) {
      requestAgentAccess(() => executeAutonomousTask())
      return
    }
    const cleanTask = task.trim()
    if (!cleanTask || busy) return

    setBusy(true)
    setError('')
    setResult(null)
    setActiveTask(null)
    setEvents([
      { kind: 'system', text: `Initiating autonomous task: ${cleanTask}` },
      { kind: 'system', text: 'Opening targeted site and executing live navigation loop…' },
    ])

    try {
      const body = selectedPortal === 'custom'
        ? { objective: cleanTask, portal_id: 'portalpilot-demo', custom_url: customUrl, access_confirmed: true }
        : { objective: cleanTask, portal_id: selectedPortal, access_confirmed: true }
      const response = await fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to create agent task.')
      }

      const initialTask = await response.json()
      setActiveTask(initialTask)
      setScreenshotUrl(`${API}/api/browser/screenshot?t=${Date.now()}`)
      setActiveTab('dashboard')
      addEvent('system', `Task ID created: ${initialTask.task_id.slice(0, 8)}…`)

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API}/api/tasks/${initialTask.task_id}`)
          if (!pollRes.ok) return
          const updated = await pollRes.json()
          setActiveTask(updated)
          setScreenshotUrl(`${API}/api/browser/screenshot?t=${Date.now()}`)

          if (updated.status === 'completed') {
            clearInterval(pollIntervalRef.current)
            setBusy(false)
            setBrowserState(updated.last_verified_state || null)
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
    } catch {
      addEvent('error', 'Cancellation request failed.')
    }
  }

  async function sendAssistantMessage(event) {
    event?.preventDefault()
    const msg = chatMessage.trim()
    if (msg && !accessGrantedRef.current) {
      requestAgentAccess(() => sendAssistantMessage())
      return
    }
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
      setChatHistory(prev => [...prev, { sender: 'assistant', text: err.message || 'Could not contact the assistant.' }])
    } finally {
      setChatBusy(false)
    }
  }

  const currentPortalDef = portals.find(p => p.id === selectedPortal) || {
    name: selectedPortal === 'up-scholarship' ? 'UP Scholarship Portal' : 'PortalPilot Safe Demo Playground',
    url: selectedPortal === 'up-scholarship'
      ? 'https://scholarship.up.gov.in/'
      : 'http://127.0.0.1:8000/fixture/demo-portal',
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
            onClick={() => {
              if (accessGrantedRef.current) {
                revokeAgentAccess()
              } else {
                setAccessConfirmed(false)
                setShowAccessDialog(true)
              }
            }}
            title={accessGranted ? 'Revoke PortalPilot page access' : 'Review PortalPilot page access'}
            aria-label={accessGranted ? 'Revoke PortalPilot page access' : 'Review PortalPilot page access'}
          >
            <ShieldCheck size={15} />
          </button>
          <button
            className="icon-button"
            onClick={fetchBrowserState}
            title="Refresh active browser page state"
            aria-label="Refresh active browser page state"
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
          <Sparkles size={14} /> LIVE BROWSER AGENT & ON-PAGE BUBBLE CHATBOT
        </div>
        <h1>Targeted website navigation,<br /><span>with live crawling & guidance.</span></h1>
        <p>
          Select a government portal or demo fixture. Launch the real browser with an on-page
          floating bubble chatbot, crawl live page structures, and execute safe goal-directed actions.
        </p>
      </section>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`step-tag ${activeTab === 'dashboard' ? '' : 'muted'}`}
          style={{ cursor: 'pointer', padding: '8px 16px', fontSize: '12px', borderRadius: '8px', border: '1px solid #d4dfd7' }}
          onClick={() => setActiveTab('dashboard')}
        >
          <Bot size={14} style={{ display: 'inline', marginRight: '6px' }} /> Agent Workspace
        </button>
        <button
          className={`step-tag ${activeTab === 'live' ? '' : 'muted'}`}
          style={{ cursor: 'pointer', padding: '8px 16px', fontSize: '12px', borderRadius: '8px', border: '1px solid #d4dfd7' }}
          onClick={() => { setActiveTab('live'); fetchBrowserState(); }}
        >
          <Camera size={14} style={{ display: 'inline', marginRight: '6px' }} /> Live Browser View
        </button>
        <button
          className={`step-tag ${activeTab === 'crawl' ? '' : 'muted'}`}
          style={{ cursor: 'pointer', padding: '8px 16px', fontSize: '12px', borderRadius: '8px', border: '1px solid #d4dfd7' }}
          onClick={() => { setActiveTab('crawl'); if (!crawlData) startLiveCrawl(); }}
        >
          <Compass size={14} style={{ display: 'inline', marginRight: '6px' }} /> Live Site Crawl
        </button>
        <button
          className={`step-tag ${activeTab === 'chat' ? '' : 'muted'}`}
          style={{ cursor: 'pointer', padding: '8px 16px', fontSize: '12px', borderRadius: '8px', border: '1px solid #d4dfd7' }}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={14} style={{ display: 'inline', marginRight: '6px' }} /> Assistant Dialogue
        </button>
      </div>

      {activeTab === 'dashboard' && (
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
                  <p>Choose your portal, launch browser, or submit goal.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: '#0f766e', padding: '10px 14px', fontSize: '11px', flex: 1 }}
                  onClick={launchLiveBrowser}
                  disabled={busy}
                >
                  <Eye size={15} /> Open Live Browser & Chatbot
                </button>
                <button
                  type="button"
                  className="primary-button"
                  style={{ background: '#2563eb', padding: '10px 14px', fontSize: '11px', flex: 1 }}
                  onClick={startLiveCrawl}
                  disabled={crawling}
                >
                  {crawling ? <LoaderCircle className="spin" size={15} /> : <Compass size={15} />} Live Crawl Site
                </button>
              </div>

              <label className="field-label" htmlFor="task">NATURAL-LANGUAGE GOAL</label>
              <textarea
                id="task"
                value={task}
                onChange={event => setTask(event.target.value)}
                placeholder="e.g. Find instructions for applicants, or fill student name as Aarav Sharma…"
                rows={3}
                maxLength={1000}
                disabled={busy}
              />

              <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
                <button
                  type="button"
                  className={`step-tag ${mode === 'execute' ? '' : 'muted'}`}
                  style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', border: '1px solid #d4dfd7' }}
                  onClick={() => setMode('execute')}
                >
                  Autonomous Execution
                </button>
                <button
                  type="button"
                  className={`step-tag ${mode === 'plan' ? '' : 'muted'}`}
                  style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', border: '1px solid #d4dfd7' }}
                  onClick={() => setMode('plan')}
                >
                  Plan Only (Safe)
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
                    <>
                      <option value="up-scholarship">UP Scholarship Portal</option>
                      <option value="portalpilot-demo">PortalPilot Safe Demo Playground</option>
                    </>
                  )}
                  <option value="custom">🌐 Custom URL (any website)</option>
                </select>
                <a
                  href="#"
                  onClick={event => { event.preventDefault(); launchLiveBrowser() }}
                  title="Open portal in a new browser tab with PortalPilot"
                >
                  <ExternalLink size={14} />
                </a>
              </div>

              {selectedPortal === 'custom' && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '8px 12px' }}>
                  <Globe2 size={14} style={{ color: '#047857', flexShrink: 0 }} />
                  <input
                    type="url"
                    value={customUrl}
                    onChange={e => setCustomUrl(e.target.value)}
                    placeholder="https://example.gov.in/"
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '12px', color: '#064e3b', outline: 'none', fontFamily: 'monospace' }}
                    disabled={busy}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); launchLiveBrowser(); } }}
                  />
                  <button
                    type="button"
                    onClick={launchLiveBrowser}
                    disabled={busy || !customUrl.startsWith('https://')}
                    style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Go
                  </button>
                </div>
              )}

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
                    : 'Execute on Target Website'}
                {!busy && <ArrowUpRight size={17} />}
              </button>

              <p className="helper-text">
                <ShieldCheck size={14} />
                {accessGranted
                  ? 'Page access is approved for this workspace. You can revoke it from the shield button above.'
                  : 'Review and approve page access before PortalPilot inspects or controls the portal.'}
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

            <div className="panel steps-panel">
              <div className="section-title">
                <span>01</span><h2>Live Crawling & On-Page Chatbot</h2>
              </div>

              <div className="step-row">
                <div className="step-number"><Globe2 size={17} /></div>
                <div>
                  <strong>Target Portal Opened</strong>
                  <p>Playwright loads the chosen URL with an on-page bubble chatbot.</p>
                </div>
                <span className="step-tag">Chromium</span>
              </div>

              <div className="step-row">
                <div className="step-number"><Compass size={17} /></div>
                <div>
                  <strong>Live Crawling & Discovery</strong>
                  <p>Recursively indexes navigation routes, sections, and input fields.</p>
                </div>
                <span className="step-tag">Crawler</span>
              </div>

              <div className="step-row">
                <div className="step-number"><ShieldCheck size={17} /></div>
                <div>
                  <strong>Safe Guided Execution</strong>
                  <p>Highlights targets, verifies fields, and halts on sensitive operations.</p>
                </div>
                <span className="step-tag muted">Harness</span>
              </div>
            </div>
          </div>

          <div className="right-column">
            {(screenshotUrl || activeTask) && (
              <div className="panel live-preview-panel">
                <div className="activity-heading">
                  <div>
                    <h2><Eye size={17} /> Live portal movement</h2>
                    <p>
                      {activeTask?.last_verified_state?.title || browserState?.title || 'Waiting for the first browser frame'}
                    </p>
                    {(activeTask?.last_verified_state?.url || browserState?.url) && (
                      <p className="live-preview-url">
                        {activeTask?.last_verified_state?.url || browserState?.url}
                      </p>
                    )}
                  </div>
                  <span className="live-pill">
                    <span /> {busy ? 'LIVE' : 'PORTAL'}
                  </span>
                </div>
                {screenshotUrl ? (
                  <img
                    className="live-preview-image"
                    src={screenshotUrl}
                    alt="Refreshing screenshot of the live UP Scholarship portal"
                  />
                ) : (
                  <div className="live-preview-placeholder">
                    <LoaderCircle className="spin" size={19} />
                    <span>Opening the live portal…</span>
                  </div>
                )}
                {activeTask && (
                  <p className="live-preview-stage">
                    Agent: {activeTask.stage.replaceAll('_', ' ')} · {activeTask.progress}%
                  </p>
                )}
              </div>
            )}
            <div className="panel activity-panel">
              <div className="activity-heading">
                <div>
                  <h2><Terminal size={18} /> Live agent activity</h2>
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
                    <p>Executing live browser actions and inspecting page state…</p>
                  </div>
                )}
              </div>

              {error && <div className="error-box">{error}</div>}

              {activeTask && activeTask.steps?.length > 0 && (
                <div className="result-card" style={{ marginBottom: '12px' }}>
                  <div className="result-label">
                    <CheckCircle2 size={16} /> EXECUTED ACTIONS ({activeTask.steps.length})
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
                          <a href={plan.target_url} target="_blank" rel="noreferrer">
                            {plan.target_url} <ExternalLink size={13} />
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {browserState && !result && !activeTask && (
                <div className="result-card">
                  <div className="result-label">
                    <Globe2 size={16} /> CURRENT BROWSER STATE
                  </div>
                  <h3>{browserState.title}</h3>
                  <p style={{ fontSize: '11px' }}><strong>URL:</strong> {browserState.url}</p>
                  <div style={{ fontSize: '11px' }}>
                    <strong>Interactive Form Fields ({browserState.fields?.length || 0}):</strong>
                    <ul>
                      {browserState.fields?.slice(0, 5).map((f, i) => (
                        <li key={i}>{f.label || f.selector} ({f.type})</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {!result && !error && !activeTask && !browserState && (
                <div className="empty-state">
                  <div className="empty-icon"><Globe2 size={24} /></div>
                  <strong>No active session yet</strong>
                  <p>Click "Open Live Browser & Chatbot" or run an autonomous task to interact with the target site.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'live' && (
        <section className="panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px' }}>Live Browser Viewport & Bubble Chatbot</h2>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: '12px' }}>
                Real-time snapshot of the Playwright browser window with on-page chatbot.
              </p>
            </div>
            <button className="primary-button" style={{ width: 'auto', padding: '8px 16px' }} onClick={fetchBrowserState}>
              <RefreshCw size={14} /> Refresh Snapshot
            </button>
          </div>

          {screenshotUrl ? (
            <div style={{ border: '2px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#000', textAlign: 'center' }}>
              <img
                src={screenshotUrl}
                alt="Live browser screenshot"
                style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
              />
            </div>
          ) : (
            <div className="empty-state">
              <Camera size={32} style={{ color: '#888', marginBottom: '10px' }} />
              <strong>No live screenshot available</strong>
              <p>Launch the live browser to capture real-time page renders and on-page chatbot state.</p>
              <button className="primary-button" style={{ width: 'auto', marginTop: '12px' }} onClick={launchLiveBrowser}>
                Launch Live Browser
              </button>
            </div>
          )}
        </section>
      )}

      {activeTab === 'crawl' && (
        <section className="panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px' }}>Live Site Crawl & Structural Discovery</h2>
              <p style={{ margin: '4px 0 0', color: '#666', fontSize: '12px' }}>
                Discovered navigation routes, content sections, and input fields on the targeted website.
              </p>
            </div>
            <button className="primary-button" style={{ width: 'auto', padding: '8px 16px' }} onClick={startLiveCrawl} disabled={crawling}>
              {crawling ? <LoaderCircle className="spin" size={14} /> : <Compass size={14} />} Re-Crawl Site
            </button>
          </div>

          {crawlData ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '13px', margin: '0 0 10px', color: '#0f172a' }}>Navigation Routes ({crawlData.navigation_menu?.length || 0})</h3>
                <ul style={{ fontSize: '12px', paddingLeft: '20px', margin: 0 }}>
                  {crawlData.navigation_menu?.map((nav, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>
                      <strong>{nav.text}</strong>: <code style={{ color: '#0f766e' }}>{nav.href}</code>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '13px', margin: '0 0 10px', color: '#0f172a' }}>Form Fields Discovered ({crawlData.interactive_fields?.length || 0})</h3>
                <ul style={{ fontSize: '12px', paddingLeft: '20px', margin: 0 }}>
                  {crawlData.interactive_fields?.map((f, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>
                      <strong>{f.label || f.selector}</strong> <span style={{ color: '#64748b' }}>({f.type})</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '13px', margin: '0 0 10px', color: '#0f172a' }}>Page Sections & Content Blocks ({crawlData.sections?.length || 0})</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  {crawlData.sections?.map((sec, i) => (
                    <div key={i} style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <strong style={{ fontSize: '12px', color: '#1e293b' }}>{sec.title || `Section ${i + 1}`}</strong>
                      <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0' }}>{sec.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <Compass size={32} style={{ color: '#888', marginBottom: '10px' }} />
              <strong>No crawl data yet</strong>
              <p>Click "Re-Crawl Site" to automatically discover navigation menus and interactive elements.</p>
            </div>
          )}
        </section>
      )}

      {activeTab === 'chat' && (
        <section className="panel" style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>
          <div className="section-title">
            <MessageSquare size={18} /> <h2>Portal Assistant Chat</h2>
          </div>
          <p style={{ fontSize: '12px', color: '#666', marginTop: '-8px', marginBottom: '16px' }}>
            Ask questions grounded strictly in the current page content and portal documentation.
          </p>

          <div style={{ minHeight: '260px', maxHeight: '400px', overflowY: 'auto', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            {chatHistory.length === 0 && (
              <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 'auto', textAlign: 'center' }}>
                Ask anything about scholarship eligibility, documents, or navigation steps.
              </p>
            )}
            {chatHistory.map((item, i) => (
              <div
                key={i}
                style={{
                  alignSelf: item.sender === 'user' ? 'flex-end' : 'flex-start',
                  background: item.sender === 'user' ? '#10b981' : '#ffffff',
                  color: item.sender === 'user' ? '#ffffff' : '#1e293b',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  maxWidth: '85%',
                  fontSize: '13px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  border: item.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                }}
              >
                <strong>{item.sender === 'user' ? 'You' : 'PortalPilot'}:</strong> {item.text}
              </div>
            ))}
          </div>

          <form onSubmit={sendAssistantMessage} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={chatMessage}
              onChange={e => setChatMessage(e.target.value)}
              placeholder="Ask about guidelines, income limits, registration requirements…"
              style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              disabled={chatBusy}
            />
            <button
              type="submit"
              className="primary-button"
              style={{ width: 'auto', padding: '10px 18px' }}
              disabled={chatBusy || !chatMessage.trim()}
            >
              {chatBusy ? <LoaderCircle className="spin" size={15} /> : 'Send'}
            </button>
          </form>
        </section>
      )}

      {showAccessDialog && (
        <div className="access-dialog-backdrop" role="presentation">
          <section
            className="access-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-dialog-title"
          >
            <div className="access-dialog-icon"><ShieldCheck size={22} /></div>
            <h2 id="access-dialog-title">What PortalPilot can access</h2>
            <p className="access-dialog-intro">
              For <strong>{selectedPortal === 'custom' ? customUrl : currentPortalDef.name}</strong>, the agent can:
            </p>
            <ul className="access-capabilities">
              <li>Read visible page text, headings, page title, and URL to answer your request.</li>
              <li>Discover visible links, buttons, and form labels/types; navigate and scroll the live page.</li>
              <li>Click relevant links and fill ordinary fields only when your request calls for it.</li>
            </ul>
            <div className="access-boundary">
              <strong>It will not read or enter passwords, OTPs, or CAPTCHA codes, or submit, pay, or delete for you.</strong>
              <span>Those sensitive actions stay blocked or pause for your separate approval.</span>
            </div>
            <label className="access-consent">
              <input
                type="checkbox"
                checked={accessConfirmed}
                onChange={event => setAccessConfirmed(event.target.checked)}
              />
              <span>I understand and allow PortalPilot to access this portal for my request.</span>
            </label>
            <div className="access-dialog-actions">
              <button
                type="button"
                className="access-cancel-button"
                onClick={() => {
                  pendingAccessActionRef.current = null
                  setShowAccessDialog(false)
                  setAccessConfirmed(false)
                }}
              >
                Not now
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!accessConfirmed}
                onClick={grantAgentAccess}
              >
                Allow access & continue
              </button>
            </div>
          </section>
        </div>
      )}

      <footer>
        <span>PORTALPILOT <span className="footer-separator">/</span> OPEN-SOURCE AI AGENT</span>
        <span>Version 0.2.0 · Team CommitKebabs</span>
      </footer>
    </main>
  )
}

(function() {
  function initialize() {
  if (document.getElementById('portalpilot-bubble-root') || !document.body) return;

  const style = document.createElement('style');
  style.id = 'portalpilot-bubble-styles';
  style.textContent = `
    #portalpilot-bubble-root {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      color: #1e293b;
    }
    #portalpilot-bubble-btn {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981, #047857);
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: white;
      border: 3px solid #ffffff;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #portalpilot-bubble-btn:hover {
      transform: scale(1.06);
      box-shadow: 0 10px 28px rgba(16, 185, 129, 0.5);
    }
    #portalpilot-bubble-window {
      width: min(360px, calc(100vw - 32px));
      max-height: min(520px, calc(100vh - 110px));
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      margin-bottom: 14px;
      transition: opacity 0.2s, transform 0.2s;
    }
    .pp-header {
      background: #0f172a;
      color: #ffffff;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pp-title {
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pp-badge {
      background: #10b981;
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 10px;
    }
    .pp-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
    }
    .pp-page-status {
      background: #f8fafc;
      padding: 8px 14px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      color: #475569;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pp-revoke-access {
      padding: 3px 7px;
      border: 1px solid #dbe3e9;
      border-radius: 6px;
      color: #475569;
      background: #ffffff;
      font-size: 9px;
      cursor: pointer;
    }
    .pp-quick-actions {
      display: flex;
      gap: 6px;
      padding: 10px 14px;
      overflow-x: auto;
      background: #ffffff;
      border-bottom: 1px solid #f1f5f9;
    }
    .pp-access-notice {
      padding: 10px 14px;
      border-bottom: 1px solid #e2e8f0;
      color: #475569;
      background: #f8fafc;
      font-size: 10px;
      line-height: 1.5;
    }
    .pp-access-notice strong {
      display: block;
      margin-bottom: 4px;
      color: #1e293b;
      font-size: 11px;
    }
    .pp-access-notice ul {
      margin: 4px 0 8px;
      padding-left: 17px;
    }
    .pp-access-consent {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-top: 6px;
    }
    .pp-access-consent input {
      flex-shrink: 0;
      margin: 1px 0 0;
    }
    .pp-chip {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .pp-chip:hover {
      background: #d1fae5;
    }
    .pp-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: min(260px, calc(100vh - 300px));
      background: #f8fafc;
    }
    .pp-msg {
      padding: 9px 12px;
      border-radius: 10px;
      max-width: 85%;
      line-height: 1.45;
      font-size: 12px;
      word-break: break-word;
    }
    .pp-msg-agent {
      align-self: flex-start;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .pp-msg-user {
      align-self: flex-end;
      background: #10b981;
      color: #ffffff;
    }
    .pp-msg-error {
      color: #9f1239;
      border-color: #fecdd3;
      background: #fff1f2;
    }
    .pp-input-row {
      display: flex;
      padding: 10px 12px;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
      gap: 8px;
    }
    .pp-input-row input {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
      outline: none;
    }
    .pp-input-row input:focus {
      border-color: #10b981;
    }
    .pp-send-btn {
      background: #10b981;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      font-weight: 600;
    }
    .portalpilot-highlight {
      outline: 3px solid #10b981 !important;
      outline-offset: 3px !important;
      background-color: rgba(16, 185, 129, 0.15) !important;
      transition: all 0.3s ease !important;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'portalpilot-bubble-root';

  const windowEl = document.createElement('div');
  windowEl.id = 'portalpilot-bubble-window';

  windowEl.innerHTML = `
    <div class="pp-header">
      <div class="pp-title">
        <span>🌐 PortalPilot</span>
        <span class="pp-badge">LIVE AGENT</span>
      </div>
      <button class="pp-close-btn" id="pp-toggle-minimize">&times;</button>
    </div>
    <div class="pp-page-status">
      <span id="pp-current-title">Observing: \${document.title.slice(0, 32)}</span>
      <button type="button" class="pp-revoke-access" id="pp-revoke-access">Revoke access</button>
    </div>
    <div class="pp-quick-actions">
      <button class="pp-chip" id="pp-act-crawl">🔍 Crawl Page Links</button>
      <button class="pp-chip" id="pp-act-inspect">📋 Highlight Form Fields</button>
      <button class="pp-chip" id="pp-act-guide">📖 Find Guidelines</button>
    </div>
    <div class="pp-access-notice" id="pp-access-notice">
      <strong>What the agent can access</strong>
      <ul>
        <li>Visible page text, headings, links, buttons, and form labels/types.</li>
        <li>Scroll, click relevant links, navigate, and fill ordinary fields when requested.</li>
      </ul>
      Passwords, OTPs, CAPTCHA, final submission, payments, and deletion stay blocked or require separate approval.
      <label class="pp-access-consent">
        <input type="checkbox" id="pp-access-checkbox" />
        <span>I understand and allow page access for this tab.</span>
      </label>
      <button type="button" class="pp-chip" id="pp-access-grant" disabled>Allow page access</button>
    </div>
    <div class="pp-messages" id="pp-msg-thread">
      <div class="pp-msg pp-msg-agent">
        Hello! I am PortalPilot. Tell me where you want to go or what to find, and I will navigate the live portal with you.
      </div>
    </div>
    <form class="pp-input-row" id="pp-chat-form">
      <input type="text" id="pp-input-box" placeholder="Try: Open student registration…" />
      <button type="submit" class="pp-send-btn">Send</button>
    </form>
  `;

  const btn = document.createElement('div');
  btn.id = 'portalpilot-bubble-btn';
  btn.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `;

  root.appendChild(windowEl);
  root.appendChild(btn);
  document.body.appendChild(root);

  let accessGranted = sessionStorage.getItem('portalpilot-access-granted') === 'true';
  const accessNotice = document.getElementById('pp-access-notice');
  const accessCheckbox = document.getElementById('pp-access-checkbox');
  const accessGrantButton = document.getElementById('pp-access-grant');
  const gatedControls = [
    ...document.querySelectorAll('#pp-act-crawl, #pp-act-inspect, #pp-act-guide'),
    document.getElementById('pp-input-box'),
    document.querySelector('#pp-chat-form .pp-send-btn'),
  ];
  function setPageAccess(granted) {
    accessGranted = granted;
    accessNotice.hidden = granted;
    gatedControls.forEach(control => { control.disabled = !granted; });
    if (granted) {
      sessionStorage.setItem('portalpilot-access-granted', 'true');
    } else {
      sessionStorage.removeItem('portalpilot-access-granted');
    }
  }
  accessCheckbox.addEventListener('change', () => {
    accessGrantButton.disabled = !accessCheckbox.checked;
  });
  accessGrantButton.addEventListener('click', () => {
    if (!accessCheckbox.checked) return;
    setPageAccess(true);
    appendMsg('agent', 'Page access granted for this tab. Tell me what you want me to find or where you want to go.');
  });
  document.getElementById('pp-revoke-access').addEventListener('click', () => {
    accessCheckbox.checked = false;
    accessGrantButton.disabled = true;
    setPageAccess(false);
    appendMsg('agent', 'Page access revoked for this tab. Grant access again before starting another crawl or task.');
  });
  setPageAccess(accessGranted);

  let isOpen = true;
  function toggleWindow() {
    isOpen = !isOpen;
    windowEl.style.display = isOpen ? 'flex' : 'none';
  }

  btn.addEventListener('click', toggleWindow);
  document.getElementById('pp-toggle-minimize').addEventListener('click', toggleWindow);

  function appendMsg(sender, text) {
    const thread = document.getElementById('pp-msg-thread');
    const msg = document.createElement('div');
    msg.className = 'pp-msg ' + (sender === 'user' ? 'pp-msg-user' : 'pp-msg-agent');
    msg.textContent = text;
    thread.appendChild(msg);
    thread.scrollTop = thread.scrollHeight;
  }

  function renderTaskStatus(messageEl, task) {
    const state = task.last_verified_state;
    const location = state?.title
      ? `\nCurrent page: ${state.title}${state.url ? ` (${state.url})` : ''}`
      : '';
    if (task.status === 'waiting_for_approval' && task.pending_action) {
      messageEl.replaceChildren(
        document.createTextNode(
          `PortalPilot wants to ${task.pending_action.action_type} ${task.pending_action.target}.\n${task.pending_action.reason}`
        ),
      );
      const approveButton = document.createElement('button');
      approveButton.type = 'button';
      approveButton.className = 'pp-chip';
      approveButton.textContent = 'Approve this action';
      approveButton.addEventListener('click', async () => {
        approveButton.disabled = true;
        try {
          const response = await fetch(
            `http://127.0.0.1:8000/api/tasks/${encodeURIComponent(task.task_id)}/approve`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action_id: task.pending_action.action_id }),
            },
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Approval failed.');
          }
          messageEl.textContent = 'Approved. PortalPilot is continuing the task…';
        } catch (err) {
          approveButton.disabled = false;
          messageEl.append(document.createTextNode(`\nCould not approve action: ${err.message}`));
        }
      });
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'pp-chip';
      cancelButton.textContent = 'Cancel task';
      cancelButton.addEventListener('click', async () => {
        cancelButton.disabled = true;
        try {
          const response = await fetch(
            `http://127.0.0.1:8000/api/tasks/${encodeURIComponent(task.task_id)}/cancel`,
            { method: 'POST' },
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Cancellation failed.');
          }
          messageEl.textContent = 'Task cancelled.';
          sessionStorage.removeItem('portalpilot-active-task');
        } catch (err) {
          cancelButton.disabled = false;
          messageEl.append(document.createTextNode(`\nCould not cancel task: ${err.message}`));
        }
      });
      messageEl.append(document.createElement('br'), approveButton, cancelButton);
      return;
    }

    if (task.status === 'running' || task.status === 'queued') {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'pp-chip';
      cancelButton.textContent = 'Stop';
      cancelButton.addEventListener('click', async () => {
        cancelButton.disabled = true;
        try {
          const response = await fetch(
            `http://127.0.0.1:8000/api/tasks/${encodeURIComponent(task.task_id)}/cancel`,
            { method: 'POST' },
          );
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Cancellation failed.');
          }
        } catch (err) {
          cancelButton.disabled = false;
          messageEl.append(document.createTextNode(`\nCould not stop task: ${err.message}`));
        }
      });
      messageEl.replaceChildren(
        document.createTextNode(
          `PortalPilot is ${task.stage.replaceAll('_', ' ')} (${task.progress}%).${location}`
        ),
        document.createElement('br'),
        cancelButton,
      );
      return;
    }

    if (task.status === 'completed') {
      messageEl.textContent = `${task.result || 'Task completed.'}${location}`;
      sessionStorage.removeItem('portalpilot-active-task');
      return;
    }
    if (task.status === 'failed' || task.status === 'cancelled') {
      messageEl.textContent = `${task.error || task.result || 'Task did not complete.'}${location}`;
      messageEl.classList.add('pp-msg-error');
      sessionStorage.removeItem('portalpilot-active-task');
      return;
    }
    messageEl.textContent = task.result || `Task status: ${task.status}.${location}`;
  }

  async function monitorTask(taskId, messageEl) {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/tasks/${encodeURIComponent(taskId)}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Could not read agent task status.');
      }
      const task = await response.json();
      renderTaskStatus(messageEl, task);
      if (['completed', 'failed', 'cancelled'].includes(task.status)) return;
      window.setTimeout(() => monitorTask(taskId, messageEl), 1200);
    } catch (err) {
      messageEl.textContent = `Could not track the live task: ${err.message}`;
      messageEl.classList.add('pp-msg-error');
      sessionStorage.removeItem('portalpilot-active-task');
    }
  }

  const savedTaskId = sessionStorage.getItem('portalpilot-active-task');
  if (savedTaskId) {
    appendMsg('agent', 'Reconnecting to your in-progress PortalPilot task…');
    monitorTask(savedTaskId, document.getElementById('pp-msg-thread').lastElementChild);
  }

  document.getElementById('pp-chat-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!accessGranted) return;
    const input = document.getElementById('pp-input-box');
    const val = input.value.trim();
    if (!val) return;
    appendMsg('user', val);
    input.value = '';
    appendMsg('agent', 'Inspecting the live page and planning the next safe action…');
    const pendingMessage = document.getElementById('pp-msg-thread').lastElementChild;

    try {
      const res = await fetch('http://127.0.0.1:8000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: val,
          portal_id: 'up-scholarship',
          access_confirmed: true
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Could not start the live agent.');
      }
      const task = await res.json();
      sessionStorage.setItem('portalpilot-active-task', task.task_id);
      renderTaskStatus(pendingMessage, task);
      monitorTask(task.task_id, pendingMessage);
    } catch (err) {
      pendingMessage.textContent = 'Could not start the live agent: ' + err.message;
      pendingMessage.classList.add('pp-msg-error');
    }
  });

  document.getElementById('pp-act-crawl').addEventListener('click', async function() {
    if (!accessGranted) return;
    appendMsg('agent', 'Crawling navigation routes on this page…');
    const pendingMessage = document.getElementById('pp-msg-thread').lastElementChild;
    try {
      const res = await fetch('http://127.0.0.1:8000/api/browser/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'navigation routes' })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Page crawl failed.');
      }
      const data = await res.json();
      const routes = (data.crawl.navigation_menu || []).slice(0, 8).map(item => item.text);
      pendingMessage.textContent = routes.length
        ? 'Found ' + routes.length + ' navigation routes: ' + routes.join(' • ')
        : 'The crawl completed, but no navigation routes were found on this page.';
    } catch (err) {
      pendingMessage.textContent = 'Could not crawl this page: ' + err.message;
      pendingMessage.classList.add('pp-msg-error');
    }
  });

  document.getElementById('pp-act-inspect').addEventListener('click', function() {
    if (!accessGranted) return;
    const inputs = document.querySelectorAll('input:not([type=hidden]), select, textarea');
    inputs.forEach(el => el.classList.add('portalpilot-highlight'));
    appendMsg('agent', 'Highlighted ' + inputs.length + ' interactive form fields on this page.');
    setTimeout(() => {
      inputs.forEach(el => el.classList.remove('portalpilot-highlight'));
    }, 4000);
  });

  document.getElementById('pp-act-guide').addEventListener('click', function() {
    if (!accessGranted) return;
    const guidelineLink = Array.from(document.querySelectorAll('a')).find(a =>
      a.innerText.toLowerCase().includes('guideline') ||
      a.innerText.toLowerCase().includes('instruction')
    );
    if (guidelineLink) {
      appendMsg('agent', 'Found guidelines link: ' + guidelineLink.innerText + '. Scrolling into view…');
      guidelineLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      guidelineLink.classList.add('portalpilot-highlight');
      setTimeout(() => guidelineLink.classList.remove('portalpilot-highlight'), 3000);
    } else {
      appendMsg('agent', 'Scanning page for eligibility requirements…');
      window.scrollBy({ top: 300, behavior: 'smooth' });
    }
  });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();

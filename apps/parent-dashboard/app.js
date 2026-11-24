// Parent Supervision Dashboard Client Logic

const HOST_ORIGIN = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http'))
  ? window.location.origin
  : 'http://localhost:4000';
const API_BASE = `${HOST_ORIGIN}/api`;
const SOCKET_URL = HOST_ORIGIN;

let currentUser = null;
let authToken = localStorage.getItem('parent_token') || null;
let socket = null;
let devices = [];
let alerts = [];
let reports = [];
let captures = [];
let activeSession = null;
let liveFeed = [];
const MAX_FEED_ITEMS = 100;
let isRegisterMode = false;
let codeCountdownTimer = null;
let activeSessionTimer = null;

// Elements
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const connectionStatus = document.getElementById('connection-status');
const userProfile = document.getElementById('user-profile');
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const nameField = document.getElementById('name-field');
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');

const navItems = document.querySelectorAll('.nav-btn, .nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const alertCountBadge = document.getElementById('alert-count-badge');
const capturesCountBadge = document.getElementById('captures-count-badge');

const statDeviceCount = document.getElementById('stat-device-count');
const statOnlineCount = document.getElementById('stat-online-count');
const statCapturesCount = document.getElementById('stat-captures-count');
const statAlertCount = document.getElementById('stat-alert-count');
const statAvgScore = document.getElementById('stat-avg-score');

// Live Hero Elements
const liveTaskHero = document.getElementById('live-task-hero');
const liveTaskEmpty = document.getElementById('live-task-empty');
const heroStudentName = document.getElementById('hero-student-name');
const heroTaskTitle = document.getElementById('hero-task-title');
const heroSessionTime = document.getElementById('hero-session-time');
const heroCurrentApp = document.getElementById('hero-current-app');
const heroRelevancePill = document.getElementById('hero-relevance-pill');
const heroSsBox = document.getElementById('hero-ss-box');
const heroSsImg = document.getElementById('hero-ss-img');
const heroSsTime = document.getElementById('hero-ss-time');
const heroSsEnlargeBtn = document.getElementById('hero-ss-enlarge-btn');

// Captures Gallery Elements
const capturesGalleryGrid = document.getElementById('captures-gallery-grid');
const refreshCapturesBtn = document.getElementById('refresh-captures-btn');
const sessionCapturesGallery = document.getElementById('session-captures-gallery');

// Lightbox Elements
const lightboxModal = document.getElementById('lightbox-modal');
const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxTaskTitle = document.getElementById('lightbox-task-title');
const lightboxDetails = document.getElementById('lightbox-details');

// Device & Pairing Elements
const generateCodeBtn = document.getElementById('generate-code-btn');
const quickPairBtn = document.getElementById('quick-pair-btn');
const codeDisplayCard = document.getElementById('code-display-card');
const pairingCodeText = document.getElementById('pairing-code-text');
const codeTimer = document.getElementById('code-timer');
const closeCodeBtn = document.getElementById('close-code-btn');
const devicesList = document.getElementById('devices-list');

// Alerts Elements
const fullAlertsList = document.getElementById('full-alerts-list');
const overviewAlertsList = document.getElementById('overview-alerts-list');
const overviewSessionsList = document.getElementById('overview-sessions-list');

// Reports Elements
const reportsSessionsList = document.getElementById('reports-sessions-list');
const reportEmptyPrompt = document.getElementById('report-empty-prompt');
const reportContent = document.getElementById('report-content');

// Auth Tabs
tabLogin.addEventListener('click', () => {
  isRegisterMode = false;
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  nameField.classList.add('hidden');
  authSubmitBtn.innerHTML = '<span>Login</span> <span class="btn-arrow">→</span>';
  authError.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  isRegisterMode = true;
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  nameField.classList.remove('hidden');
  authSubmitBtn.innerHTML = '<span>Create Account</span> <span class="btn-arrow">→</span>';
  authError.classList.add('hidden');
});

// Auth Form Submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  const email = document.getElementById('parent-email').value.trim();
  const password = document.getElementById('parent-password').value;
  const name = document.getElementById('parent-name').value.trim();

  try {
    const endpoint = isRegisterMode ? `${API_BASE}/auth/register` : `${API_BASE}/auth/login`;
    const payload = isRegisterMode
      ? { email, password, name, role: 'PARENT' }
      : { email, password };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      let msg = data.error || 'Authentication failed';
      if (data.details && Array.isArray(data.details)) {
        msg = data.details.map(d => d.message).join(', ');
      }
      throw new Error(msg);
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('parent_token', authToken);

    initDashboard();
  } catch (err) {
    authError.innerText = err.message;
    authError.classList.remove('hidden');
  }
});

window.fillParentDemo = function() {
  const emailField = document.getElementById('parent-email');
  const passField = document.getElementById('parent-password');
  if (emailField) emailField.value = 'parent@example.com';
  if (passField) passField.value = 'Password123!';
};

window.loginAsDemoParent = async function() {
  window.fillParentDemo();
  if (authError) authError.classList.add('hidden');
  const submitBtn = document.getElementById('auth-submit-btn');
  const demoBtn = document.getElementById('demo-parent-btn');
  if (submitBtn) submitBtn.disabled = true;
  if (demoBtn) demoBtn.innerText = '⚡ Logging in as Sarah Jenkins...';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'parent@example.com', password: 'Password123!' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Demo login failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('parent_token', authToken);

    await initDashboard();
  } catch (err) {
    if (authError) {
      authError.innerText = err.message;
      authError.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (demoBtn) demoBtn.innerText = '⚡ 1-Click Demo Login (Sarah Jenkins)';
  }
};

window.handleSocialLogin = function(provider) {
  window.loginAsDemoParent();
};

window.togglePasswordVisibility = function(fieldId, btn) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  if (field.type === 'password') {
    field.type = 'text';
    if (btn) btn.innerText = '🙈';
  } else {
    field.type = 'password';
    if (btn) btn.innerText = '👁️';
  }
};

// Navigation Tabs
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    if (!targetTab) return;
    navItems.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (targetTab === 'feed') {
      tabPanes.forEach(p => p.classList.add('hidden'));
      const overviewPane = document.getElementById('tab-overview');
      if (overviewPane) overviewPane.classList.remove('hidden');
      const feedPanel = document.getElementById('live-feed-list');
      if (feedPanel) feedPanel.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    tabPanes.forEach(p => p.classList.add('hidden'));
    const targetPane = document.getElementById(`tab-${targetTab}`);
    if (targetPane) {
      targetPane.classList.remove('hidden');
    }

    if (targetTab === 'captures') {
      fetchCaptures();
    } else if (targetTab === 'devices') {
      fetchDevices();
    } else if (targetTab === 'alerts') {
      fetchNotifications();
    } else if (targetTab === 'reports') {
      fetchReports();
    }
  });
});

// Initialize Dashboard
async function initDashboard() {
  if (!authToken) return;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error('Session expired');

    // Prompt for browser push notifications for tamper alerts
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const data = await res.json();
    currentUser = data.user;

    userDisplayName.innerText = currentUser.name;
    userProfile.classList.remove('hidden');
    authView.classList.add('hidden');
    dashboardView.classList.remove('hidden');

    // Real time-of-day greeting with actual parent name
    const greetEl = document.getElementById('parent-greeting');
    const subgreetEl = document.getElementById('parent-subgreeting');
    if (greetEl) {
      const hour = new Date().getHours();
      const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const firstName = currentUser.name ? currentUser.name.split(' ')[0] : 'Parent';
      greetEl.innerText = `${timeGreet}, ${firstName}! 👋`;
    }

    initSocketConnection();
    fetchPinStatus();
    try {
      await fetchAllData();
    } catch (fetchErr) {
      console.warn('Non-fatal error loading dashboard data:', fetchErr);
    }
  } catch (err) {
    console.error('initDashboard error:', err);
    if (err.message.includes('401') || err.message.includes('expired')) {
      logout();
    }
  }
}

// Fetch all resources
async function fetchAllData() {
  await Promise.all([
    fetchActiveSession(),
    fetchDevices(),
    fetchNotifications(),
    fetchReports(),
    fetchCaptures(),
    fetchParentTasks(),
  ]);
  updateOverviewStats();
}

// Live Active Session & Task Inspector
async function fetchActiveSession() {
  try {
    const res = await fetch(`${API_BASE}/sessions/active-for-parent`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    activeSession = data.activeSession;
    renderActiveSession();
  } catch (e) {
    console.error('Failed to fetch active session', e);
  }
}

function renderActiveSession() {
  const feedStatus = document.getElementById('feed-status');
  if (!activeSession) {
    liveTaskHero.classList.add('hidden');
    liveTaskEmpty.classList.remove('hidden');
    if (activeSessionTimer) clearInterval(activeSessionTimer);
    if (feedStatus) {
      feedStatus.className = 'feed-status-pill offline';
      feedStatus.innerText = '● Idle — No Active Session';
    }
    return;
  }

  liveTaskEmpty.classList.add('hidden');
  liveTaskHero.classList.remove('hidden');
  if (feedStatus) {
    feedStatus.className = 'feed-status-pill live';
    feedStatus.innerText = '● LIVE — Monitoring Active';
  }

  heroStudentName.innerText = `${activeSession.student_name} • ${activeSession.device_name}`;
  heroTaskTitle.innerText = activeSession.task_text;

  // Live elapsed timer
  const startTime = new Date(activeSession.started_at).getTime();
  const updateElapsed = () => {
    const elapsedMins = Math.max(1, Math.round((Date.now() - startTime) / 60000));
    heroSessionTime.innerText = `Started at ${new Date(startTime).toLocaleTimeString()} (${elapsedMins} mins elapsed)`;
  };
  updateElapsed();
  if (activeSessionTimer) clearInterval(activeSessionTimer);
  activeSessionTimer = setInterval(updateElapsed, 30000);

  // Foreground App
  if (activeSession.latestActivity) {
    const app = activeSession.latestActivity.app_name || 'Active App';
    const title = activeSession.latestActivity.window_title ? ` ("${activeSession.latestActivity.window_title}")` : '';
    heroCurrentApp.innerText = `${app}${title}`;
  } else {
    heroCurrentApp.innerText = 'Study environment initialized';
  }

  // Populate recent events into Live Activity Feed if feed is empty
  if (activeSession.recentEvents && activeSession.recentEvents.length > 0 && liveFeed.length === 0) {
    const list = document.getElementById('live-feed-list');
    if (list) {
      list.innerHTML = '';
      liveFeed = activeSession.recentEvents.map(ev => ({
        sessionId: ev.session_id,
        eventId: ev.event_id,
        eventType: ev.event_type,
        appName: ev.app_name,
        windowTitle: ev.window_title,
        processName: ev.process_name,
        idleSeconds: ev.idle_seconds,
        timestamp: ev.timestamp,
        studentName: activeSession.student_name,
        aiCategory: ev.ai_category,
        aiConfidence: ev.ai_confidence,
        aiReason: ev.ai_reason,
        hasScreenshot: false,
      }));
      liveFeed.forEach(item => renderFeedItem(item, false));
    }
  }

  // Latest Screenshot
  heroSsBox.classList.remove('hidden');
  if (activeSession.latestScreenshot) {
    heroSsImg.src = activeSession.latestScreenshot;
    heroSsTime.innerText = activeSession.latestCaptureTime
      ? new Date(activeSession.latestCaptureTime).toLocaleTimeString()
      : 'Just now';
    heroSsEnlargeBtn.classList.remove('hidden');
    heroSsEnlargeBtn.onclick = () => {
      openLightbox(
        activeSession.latestScreenshot,
        activeSession.task_text,
        `Current App: ${activeSession.latestActivity?.app_name || 'App'} • Captured: ${new Date(activeSession.latestCaptureTime).toLocaleTimeString()}`
      );
    };
  } else {
    // Show monitoring placeholder until first 2-min capture arrives
    heroSsImg.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180"><rect width="300" height="180" fill="%230b1222"/><text x="150" y="75" fill="%2360a5fa" font-size="13" font-family="sans-serif" text-anchor="middle">Monitoring Active...</text><text x="150" y="100" fill="%2394a3b8" font-size="11" font-family="sans-serif" text-anchor="middle">First capture in ~2 minutes</text></svg>';
    heroSsTime.innerText = 'Awaiting 2-min capture';
    heroSsEnlargeBtn.classList.add('hidden');
  }
}

// 2-Minute Captures Gallery
async function fetchCaptures() {
  try {
    let allCaptures = [];
    // If active session exists, get its captures
    if (activeSession) {
      const res = await fetch(`${API_BASE}/sessions/${activeSession.id}/captures`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      allCaptures = data.captures || [];
    } else if (reports.length > 0) {
      // Get captures from latest completed session
      const res = await fetch(`${API_BASE}/sessions/${reports[0].session_id}/captures`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      allCaptures = data.captures || [];
    }

    captures = allCaptures;
    renderCapturesGallery();
  } catch (e) {
    console.error('Failed to fetch captures', e);
  }
}

function renderCapturesGallery() {
  capturesGalleryGrid.innerHTML = '';
  if (captures.length === 0) {
    capturesGalleryGrid.innerHTML = '<div class="empty-state">No screen context captures archived yet. Screen snapshots are recorded automatically every 2 minutes during active study sessions.</div>';
    capturesCountBadge.classList.add('hidden');
    return;
  }

  capturesCountBadge.innerText = captures.length;
  capturesCountBadge.classList.remove('hidden');

  captures.forEach(c => {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const isPeriodic = c.event_type === 'CONTEXT_SNAPSHOT' || !c.event_type;
    const badgeText = isPeriodic ? '⏱️ 2-MIN CAPTURE' : '⚡ WINDOW SWITCH';

    card.innerHTML = `
      <div class="gallery-thumb-wrap">
        <span class="gallery-badge">${badgeText}</span>
        <img src="${c.storage_ref}" alt="Desktop snapshot" class="gallery-thumb">
      </div>
      <div class="gallery-card-body">
        <div class="gallery-card-title">${c.app_name || 'Active Desktop'}</div>
        <div class="gallery-card-meta">${new Date(c.captured_at).toLocaleTimeString()} • ${c.window_title ? c.window_title.slice(0, 30) + '...' : 'Task in progress'}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      openLightbox(
        c.storage_ref,
        `Captured during Study Session`,
        `Application: ${c.app_name || 'App'} ("${c.window_title || ''}") • ${new Date(c.captured_at).toLocaleString()}`
      );
    });

    capturesGalleryGrid.appendChild(card);
  });
}

// Lightbox Modal
function openLightbox(imgSrc, title, details) {
  lightboxImg.src = imgSrc;
  lightboxTaskTitle.innerText = title;
  lightboxDetails.innerText = details;
  lightboxModal.classList.remove('hidden');
}

lightboxCloseBtn.addEventListener('click', () => {
  lightboxModal.classList.add('hidden');
});

lightboxModal.addEventListener('click', (e) => {
  if (e.target === lightboxModal) {
    lightboxModal.classList.add('hidden');
  }
});

refreshCapturesBtn.addEventListener('click', () => {
  fetchCaptures();
});

// Socket.IO Connection
function initSocketConnection() {
  if (typeof io === 'undefined') return;

  socket = io(SOCKET_URL, {
    auth: { token: authToken },
  });

  socket.on('connect', () => {
    connectionStatus.className = 'status-pill online';
    const textEl = connectionStatus.querySelector('.text');
    if (textEl) textEl.innerText = 'Live Connected';
  });

  socket.on('disconnect', () => {
    connectionStatus.className = 'status-pill offline';
    const textEl = connectionStatus.querySelector('.text');
    if (textEl) textEl.innerText = 'Reconnecting...';
  });

  socket.on('device:paired', (data) => {
    fetchDevices();
    alert(`New child device paired: ${data.deviceName}`);
  });

  socket.on('device:heartbeat', (data) => {
    const dev = devices.find(d => d.id === data.deviceId);
    if (dev) {
      dev.status = 'ONLINE';
      dev.last_heartbeat = data.lastHeartbeat;
      renderDevices();
      updateOverviewStats();
    }
  });

  socket.on('device:status', (data) => {
    const dev = devices.find(d => d.id === data.deviceId);
    if (dev) {
      dev.status = data.status;
      renderDevices();
      updateOverviewStats();
    }
  });

  socket.on('session:started', (data) => {
    fetchActiveSession();
    fetchCaptures();
    // Update feed status
    const feedStatus = document.getElementById('feed-status');
    if (feedStatus) {
      feedStatus.className = 'feed-status-pill live';
      feedStatus.innerText = '● LIVE — Session Active';
    }
    appendFeedItem({
      eventType: 'SESSION_START',
      appName: '📚 Study Session Started',
      windowTitle: data?.taskText ? `Task: "${data.taskText}"` : 'Session is now being monitored',
      timestamp: new Date().toISOString(),
      aiCategory: null,
      decisionAction: null,
      idleSeconds: 0,
    });
  });

  socket.on('session:ended', (data) => {
    fetchActiveSession();
    fetchReports();
    fetchCaptures();
    const feedStatus = document.getElementById('feed-status');
    if (feedStatus) {
      feedStatus.className = 'feed-status-pill offline';
      feedStatus.innerText = '● Session Ended';
    }
    appendFeedItem({
      eventType: 'SESSION_END',
      appName: '🏁 Study Session Ended',
      windowTitle: data?.focusScore != null ? `Focus Score: ${Math.round(data.focusScore)}/100` : 'Session complete',
      timestamp: new Date().toISOString(),
      aiCategory: null,
      decisionAction: null,
      idleSeconds: 0,
    });
  });

  socket.on('notification:new', (notif) => {
    if (notif.severity === 'CRITICAL' || notif.type === 'SECURITY_ALERT' || notif.type === 'SECURITY_WARNING') {
      showSecurityToast(notif.title, notif.body);
      fetchPinStatus();
    }
  });

  socket.on('session:capture_taken', (data) => {
    // Update live hero immediately!
    if (heroSsImg) {
      heroSsBox.classList.remove('hidden');
      heroSsImg.src = data.storageRef;
      heroSsTime.innerText = new Date(data.capturedAt).toLocaleTimeString();
      heroSsEnlargeBtn.classList.remove('hidden');
      heroSsEnlargeBtn.onclick = () => {
        openLightbox(
          data.storageRef,
          activeSession ? activeSession.task_text : 'Screen Capture',
          `App: ${data.appName || 'App'} • Captured: ${new Date(data.capturedAt).toLocaleTimeString()}`
        );
      };
    }
    // Prepend to gallery
    captures.unshift({
      id: data.captureId,
      session_id: data.sessionId,
      captured_at: data.capturedAt,
      storage_ref: data.storageRef,
      app_name: data.appName,
      window_title: data.windowTitle,
      event_type: data.eventType,
    });
    renderCapturesGallery();
    updateOverviewStats();
    // Add to feed
    appendFeedItem({
      eventType: 'CONTEXT_SNAPSHOT',
      appName: data.appName || 'Desktop',
      windowTitle: data.windowTitle || '2-minute periodic capture taken',
      timestamp: data.capturedAt,
      aiCategory: null,
      decisionAction: null,
      idleSeconds: 0,
      hasScreenshot: true,
      captureRef: data.storageRef,
    });
  });

  socket.on('parent:activity_update', (data) => {
    // Update live feed status
    const feedStatus = document.getElementById('feed-status');
    if (feedStatus && feedStatus.className !== 'feed-status-pill live') {
      feedStatus.className = 'feed-status-pill live';
      feedStatus.innerText = '● LIVE — Monitoring Active';
    }
    // Update the hero current app in real-time
    if (heroCurrentApp && data.appName) {
      const title = data.windowTitle ? ` ("${data.windowTitle.slice(0, 40)}${data.windowTitle.length > 40 ? '...' : ''}")` : '';
      heroCurrentApp.innerText = `${data.appName}${title}`;
    }
    // Update hero relevance pill
    if (heroRelevancePill && data.aiCategory) {
      const pillMap = {
        RELEVANT: { cls: 'pill pill-green', text: 'RELEVANT • ON TASK' },
        DISTRACTED: { cls: 'pill pill-amber', text: 'DISTRACTED' },
        POTENTIALLY_HARMFUL: { cls: 'pill pill-red', text: '⚠️ SAFETY FLAG' },
        UNCERTAIN: { cls: 'pill pill-amber', text: 'UNCERTAIN' },
      };
      const pill = pillMap[data.aiCategory] || { cls: 'pill pill-green', text: data.aiCategory };
      heroRelevancePill.className = pill.cls;
      heroRelevancePill.innerText = pill.text;
    }
    appendFeedItem(data);
  });

  socket.on('parent:safety_alert', (data) => {
    fetchNotifications();
    fetchAlerts();

    // 1. Immediately update Live Screen Hero if screenshot is attached
    if (data.screenshot && heroSsImg) {
      if (heroSsBox) {
        heroSsBox.classList.remove('hidden');
        heroSsBox.style.border = '2px solid #ef4444';
      }
      heroSsImg.src = data.screenshot;
      if (heroSsTime) {
        heroSsTime.innerText = new Date(data.timestamp || Date.now()).toLocaleTimeString();
      }
      if (heroSsEnlargeBtn) {
        heroSsEnlargeBtn.classList.remove('hidden');
        heroSsEnlargeBtn.onclick = () => {
          openLightbox(
            data.screenshot,
            `🚨 CRITICAL SAFETY ALERT: ${data.appName || 'Explicit Content'}`,
            `${data.reason || 'Safety Violation'} • ${new Date(data.timestamp || Date.now()).toLocaleTimeString()}`
          );
        };
      }
    }

    // 2. Add to real-time live activity feed
    appendFeedItem({
      eventType: 'SAFETY_ALERT',
      appName: `🚨 ${data.appName || 'Safety Alert'}`,
      windowTitle: data.reason || 'Potentially harmful activity detected',
      timestamp: data.timestamp || new Date().toISOString(),
      aiCategory: 'POTENTIALLY_HARMFUL',
      decisionAction: 'ALERT_PARENT',
      idleSeconds: 0,
      hasScreenshot: !!data.screenshot,
      storageRef: data.screenshot || null,
    });

    // 3. Play high-urgency chime and trigger native OS push notification
    showSecurityToast(
      `🚨 CRITICAL SAFETY ALERT: ${data.studentName || 'Student'}`,
      `${data.appName || 'Activity'}: ${data.reason || 'Explicit or harmful content detected on screen'}`
    );
  });

  socket.on('task:proposed', (data) => {
    fetchParentTasks();
    appendFeedItem({
      eventType: 'TASK_PROPOSED',
      appName: '📝 Task Proposed by Child',
      windowTitle: `"${data.task.title}" (${data.task.subject || 'General'}) was submitted for your approval`,
      timestamp: new Date().toISOString(),
      aiCategory: null,
      decisionAction: null,
      idleSeconds: 0,
    });
  });

  socket.on('task:status_changed', () => {
    fetchParentTasks();
  });
}

// Live Feed functions
function appendFeedItem(data) {
  liveFeed.unshift(data);
  if (liveFeed.length > MAX_FEED_ITEMS) liveFeed.pop();
  renderFeedItem(data, true);
}

function clearFeed() {
  liveFeed = [];
  const list = document.getElementById('live-feed-list');
  if (list) {
    list.innerHTML = `
      <div class="feed-empty-state">
        <span style="font-size:28px">🧹</span>
        <p>Feed cleared. New activity will appear here in real-time.</p>
      </div>
    `;
  }
}
window.clearFeed = clearFeed;

function renderFeedItem(data, prepend = false) {
  const list = document.getElementById('live-feed-list');
  if (!list) return;

  // Remove empty state if present
  const emptyState = list.querySelector('.feed-empty-state');
  if (emptyState) emptyState.remove();

  const item = document.createElement('div');
  item.className = 'feed-item';

  // Category badge
  const catMap = {
    RELEVANT:            { cls: 'feed-cat-badge relevant',  icon: '✅', label: 'RELEVANT' },
    DISTRACTED:          { cls: 'feed-cat-badge distracted', icon: '⚠️', label: 'DISTRACTED' },
    POTENTIALLY_HARMFUL: { cls: 'feed-cat-badge harmful',   icon: '🚨', label: 'SAFETY FLAG' },
    UNCERTAIN:           { cls: 'feed-cat-badge uncertain',  icon: '❓', label: 'UNCERTAIN' },
  };

  const eventIconMap = {
    ACTIVE_WINDOW_CHANGE: '🪟',
    APP_SWITCH:           '🔄',
    IDLE_START:           '💤',
    IDLE_END:             '▶️',
    INTERACTION_METRIC:   '⌨️',
    SESSION_BASELINE:     '📍',
    CONTEXT_SNAPSHOT:     '📷',
    SESSION_START:        '🚀',
    SESSION_END:          '🏁',
    SAFETY_ALERT:         '🚨',
  };

  const cat = catMap[data.aiCategory] || null;
  const eventIcon = eventIconMap[data.eventType] || '📌';
  const timeStr = new Date(data.timestamp).toLocaleTimeString();
  const isIdle = data.eventType === 'IDLE_START';
  const idleStr = isIdle && data.idleSeconds > 0 ? ` (${Math.round(data.idleSeconds / 60)}m idle)` : '';

  item.innerHTML = `
    <div class="feed-item-left">
      <div class="feed-event-icon ${isIdle ? 'idle' : ''}">${eventIcon}</div>
      <div class="feed-item-body">
        <div class="feed-item-app">${data.appName || 'System'}${idleStr}</div>
        ${data.windowTitle ? `<div class="feed-item-title">${data.windowTitle.slice(0, 80)}${data.windowTitle.length > 80 ? '...' : ''}</div>` : ''}
        ${data.aiReason ? `<div class="feed-item-reason">${data.aiReason}</div>` : ''}
      </div>
    </div>
    <div class="feed-item-right">
      ${cat ? `<span class="${cat.cls}">${cat.icon} ${cat.label}</span>` : ''}
      ${data.hasScreenshot ? `<span class="feed-ss-badge">📷 Screenshot</span>` : ''}
      <span class="feed-time">${timeStr}</span>
    </div>
  `;

  // Color-code by severity
  if (data.aiCategory === 'POTENTIALLY_HARMFUL' || data.eventType === 'SAFETY_ALERT') {
    item.classList.add('feed-item-danger');
  } else if (data.aiCategory === 'DISTRACTED') {
    item.classList.add('feed-item-warning');
  } else if (data.eventType === 'IDLE_START') {
    item.classList.add('feed-item-idle');
  }

  // Slide-in animation
  item.style.animation = 'feedSlideIn 0.3s ease forwards';

  if (prepend) {
    list.insertBefore(item, list.firstChild);
  } else {
    list.appendChild(item);
  }

  // Keep DOM list trimmed (remove items beyond limit)
  while (list.children.length > MAX_FEED_ITEMS) {
    list.removeChild(list.lastChild);
  }
}


// Device Management
async function fetchDevices() {
  try {
    const res = await fetch(`${API_BASE}/devices`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    devices = data.devices || [];
    renderDevices();
  } catch (e) {
    console.error('Failed to fetch devices', e);
  }
}

function renderDevices() {
  devicesList.innerHTML = '';
  if (devices.length === 0) {
    devicesList.innerHTML = '<div class="empty-state">No child devices paired yet. Click "Generate Pairing Code" above.</div>';
    return;
  }

  devices.forEach(dev => {
    const card = document.createElement('div');
    card.className = 'device-card';
    const isOnline = dev.status === 'ONLINE';

    card.innerHTML = `
      <div class="device-header">
        <h4>${dev.device_name}</h4>
        <span class="status-badge ${isOnline ? 'badge-online' : 'badge-offline'}">${dev.status}</span>
      </div>
      <div class="device-meta">
        <span><strong>Student:</strong> ${dev.student_name} (${dev.student_email})</span>
        <span><strong>Platform:</strong> ${dev.platform || 'Windows'}</span>
        <span><strong>Last Active:</strong> ${dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleTimeString() : 'Never'}</span>
      </div>
      <div class="protection-toggle">
        <span><strong>Supervised Protection:</strong></span>
        <label class="switch">
          <input type="checkbox" ${dev.protection_enabled ? 'checked' : ''} data-id="${dev.id}">
          <span class="slider"></span>
        </label>
      </div>
    `;

    const toggle = card.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', async () => {
      const targetState = toggle.checked;
      if (!isParentAuthorized) {
        // Revert switch visually until master PIN is verified
        toggle.checked = !targetState;
        openSecurityPinModal(
          `Authorize Supervised Protection on "${dev.device_name}"`,
          async () => {
            toggle.checked = targetState;
            await updateProtection(dev.id, targetState);
          }
        );
        return;
      }
      await updateProtection(dev.id, targetState);
    });

    devicesList.appendChild(card);
  });
}

async function updateProtection(deviceId, protectionEnabled) {
  try {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/protection`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ protectionEnabled }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update protection');
    }
    showSecurityToast('Security Shield', `Supervised Protection is now ${protectionEnabled ? 'ENABLED' : 'DISABLED'}.`);
  } catch (err) {
    alert(err.message);
    fetchDevices();
  }
}

// Pairing Code Generation
async function generatePairingCode() {
  try {
    const res = await fetch(`${API_BASE}/pairing/code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate code');

    pairingCodeText.innerText = data.code;
    codeDisplayCard.classList.remove('hidden');

    let secondsLeft = data.expiresInMinutes * 60;
    if (codeCountdownTimer) clearInterval(codeCountdownTimer);

    codeCountdownTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(codeCountdownTimer);
        codeTimer.innerText = 'Code expired';
      } else {
        const m = Math.floor(secondsLeft / 60);
        const s = String(secondsLeft % 60).padStart(2, '0');
        codeTimer.innerText = `Expires in ${m}:${s}`;
      }
    }, 1000);
  } catch (err) {
    alert(err.message);
  }
}

generateCodeBtn.addEventListener('click', generatePairingCode);
quickPairBtn.addEventListener('click', generatePairingCode);
closeCodeBtn.addEventListener('click', () => {
  codeDisplayCard.classList.add('hidden');
  if (codeCountdownTimer) clearInterval(codeCountdownTimer);
});

// Notifications
async function fetchNotifications() {
  try {
    const res = await fetch(`${API_BASE}/notifications`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    alerts = data.notifications || [];
    renderAlerts();
  } catch (e) {
    console.error('Failed to fetch notifications', e);
  }
}

function renderAlerts() {
  const unreadAlerts = alerts.filter(a => !a.read_at);
  if (unreadAlerts.length > 0) {
    alertCountBadge.innerText = unreadAlerts.length;
    alertCountBadge.classList.remove('hidden');
  } else {
    alertCountBadge.classList.add('hidden');
  }

  fullAlertsList.innerHTML = '';
  if (alerts.length === 0) {
    fullAlertsList.innerHTML = '<div class="empty-state">No safety alerts recorded. All monitored activity within normal thresholds.</div>';
  } else {
    alerts.forEach(alert => {
      const item = document.createElement('div');
      item.className = 'alert-item';
      item.innerHTML = `
        <div class="alert-info">
          <h5>${alert.title}</h5>
          <p>${alert.body}</p>
          <span class="meta">${new Date(alert.created_at).toLocaleString()} • Severity: ${alert.severity}</span>
        </div>
        ${!alert.read_at ? `<button class="btn btn-outline" data-id="${alert.id}">Mark Read</button>` : '<span class="subtext text-gray">Resolved</span>'}
      `;

      const readBtn = item.querySelector('button');
      if (readBtn) {
        readBtn.addEventListener('click', async () => {
          await markAlertRead(alert.id);
        });
      }
      fullAlertsList.appendChild(item);
    });
  }

  overviewAlertsList.innerHTML = '';
  if (alerts.length === 0) {
    overviewAlertsList.innerHTML = '<div class="empty-state">No safety alerts detected.</div>';
  } else {
    alerts.slice(0, 3).forEach(alert => {
      const div = document.createElement('div');
      div.style.marginBottom = '10px';
      div.innerHTML = `<strong>${alert.title}</strong><p class="subtext">${alert.body}</p>`;
      overviewAlertsList.appendChild(div);
    });
  }
}

async function markAlertRead(id) {
  await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  fetchNotifications();
}

// Reports & Timelines
async function fetchReports() {
  try {
    const res = await fetch(`${API_BASE}/reports`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    reports = data.reports || [];
    renderReportsList();
  } catch (e) {
    console.error('Failed to fetch reports', e);
  }
}

function renderReportsList() {
  reportsSessionsList.innerHTML = '';
  if (reports.length === 0) {
    reportsSessionsList.innerHTML = '<div class="empty-state">No completed study sessions yet.</div>';
    overviewSessionsList.innerHTML = '<div class="empty-state">No study sessions recorded yet.</div>';
    updateLearningProgress([]);
    return;
  }

  overviewSessionsList.innerHTML = '';
  reports.slice(0, 3).forEach(rep => {
    const div = document.createElement('div');
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <strong>${rep.student_name}: "${rep.task_text}"</strong>
      <div class="subtext">Focus Score: <span class="text-green">${Math.round(rep.focus_score)}/100</span> • ${new Date(rep.created_at).toLocaleDateString()}</div>
    `;
    overviewSessionsList.appendChild(div);
  });

  reports.forEach(rep => {
    const item = document.createElement('div');
    item.className = 'session-card-item';
    item.innerHTML = `
      <h5>${rep.task_text}</h5>
      <div class="meta">${rep.student_name} • Score: <strong>${Math.round(rep.focus_score)}</strong></div>
      <div class="meta">${new Date(rep.created_at).toLocaleTimeString()}</div>
    `;
    item.addEventListener('click', () => {
      document.querySelectorAll('.session-card-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadReportDetail(rep.id, rep.session_id);
    });
    reportsSessionsList.appendChild(item);
  });

  // Update the learning progress card dynamically
  updateLearningProgress(reports);
}

// Update Learning Progress card from real session reports
function updateLearningProgress(sessionReports) {
  const container = document.getElementById('learning-progress-container');
  if (!container) return;

  if (devices.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px; text-align: center;">
        <div style="font-size: 26px; margin-bottom: 6px;">📱</div>
        <strong style="color: #0f172a; font-size: 13px;">No Child Device Linked</strong>
        <p class="subtext" style="margin-top: 4px; font-size: 12px;">Pair your child's laptop or desktop to track subject progress and focus metrics in real time.</p>
        <button class="btn-outline-small" style="margin-top: 10px; cursor: pointer; padding: 6px 14px;" onclick="document.querySelector('[data-tab=\\'devices\\']').click(); document.getElementById('generate-code-btn').click();">+ Link Child Device</button>
      </div>
    `;
    return;
  }

  if (!sessionReports || sessionReports.length === 0) {
    const studentName = devices[0].student_name || 'Your Child';
    container.innerHTML = `
      <div class="student-mini-profile">
        <div class="student-avatar-circle">🧑‍🎓</div>
        <div>
          <strong class="student-name-bold">${studentName}</strong>
          <span class="student-grade-sub">No study sessions completed yet</span>
        </div>
      </div>
      <div class="empty-state" style="margin-top:12px">Complete study sessions on ${studentName}'s device to see progress by subject.</div>
    `;
    return;
  }

  // Build subject → avg focus score map by detecting keywords in task text
  const subjectKeywords = {
    'Mathematics': ['math', 'algebra', 'geometry', 'calculus', 'fraction', 'decimal', 'trigon', 'statistics'],
    'Science': ['science', 'physics', 'chemistry', 'biology', 'solar', 'ecosystem', 'atom', 'cell'],
    'English': ['english', 'essay', 'grammar', 'reading', 'writing', 'comprehension', 'literature', 'vocab'],
    'Computer Science': ['computer', 'coding', 'java', 'python', 'algorithm', 'programming', 'software', 'data structure'],
    'History': ['history', 'civics', 'geography', 'social', 'world war', 'revolution'],
  };

  const subjectScores = {};
  const subjectCounts = {};

  sessionReports.forEach(r => {
    const taskLower = (r.task_text || '').toLowerCase();
    const score = Number(r.focus_score) || 0;
    let matched = false;
    for (const [subject, keywords] of Object.entries(subjectKeywords)) {
      if (keywords.some(kw => taskLower.includes(kw))) {
        subjectScores[subject] = (subjectScores[subject] || 0) + score;
        subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const subject = 'Other';
      subjectScores[subject] = (subjectScores[subject] || 0) + score;
      subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
    }
  });

  const colorMap = {
    'Mathematics': 'fill-blue',
    'Science': 'fill-cyan',
    'English': 'fill-purple',
    'Computer Science': 'fill-indigo',
    'History': 'fill-amber',
    'Other': 'fill-green',
  };

  const studentName = devices.length > 0 ? (devices[0].student_name || 'Your Child') : 'Your Child';
  const totalSessions = sessionReports.length;
  const avgScore = Math.round(sessionReports.reduce((a, r) => a + Number(r.focus_score || 0), 0) / totalSessions);

  let html = `
    <div class="student-mini-profile">
      <div class="student-avatar-circle">🧑‍🎓</div>
      <div>
        <strong class="student-name-bold">${studentName}</strong>
        <span class="student-grade-sub">${totalSessions} session${totalSessions > 1 ? 's' : ''} • Avg focus: ${avgScore}/100</span>
      </div>
    </div>
    <div class="progress-bars-list">
  `;

  const subjects = Object.keys(subjectScores).sort((a, b) => {
    const avgA = subjectScores[a] / subjectCounts[a];
    const avgB = subjectScores[b] / subjectCounts[b];
    return avgB - avgA; // Highest first
  });

  subjects.forEach(subject => {
    const avg = Math.round(subjectScores[subject] / subjectCounts[subject]);
    const colorClass = colorMap[subject] || 'fill-blue';
    const count = subjectCounts[subject];
    html += `
      <div class="progress-item">
        <div class="progress-info">
          <span>${subject} <span class="subtext">(${count} session${count > 1 ? 's' : ''})</span></span>
          <strong>${avg}%</strong>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${colorClass}" style="width: ${avg}%; transition: width 0.8s ease;"></div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

async function loadReportDetail(reportId, sessionId) {
  try {
    const res = await fetch(`${API_BASE}/reports/${reportId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const rep = await res.json();

    reportEmptyPrompt.classList.add('hidden');
    reportContent.classList.remove('hidden');

    document.getElementById('rep-detail-task').innerText = rep.task_text;
    document.getElementById('rep-detail-student').innerText = `${rep.student_name} • ${new Date(rep.started_at).toLocaleString()}`;
    document.getElementById('rep-detail-score').innerText = Math.round(rep.focus_score);

    // summary_json may be a string (from PGlite) or already parsed object
    let summary = rep.summary_json || {};
    if (typeof summary === 'string') {
      try { summary = JSON.parse(summary); } catch (_) { summary = {}; }
    }
    const breakdown = summary.breakdown || {};

    document.getElementById('m-duration').innerText = `${Math.round(breakdown.sessionMinutes || 1)}m`;
    document.getElementById('m-productive').innerText = `${Math.round(breakdown.productiveMinutes || 1)}m`;
    document.getElementById('m-distraction').innerText = `${Math.round(breakdown.distractionMinutes || 0)}m`;
    document.getElementById('m-idle').innerText = `${Math.round(breakdown.idleMinutes || 0)}m`;
    document.getElementById('m-switches').innerText = breakdown.switchCount || 0;

    document.getElementById('rep-detail-summary').innerText = summary.aiSummary || 'Study session completed.';

    const recsList = document.getElementById('rep-detail-recommendations');
    recsList.innerHTML = '';
    (summary.recommendations || []).forEach(rec => {
      const li = document.createElement('li');
      li.innerText = rec;
      recsList.appendChild(li);
    });

    // Fetch session captures for mini gallery
    const capRes = await fetch(`${API_BASE}/sessions/${sessionId}/captures`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const capData = await capRes.json();
    const sessionCaps = capData.captures || [];

    sessionCapturesGallery.innerHTML = '';
    if (sessionCaps.length === 0) {
      sessionCapturesGallery.innerHTML = '<div class="empty-state">No screen snapshots archived for this session.</div>';
    } else {
      sessionCaps.forEach(c => {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.innerHTML = `
          <div class="gallery-thumb-wrap">
            <span class="gallery-badge">⏱️ 2-MIN SNAPSHOT</span>
            <img src="${c.storage_ref}" alt="Snapshot" class="gallery-thumb">
          </div>
          <div class="gallery-card-body">
            <div class="gallery-card-title">${c.app_name || 'Desktop'}</div>
            <div class="gallery-card-meta">${new Date(c.captured_at).toLocaleTimeString()}</div>
          </div>
        `;
        card.addEventListener('click', () => {
          openLightbox(
            c.storage_ref,
            `Task: ${rep.task_text}`,
            `Application: ${c.app_name} ("${c.window_title}") • Captured at ${new Date(c.captured_at).toLocaleTimeString()}`
          );
        });
        sessionCapturesGallery.appendChild(card);
      });
    }

    // Render Chronological Timeline
    const timelineBox = document.getElementById('rep-detail-timeline');
    timelineBox.innerHTML = '';
    const timelineItems = summary.timeline || [];

    if (timelineItems.length === 0) {
      timelineBox.innerHTML = '<div class="empty-state">No timeline events recorded.</div>';
    } else {
      timelineItems.forEach(item => {
        const div = document.createElement('div');
        div.className = `timeline-item ${item.type === 'DISTRACTION' ? 'distraction' : item.type === 'SAFETY_EVENT' ? 'safety' : ''}`;
        div.innerHTML = `
          <div class="timeline-time">${new Date(item.timestamp).toLocaleTimeString()}</div>
          <div class="timeline-title">${item.title}</div>
          <div class="timeline-desc">${item.description}</div>
        `;
        timelineBox.appendChild(div);
      });
    }
  } catch (err) {
    alert('Failed to load report detail');
  }
}

// Update Overview Stats Cards — all from real API data
function updateOverviewStats() {
  // --- Devices ---
  const devCountEl = document.getElementById('stat-device-count');
  const onlineCountEl = document.getElementById('stat-online-count');
  if (devCountEl) devCountEl.innerText = devices.length > 0 ? devices.length : '--';
  const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
  if (onlineCountEl) onlineCountEl.innerText = devices.length > 0 ? `${onlineCount} Online` : '-- Online';

  // Update badge counts for nav
  if (statDeviceCount) statDeviceCount.innerText = devices.length;
  if (statOnlineCount) statOnlineCount.innerText = `${onlineCount} Online`;

  // --- Captures count ---
  if (statCapturesCount) statCapturesCount.innerText = captures.length;

  // --- Focus Score avg from all reports ---
  const avgScoreEl = document.getElementById('stat-avg-score');
  if (reports.length > 0) {
    const avg = reports.reduce((acc, r) => acc + Number(r.focus_score), 0) / reports.length;
    const rounded = Math.round(avg);
    if (statAvgScore) statAvgScore.innerText = `${rounded} / 100`;
    if (avgScoreEl) avgScoreEl.innerText = `${rounded} / 100`;
  } else {
    if (statAvgScore) statAvgScore.innerText = '--';
    if (avgScoreEl) avgScoreEl.innerText = '--';
  }

  // --- Unread alerts badge ---
  const unreadAlerts = alerts.filter(a => !a.read_at);
  if (statAlertCount) statAlertCount.innerText = unreadAlerts.length;
  if (alertCountBadge) {
    if (unreadAlerts.length > 0) {
      alertCountBadge.innerText = unreadAlerts.length;
      alertCountBadge.classList.remove('hidden');
    } else {
      alertCountBadge.classList.add('hidden');
    }
  }

  // --- Safety status from alerts ---
  const safetyEl = document.getElementById('stat-safety-status');
  if (safetyEl) {
    const dangerAlerts = alerts.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL');
    if (dangerAlerts.length > 0) {
      safetyEl.innerText = `${dangerAlerts.length} Alert${dangerAlerts.length > 1 ? 's' : ''}`;
      safetyEl.className = 'stat-value text-red';
    } else if (alerts.length > 0) {
      safetyEl.innerText = 'Reviewed';
      safetyEl.className = 'stat-value text-amber';
    } else {
      safetyEl.innerText = 'All Good';
      safetyEl.className = 'stat-value text-green';
    }
  }

  // --- Today's study time from reports ---
  const studyTimeEl = document.getElementById('stat-study-time');
  const studyTrendEl = document.getElementById('stat-study-trend');
  if (studyTimeEl && reports.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayReports = reports.filter(r => {
      const d = new Date(r.created_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });
    if (todayReports.length > 0) {
      // Sum session minutes from today's completed sessions
      let totalMins = 0;
      todayReports.forEach(r => {
        let summary = r.summary_json || {};
        if (typeof summary === 'string') { try { summary = JSON.parse(summary); } catch(_) { summary = {}; } }
        totalMins += Number(summary?.breakdown?.sessionMinutes) || 0;
      });
      if (totalMins >= 60) {
        const h = Math.floor(totalMins / 60);
        const m = Math.round(totalMins % 60);
        studyTimeEl.innerText = `${h}h ${m}m`;
      } else {
        studyTimeEl.innerText = `${Math.round(totalMins)}m`;
      }
      if (studyTrendEl) studyTrendEl.innerText = `${todayReports.length} session${todayReports.length > 1 ? 's' : ''} today`;
    } else {
      studyTimeEl.innerText = 'No sessions today';
      if (studyTrendEl) studyTrendEl.innerText = `${reports.length} total`;
    }
  } else if (studyTimeEl) {
    studyTimeEl.innerText = '--';
  }

  // --- Update student header name & dropdown from devices ---
  const headerStudentEl = document.getElementById('header-student-name');
  const userSubEl = document.querySelector('.sidebar-bottom .user-sub');
  const studentDropdown = document.getElementById('student-dropdown');

  if (devices.length > 0) {
    const studentName = devices[0].student_name || 'Student';
    const firstName = studentName.split(' ')[0];
    if (headerStudentEl) headerStudentEl.innerText = `${firstName} ▾`;
    if (userSubEl) userSubEl.innerText = `${firstName}'s Parent`;
    const profileNameEl = document.querySelector('.student-name-bold');
    if (profileNameEl) profileNameEl.innerText = studentName;
    if (studentDropdown) {
      studentDropdown.innerHTML = `
        <div class="dropdown-item active">
          <div class="student-avatar-small">🧑‍🎓</div>
          <div>
            <strong>${studentName}</strong>
            <div class="subtext">${devices[0].device_name || 'Linked PC'} • ${devices[0].status || 'Offline'}</div>
          </div>
          <span style="color:var(--accent-green);margin-left:auto;">✓</span>
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-item" onclick="document.querySelector('[data-tab=\\'devices\\']').click(); document.getElementById('generate-code-btn').click();">
          <span>➕ Link New Device</span>
        </div>
      `;
    }
  } else {
    if (headerStudentEl) headerStudentEl.innerText = `No Child Linked ▾`;
    if (userSubEl) userSubEl.innerText = `Parent Account`;
    if (studentDropdown) {
      studentDropdown.innerHTML = `
        <div class="dropdown-item" style="cursor: default; opacity: 0.7;">
          <span>No child devices linked yet</span>
        </div>
        <div class="dropdown-divider"></div>
        <div class="dropdown-item" onclick="document.querySelector('[data-tab=\\'devices\\']').click(); document.getElementById('generate-code-btn').click();">
          <span>➕ Link Child Device (Pairing Code)</span>
        </div>
      `;
    }
  }
}

function logout() {
  localStorage.removeItem('parent_token');
  authToken = null;
  currentUser = null;
  devices = [];
  reports = [];
  captures = [];
  alerts = [];
  parentTasks = [];
  activeSession = null;
  liveFeed = [];
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (activeSessionTimer) {
    clearInterval(activeSessionTimer);
    activeSessionTimer = null;
  }
  const emailField = document.getElementById('parent-email');
  const passField = document.getElementById('parent-password');
  if (emailField) emailField.value = '';
  if (passField) passField.value = '';

  userProfile.classList.add('hidden');
  dashboardView.classList.add('hidden');
  authView.classList.remove('hidden');
}

logoutBtn.addEventListener('click', logout);

// Auto load if token exists
if (authToken) {
  initDashboard();
} else {
  authView.classList.remove('hidden');
}

// Resources Modal
function openResourcesModal() {
  const modal = document.getElementById('resources-modal');
  if (modal) modal.classList.remove('hidden');
}
window.openResourcesModal = openResourcesModal;

function closeResourcesModal() {
  const modal = document.getElementById('resources-modal');
  if (modal) modal.classList.add('hidden');
}
window.closeResourcesModal = closeResourcesModal;

// Copy Pairing Code
function copyPairingCode() {
  const codeEl = document.getElementById('pairing-code-text');
  const code = codeEl ? codeEl.innerText.trim() : '';
  if (!code || code === '------') return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-code-btn');
    if (btn) {
      btn.innerText = 'Copied! ✓';
      setTimeout(() => { btn.innerText = 'Copy Code 📋'; }, 2000);
    }
  }).catch(() => {
    alert(`Pairing Code: ${code}`);
  });
}
window.copyPairingCode = copyPairingCode;

// Student Profile Dropdown
function toggleStudentDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('student-dropdown');
  if (menu) menu.classList.toggle('hidden');
}
window.toggleStudentDropdown = toggleStudentDropdown;

document.addEventListener('click', (e) => {
  const menu = document.getElementById('student-dropdown');
  if (menu && !menu.classList.contains('hidden') && !e.target.closest('.student-select-badge')) {
    menu.classList.add('hidden');
  }
});

// Parent Task Assignment & Approval Logic
let parentTasks = [];

async function fetchParentTasks() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    parentTasks = data.tasks || [];
    renderParentTasks();
  } catch (err) {
    console.error('Failed to fetch parent tasks:', err);
  }
}

function renderParentTasks() {
  const container = document.getElementById('parent-tasks-container');
  if (!container) return;

  if (devices.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px; text-align: center;">
        <div style="font-size: 24px; margin-bottom: 6px;">📋</div>
        <strong>No Child Linked Yet</strong>
        <p class="subtext" style="margin-top: 4px; font-size: 12px;">Pair a child device first to assign structured study tasks and supervise their learning goals.</p>
        <button class="btn-outline-small" style="margin-top: 10px; cursor: pointer; padding: 6px 14px;" onclick="document.querySelector('[data-tab=\\'devices\\']').click(); document.getElementById('generate-code-btn').click();">+ Link Child Device</button>
      </div>
    `;
    return;
  }

  if (parentTasks.length === 0) {
    const studentName = devices[0].student_name || 'your child';
    container.innerHTML = `<div class="empty-state">No study tasks created yet for ${studentName}. Click "+ Assign Task to Child" to set their first study goal!</div>`;
    return;
  }

  const subjectIcons = {
    'Mathematics': '📐',
    'Science': '🪐',
    'English': '📖',
    'Computer Science': '💻',
    'History': '🏛️',
    'General': '📝',
  };

  container.innerHTML = '';
  parentTasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-item-card';

    const icon = subjectIcons[task.subject] || '📝';
    const isStudentProposed = task.created_by_role === 'STUDENT';
    const isPending = task.status === 'PENDING';
    const statusClass = task.status === 'APPROVED' ? 'approved' : isPending ? 'pending' : 'completed';
    const statusLabel = task.status === 'APPROVED' ? 'Assigned' : isPending ? 'Pending Review' : task.status;

    card.innerHTML = `
      <div class="task-item-left">
        <div class="task-icon-circle">${icon}</div>
        <div class="task-details-col">
          <div class="task-title-text">${task.title}</div>
          ${task.description ? `<div class="task-desc-text">${task.description}</div>` : ''}
          <div class="task-meta-row">
            <span class="task-subject-tag">${task.subject}</span>
            <span>• ${isStudentProposed ? 'Proposed by child' : 'Assigned by you'}</span>
            <span>• ${new Date(task.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
      <div class="task-item-right">
        <span class="task-status-pill ${statusClass}">${statusLabel}</span>
        ${isPending ? `<button class="btn-approve-task" onclick="approveTask('${task.id}')">Approve ✓</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function openAssignTaskModal() {
  if (devices.length === 0) {
    alert('Please link your child\'s device first before assigning tasks.');
    document.querySelector('[data-tab="devices"]').click();
    document.getElementById('generate-code-btn').click();
    return;
  }
  const modal = document.getElementById('assign-task-modal');
  if (modal) modal.classList.remove('hidden');
}
window.openAssignTaskModal = openAssignTaskModal;

function closeAssignTaskModal() {
  const modal = document.getElementById('assign-task-modal');
  if (modal) modal.classList.add('hidden');
}
window.closeAssignTaskModal = closeAssignTaskModal;

async function handleAssignTask(e) {
  if (e) e.preventDefault();
  const title = document.getElementById('assign-task-title').value.trim();
  const subject = document.getElementById('assign-task-subject').value;
  const description = document.getElementById('assign-task-desc').value.trim();

  if (!title) return;

  const studentId = devices.length > 0 ? devices[0].student_id : null;

  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ title, subject, description, studentId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to assign task');

    closeAssignTaskModal();
    const form = document.getElementById('assign-task-form');
    if (form) form.reset();
    await fetchParentTasks();

    alert(`Task "${title}" assigned to your child! It is now live on their screen.`);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
window.handleAssignTask = handleAssignTask;

async function approveTask(taskId) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ status: 'APPROVED' }),
    });

    if (res.ok) {
      await fetchParentTasks();
    }
  } catch (err) {
    console.error('Failed to approve task:', err);
  }
}
window.approveTask = approveTask;

// Request real-time screen capture on demand from child
function requestChildScreenshot() {
  if (socket && activeSession) {
    socket.emit('parent:request_screenshot', { studentId: activeSession.student_id });
    const btn = document.getElementById('hero-ss-refresh-btn');
    if (btn) {
      btn.innerText = 'Requesting live...';
      setTimeout(() => {
        btn.innerText = '↻ Refresh';
        fetchActiveSession();
        fetchCaptures();
      }, 1500);
    }
  } else {
    fetchActiveSession();
    fetchCaptures();
  }
}
window.requestChildScreenshot = requestChildScreenshot;

// ══════════════════════════════════════════════════════════
// EXECUTIVE PARENT SECURITY & ANTI-TAMPER SHIELD CONTROLLER
// ══════════════════════════════════════════════════════════
let isParentAuthorized = false;
let autoLockInterval = null;
let autoLockSecondsRemaining = 0;
let currentPinBuffer = '';
let pendingSecurityAction = null;
let currentSecurityTab = 'VERIFY';
let parentPinConfig = { hasPin: false, isLocked: false, lockedUntil: null, failedAttempts: 0 };

async function fetchPinStatus() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/auth/pin/status`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    parentPinConfig = data;
    renderSecurityPill();
  } catch (err) {
    console.warn('[SecurityShield] fetchPinStatus error:', err.message);
  }
}
window.fetchPinStatus = fetchPinStatus;

function renderSecurityPill() {
  const pill = document.getElementById('tamper-guard-pill');
  const label = document.getElementById('tamper-guard-label');
  const timer = document.getElementById('tamper-guard-timer');
  if (!pill || !label || !timer) return;

  if (parentPinConfig.isLocked) {
    pill.className = 'security-status-pill locked';
    label.innerText = 'Shield: Locked Out';
    timer.classList.remove('hidden');
    timer.innerText = `${Math.ceil((parentPinConfig.remainingLockSeconds || 900) / 60)}m`;
    return;
  }

  if (isParentAuthorized) {
    pill.className = 'security-status-pill unlocked';
    label.innerText = 'Shield: Authorized';
    timer.classList.remove('hidden');
    const min = Math.floor(autoLockSecondsRemaining / 60).toString().padStart(2, '0');
    const sec = (autoLockSecondsRemaining % 60).toString().padStart(2, '0');
    timer.innerText = `${min}:${sec}`;
  } else {
    pill.className = 'security-status-pill locked';
    label.innerText = 'Controls: Locked';
    timer.classList.add('hidden');
  }
}

function startAutoLockTimer(minutes = 5) {
  if (autoLockInterval) clearInterval(autoLockInterval);
  autoLockSecondsRemaining = minutes * 60;
  isParentAuthorized = true;
  renderSecurityPill();

  autoLockInterval = setInterval(() => {
    autoLockSecondsRemaining--;
    if (autoLockSecondsRemaining <= 0) {
      lockParentControls('Inactivity timeout: Controls automatically locked.');
    } else {
      renderSecurityPill();
    }
  }, 1000);
}

function lockParentControls(reason = null) {
  if (autoLockInterval) clearInterval(autoLockInterval);
  autoLockInterval = null;
  isParentAuthorized = false;
  renderSecurityPill();
  if (reason) {
    showSecurityToast('Tamper Shield Active', reason);
  }
}
window.lockParentControls = lockParentControls;

window.handleSecurityPillClick = function() {
  if (isParentAuthorized) {
    lockParentControls('Parent manually locked controls.');
  } else {
    openSecurityPinModal('Authorize parent session to modify controls');
  }
};

window.openSecurityPinModal = function(actionReason = null, onSuccessCallback = null) {
  pendingSecurityAction = onSuccessCallback;
  const modal = document.getElementById('parent-security-modal');
  const reasonBanner = document.getElementById('security-action-reason');
  const reasonText = document.getElementById('security-context-text');
  const errorFeedback = document.getElementById('pin-error-feedback');

  if (actionReason && reasonBanner && reasonText) {
    reasonText.innerText = actionReason;
    reasonBanner.classList.remove('hidden');
  } else if (reasonBanner) {
    reasonBanner.classList.add('hidden');
  }

  if (errorFeedback) {
    errorFeedback.classList.add('hidden');
    errorFeedback.innerText = '';
  }

  switchSecurityTab('VERIFY');
  clearPinInput();
  if (modal) modal.classList.remove('hidden');

  const hiddenInput = document.getElementById('pin-hidden-input');
  if (hiddenInput) {
    setTimeout(() => hiddenInput.focus(), 80);
  }
};

window.closeSecurityPinModal = function() {
  const modal = document.getElementById('parent-security-modal');
  if (modal) modal.classList.add('hidden');
  clearPinInput();
  pendingSecurityAction = null;
};

window.switchSecurityTab = function(tab) {
  currentSecurityTab = tab;
  const tabVerify = document.getElementById('tab-sec-verify');
  const tabManage = document.getElementById('tab-sec-manage');
  const paneVerify = document.getElementById('sec-pane-verify');
  const paneManage = document.getElementById('sec-pane-manage');

  if (tab === 'VERIFY') {
    tabVerify?.classList.add('active');
    tabManage?.classList.remove('active');
    paneVerify?.classList.remove('hidden');
    paneManage?.classList.add('hidden');
    clearPinInput();
  } else {
    tabVerify?.classList.remove('active');
    tabManage?.classList.add('active');
    paneVerify?.classList.add('hidden');
    paneManage?.classList.remove('hidden');
  }
};

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < currentPinBuffer.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

window.handlePinDigit = function(digit) {
  if (currentPinBuffer.length >= 4) return;
  currentPinBuffer += digit;
  updatePinDots();
  if (currentPinBuffer.length === 4) {
    submitPinVerification();
  }
};

window.clearPinInput = function() {
  currentPinBuffer = '';
  updatePinDots();
  const hiddenInput = document.getElementById('pin-hidden-input');
  if (hiddenInput) hiddenInput.value = '';
};

window.backspacePinInput = function() {
  if (currentPinBuffer.length > 0) {
    currentPinBuffer = currentPinBuffer.slice(0, -1);
    updatePinDots();
    const hiddenInput = document.getElementById('pin-hidden-input');
    if (hiddenInput) hiddenInput.value = currentPinBuffer;
  }
};

window.useDemoPin = function() {
  currentPinBuffer = '1234';
  updatePinDots();
  submitPinVerification();
};

async function submitPinVerification() {
  const errorFeedback = document.getElementById('pin-error-feedback');
  const dotsRow = document.getElementById('pin-dots-display');
  const pin = currentPinBuffer;

  try {
    const res = await fetch(`${API_BASE}/auth/pin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ pin }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'PIN verification failed');
    }

    // Success!
    startAutoLockTimer(data.expiresInMinutes || 5);
    closeSecurityPinModal();
    showSecurityToast('Session Authorized', 'Parent controls unlocked for 5 minutes.');

    if (pendingSecurityAction) {
      const cb = pendingSecurityAction;
      pendingSecurityAction = null;
      await cb();
    }
  } catch (err) {
    // Shake animation
    if (dotsRow) {
      dotsRow.classList.add('shake');
      setTimeout(() => dotsRow.classList.remove('shake'), 450);
    }
    if (errorFeedback) {
      errorFeedback.className = 'pin-feedback-msg error';
      errorFeedback.innerText = err.message;
      errorFeedback.classList.remove('hidden');
    }
    clearPinInput();
    await fetchPinStatus();
  }
}

window.handleManagePinSubmit = async function(event) {
  event.preventDefault();
  const feedback = document.getElementById('manage-pin-feedback');
  const currentPin = document.getElementById('manage-current-pin').value.trim();
  const newPin = document.getElementById('manage-new-pin').value.trim();
  const confirmPin = document.getElementById('manage-confirm-pin').value.trim();

  if (newPin !== confirmPin) {
    feedback.className = 'pin-feedback-msg error';
    feedback.innerText = 'New PIN and Confirm PIN do not match.';
    feedback.classList.remove('hidden');
    return;
  }

  if (!/^\d{4,6}$/.test(newPin)) {
    feedback.className = 'pin-feedback-msg error';
    feedback.innerText = 'PIN must be between 4 and 6 digits.';
    feedback.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/pin/set`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        pin: newPin,
        currentPin: currentPin || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update Master PIN');

    feedback.className = 'pin-feedback-msg success';
    feedback.innerText = 'Master Security PIN updated successfully!';
    feedback.classList.remove('hidden');
    await fetchPinStatus();

    setTimeout(() => {
      switchSecurityTab('VERIFY');
    }, 1200);
  } catch (err) {
    feedback.className = 'pin-feedback-msg error';
    feedback.innerText = err.message;
    feedback.classList.remove('hidden');
  }
};

window.showSecurityToast = function(title, message) {
  const toast = document.getElementById('security-toast-alert');
  const titleEl = document.getElementById('toast-title');
  const msgEl = document.getElementById('toast-message');
  if (toast && titleEl && msgEl) {
    titleEl.innerText = title;
    msgEl.innerText = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
      if (toast) toast.classList.add('hidden');
    }, 7000);
  }

  // 1. Play alert chime via Web Audio API (zero audio file dependencies)
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    // AudioContext blocked or unsupported
  }

  // 2. Native OS / Browser Notification (pops up even when tab is backgrounded)
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body: message,
          icon: '/assets/logo_badge.png'
        });
      } catch (e) {}
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          new Notification(title, {
            body: message,
            icon: '/assets/logo_badge.png'
          });
        }
      });
    }
  }
};

window.dismissSecurityToast = function() {
  const toast = document.getElementById('security-toast-alert');
  if (toast) toast.classList.add('hidden');
};

// Wire up numpad click listeners and keyboard listeners
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.numpad-key[data-val]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const val = btn.getAttribute('data-val');
      handlePinDigit(val);
    });
  });

  const pinHiddenInput = document.getElementById('pin-hidden-input');
  if (pinHiddenInput) {
    pinHiddenInput.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      currentPinBuffer = val.slice(0, 4);
      updatePinDots();
      if (currentPinBuffer.length === 4) {
        submitPinVerification();
      }
    });
  }

  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('parent-security-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeSecurityPinModal();
      }
    }
  });
});

// Auto-initialize on load if already authenticated, or if ?demo=1 query param is passed
(function initParentApp() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('demo') === '1') {
    window.loginAsDemoParent();
  } else if (authToken) {
    initDashboard();
  }
})();

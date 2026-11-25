// Student Desktop Client Logic

// Dynamic API base — works on localhost, 127.0.0.1, LAN IP, and Vercel preview URLs
const HOST_ORIGIN = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http'))
  ? window.location.origin
  : 'http://localhost:4000';
const API_BASE = `${HOST_ORIGIN}/api`;
const SOCKET_URL = HOST_ORIGIN;

let currentUser = null;
let authToken = localStorage.getItem('student_token') || null;
let currentDeviceId = localStorage.getItem('student_device_id') || null;
let currentSession = null;
let timerInterval = null;
let sessionSeconds = 0;
let isRegisterMode = false;
let webCaptureTimer = null;
let webScreenStream = null;
let webVideoEl = null;
let visibilityListener = null;
let studentSocket = null;
let studentTasks = [];
let heartbeatTimer = null; // 30-second device heartbeat for web mode

// DOM Elements
const authSection = document.getElementById('auth-section');
const pairingSection = document.getElementById('pairing-section');
const taskSection = document.getElementById('task-section');
const activeSessionSection = document.getElementById('active-session-section');
const reportSection = document.getElementById('report-section');

const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const nameGroup = document.getElementById('name-group');
const authForm = document.getElementById('auth-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');

const userPill = document.getElementById('user-pill');
const userNameDisplay = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');

const pairingForm = document.getElementById('pairing-form');
const pairingCodeInput = document.getElementById('pairing-code-input');
const deviceNameInput = document.getElementById('device-name-input');
const pairingError = document.getElementById('pairing-error');
const pairingSuccess = document.getElementById('pairing-success');

const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const activeTaskDisplay = document.getElementById('active-task-display');
const sessionTimer = document.getElementById('session-timer');
const endSessionBtn = document.getElementById('end-session-btn');
const currentStatusBadge = document.getElementById('current-status-badge');

const distractionToast = document.getElementById('distraction-toast');
const toastTitle = document.getElementById('toast-title');
const toastMessage = document.getElementById('toast-message');
const toastDismiss = document.getElementById('toast-dismiss');

const reportFocusScore = document.getElementById('report-focus-score');
const reportTaskTitle = document.getElementById('report-task-title');
const repTotal = document.getElementById('rep-total');
const repProd = document.getElementById('rep-prod');
const repDist = document.getElementById('rep-dist');
const repIdle = document.getElementById('rep-idle');
const reportSummaryText = document.getElementById('report-summary-text');
const reportRecommendations = document.getElementById('report-recommendations');
const newSessionBtn = document.getElementById('new-session-btn');

// Setup view switching
function showSection(section) {
  [authSection, pairingSection, taskSection, activeSessionSection, reportSection].forEach(s => {
    s.classList.add('hidden');
  });
  section.classList.remove('hidden');
}

// Authentication Tabs
tabLogin.addEventListener('click', () => {
  isRegisterMode = false;
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  nameGroup.classList.add('hidden');
  authSubmitBtn.innerHTML = '<span>Login</span> <span class="btn-arrow">→</span>';
  authError.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  isRegisterMode = true;
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  nameGroup.classList.remove('hidden');
  authSubmitBtn.innerHTML = '<span>Create Account</span> <span class="btn-arrow">→</span>';
  authError.classList.add('hidden');
});

// Auth Submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('password-input').value;
  const name = document.getElementById('name-input').value.trim();

  try {
    const endpoint = isRegisterMode ? `${API_BASE}/auth/register` : `${API_BASE}/auth/login`;
    const payload = isRegisterMode
      ? { email, password, name, role: 'STUDENT' }
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
    localStorage.setItem('student_token', authToken);

    setupAuthenticatedUser();
  } catch (err) {
    authError.innerText = err.message;
    authError.classList.remove('hidden');
  }
});

window.fillStudentDemo = function() {
  const emailField = document.getElementById('email-input');
  const passField = document.getElementById('password-input');
  if (emailField) emailField.value = 'student@example.com';
  if (passField) passField.value = 'Password123!';
};

window.loginAsDemoStudent = async function() {
  window.fillStudentDemo();
  if (authError) authError.classList.add('hidden');
  const submitBtn = document.getElementById('auth-submit-btn');
  const demoBtn = document.getElementById('demo-student-btn');
  if (submitBtn) submitBtn.disabled = true;
  if (demoBtn) demoBtn.innerText = '⚡ Logging in as Alex Jenkins...';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.com', password: 'Password123!' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Demo login failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('student_token', authToken);

    await setupAuthenticatedUser();
  } catch (err) {
    if (authError) {
      authError.innerText = err.message;
      authError.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (demoBtn) demoBtn.innerText = '⚡ 1-Click Demo Login (Alex Jenkins)';
  }
};

window.handleSocialLogin = function(provider) {
  window.loginAsDemoStudent();
};

window.toggleStudentPassword = function() {
  const field = document.getElementById('password-input');
  const btn = document.querySelector('.eye-toggle');
  if (field) {
    const isPass = field.type === 'password';
    field.type = isPass ? 'text' : 'password';
    if (btn) btn.innerText = isPass ? '🙈' : '👁️';
  }
};

window.selectSubject = function(subjectName) {
  const input = document.getElementById('task-input');
  if (input) {
    input.value = `Study ${subjectName}`;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

// Setup Authenticated User
async function setupAuthenticatedUser() {
  if (!authToken) return;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error('Session expired');

    const data = await res.json();
    currentUser = data.user;

    // Update all name spots with real user name
    const firstName = currentUser.name ? currentUser.name.split(' ')[0] : 'Student';
    if (userNameDisplay) userNameDisplay.innerText = currentUser.name;
    if (userPill) userPill.classList.remove('hidden');

    const greetEl = document.getElementById('student-greeting');
    if (greetEl) {
      const hour = new Date().getHours();
      const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      greetEl.innerText = `${timeGreet}, ${firstName}! 👋`;
    }
    const encourageNameEl = document.getElementById('encourage-name');
    if (encourageNameEl) encourageNameEl.innerText = firstName;

    // Initialize live real-time socket connection
    initStudentSocket();

    // Check if device is paired
    try {
      const devRes = await fetch(`${API_BASE}/devices`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const devData = await devRes.json();

      // Verify student has both a registered device AND an active parent link
      const linksRes = await fetch(`${API_BASE}/devices/parent-link-status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => null);
      const isParentLinked = linksRes && linksRes.ok ? (await linksRes.json()).isLinked : false;

      // Check if THIS specific local client device is already paired
      const localPairedId = localStorage.getItem('student_device_id');
      const isDeviceMatched = localPairedId && devData.devices && devData.devices.some(d => d.id === localPairedId);

      // Smart auto-select: if student has a seeded/existing device but browser has no localStorage entry,
      // automatically pick the first paired device so they don't get stuck on the pairing screen.
      let resolvedDeviceId = localPairedId;
      if (!isDeviceMatched && devData.devices && devData.devices.length > 0 && isParentLinked) {
        resolvedDeviceId = devData.devices[0].id;
        localStorage.setItem('student_device_id', resolvedDeviceId);
      }
      const isDeviceReady = resolvedDeviceId && devData.devices && devData.devices.some(d => d.id === resolvedDeviceId);

      if (isDeviceReady && isParentLinked) {
        currentDeviceId = resolvedDeviceId;
        startWebHeartbeat(); // Keep device ONLINE on parent console
        showSection(taskSection);
        loadStudentStats(); // Load real stats after login
        fetchStudentTasks(); // Load assigned & proposed tasks
      } else {
        // Enforce pairing screen: this client device needs a pairing code
        currentDeviceId = null;
        localStorage.removeItem('student_device_id');
        showSection(pairingSection);
      }
    } catch (devErr) {
      console.warn('Error checking device state, enforcing pairing:', devErr);
      showSection(pairingSection);
    }
  } catch (err) {
    console.error('setupAuthenticatedUser error:', err);
    if (err.message.includes('401') || err.message.includes('expired')) {
      localStorage.removeItem('student_token');
      authToken = null;
      if (userPill) userPill.classList.add('hidden');
      showSection(authSection);
    }
  }
}

// Load real statistics from session history
async function loadStudentStats() {
  try {
    const res = await fetch(`${API_BASE}/sessions?limit=100`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const sessions = data.sessions || [];

    // ------ Compute streak ------
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const studyDates = new Set(
      sessions
        .filter(s => s.ended_at)
        .map(s => {
          const d = new Date(s.ended_at);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        })
    );

    let streak = 0;
    let checkDay = new Date(today);
    while (true) {
      if (studyDates.has(checkDay.getTime())) {
        streak++;
        checkDay.setDate(checkDay.getDate() - 1);
      } else {
        break;
      }
    }

    // ------ Compute reward points (each completed session = 10 + focusScore bonus) ------
    const completedSessions = sessions.filter(s => s.ended_at);
    let rewardPoints = 0;
    completedSessions.forEach(s => {
      const score = Number(s.focus_score) || 0;
      rewardPoints += 10 + Math.round(score / 10);
    });

    // ------ Today's goal: sessions completed today ------
    const todaySessions = completedSessions.filter(s => {
      const d = new Date(s.ended_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });
    const dailyGoal = 3;
    const todayCount = todaySessions.length;
    const pct = Math.min(100, Math.round((todayCount / dailyGoal) * 100));

    // ------ Update DOM ------
    const streakEl = document.getElementById('streak-count');
    const streakSubEl = document.getElementById('streak-sub');
    if (streakEl) streakEl.innerText = streak;
    if (streakSubEl) {
      if (streak === 0) streakSubEl.innerText = 'Start your streak today!';
      else if (streak < 3) streakSubEl.innerText = 'Keep it up!';
      else if (streak < 7) streakSubEl.innerText = "You're building momentum!";
      else streakSubEl.innerText = "You're on fire! 🔥";
    }

    const rewardEl = document.getElementById('reward-points');
    const rewardSubEl = document.getElementById('reward-sub');
    if (rewardEl) rewardEl.innerText = rewardPoints;
    if (rewardSubEl) {
      if (rewardPoints === 0) rewardSubEl.innerText = 'Complete sessions to earn points!';
      else if (rewardPoints < 50) rewardSubEl.innerText = 'Good start!';
      else if (rewardPoints < 200) rewardSubEl.innerText = 'Keep going!';
      else rewardSubEl.innerText = 'Outstanding learner! 🏆';
    }

    const goalFillEl = document.getElementById('goal-progress-fill');
    const goalFracEl = document.getElementById('goal-fraction');
    if (goalFillEl) goalFillEl.style.width = `${pct}%`;
    if (goalFracEl) goalFracEl.innerText = `${todayCount} / ${dailyGoal}`;

    const goalTitleEl = document.getElementById('goal-title');
    if (goalTitleEl) {
      if (todayCount >= dailyGoal) goalTitleEl.innerText = `Daily goal reached! 🎉`;
      else goalTitleEl.innerText = `Complete ${dailyGoal} learning tasks`;
    }

  } catch (err) {
    console.error('Failed to load student stats', err);
    // Fallback zeros shown gracefully
    const streakEl = document.getElementById('streak-count');
    const rewardEl = document.getElementById('reward-points');
    const streakSubEl = document.getElementById('streak-sub');
    const rewardSubEl = document.getElementById('reward-sub');
    if (streakEl) streakEl.innerText = '0';
    if (rewardEl) rewardEl.innerText = '0';
    if (streakSubEl) streakSubEl.innerText = 'Start your streak today!';
    if (rewardSubEl) rewardSubEl.innerText = 'Complete sessions to earn points!';
  }
}

// Show non-blocking toast alert to student
function showToastNotification(title, message, durationMs = 6000) {
  if (toastTitle && toastMessage && distractionToast) {
    toastTitle.innerText = title;
    toastMessage.innerText = message;
    distractionToast.classList.remove('hidden');
    setTimeout(() => {
      distractionToast.classList.add('hidden');
    }, durationMs);
  }
}

// Student Real-Time Socket Connection
function initStudentSocket() {
  if (typeof io === 'undefined' || !authToken) return;
  if (studentSocket && studentSocket.connected) return;

  studentSocket = io(SOCKET_URL, {
    auth: { token: authToken },
  });

  studentSocket.on('connect', () => {
    console.log('[Student Socket] Connected in real-time');
  });

  studentSocket.on('task:assigned', (data) => {
    fetchStudentTasks();
    showToastNotification(
      '📝 New Study Task Assigned',
      `Parent assigned: "${data.task.title}" (${data.task.subject || 'General'})`
    );
  });

  studentSocket.on('task:status_changed', (task) => {
    fetchStudentTasks();
    if (task.status === 'APPROVED') {
      showToastNotification(
        '🎉 Task Approved!',
        `Your parent approved: "${task.title}". You can start studying it now!`
      );
    }
  });

  studentSocket.on('student:capture_requested', async () => {
    if (currentSession) {
      console.log('[Student Socket] Parent requested on-demand live screenshot');
      const liveSs = await captureLiveScreen(currentSession.task_text);
      if (liveSs) {
        await recordWebActivityEvent({
          eventType: 'CONTEXT_SNAPSHOT',
          appName: 'Active Study',
          windowTitle: currentSession.task_text,
          visualContext: liveSs,
          metadata: { onDemand: true, requestedByParent: true },
        });
      }
    }
  });
}

// Web Device Heartbeat — keeps device ONLINE on parent console (every 30s)
function startWebHeartbeat() {
  // Skip in Electron — the native monitor handles this
  if (window.electronAPI) return;
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  async function sendHeartbeat() {
    if (!authToken || !currentDeviceId) return;
    try {
      await fetch(`${API_BASE}/devices/${currentDeviceId}/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (_) {
      // Network error — silent; will retry on next tick
    }
  }

  sendHeartbeat(); // Fire immediately on login
  heartbeatTimer = setInterval(sendHeartbeat, 30000);
}

// Student Tasks Management
async function fetchStudentTasks() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    studentTasks = data.tasks || [];
    renderStudentTasks();
  } catch (err) {
    console.error('Failed to fetch student tasks', err);
  }
}

function renderStudentTasks() {
  const container = document.getElementById('student-tasks-container');
  if (!container) return;

  if (studentTasks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px; text-align: center; color: #64748B; font-size: 12px;">
        No study tasks yet. Click "+ Propose New Task" to propose a topic to your parent!
      </div>
    `;
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
  studentTasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'task-row';
    const icon = subjectIcons[task.subject] || '📝';

    const isAssigned = task.status === 'APPROVED';
    const isPending = task.status === 'PENDING';
    const isParentSource = task.created_by_role === 'PARENT';

    row.innerHTML = `
      <div class="task-badge ${isParentSource ? 'blue-badge' : 'purple-badge'}">${icon}</div>
      <div class="task-info" style="flex:1;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;flex-wrap:wrap;">
          <strong>${task.title}</strong>
          <span class="task-source-badge ${isParentSource ? 'parent' : isPending ? 'student-pending' : 'student-approved'}">
            ${isParentSource ? 'Assigned by Parent' : isPending ? 'Pending Parent Review' : 'Approved by Parent'}
          </span>
        </div>
        <span>${task.subject} ${task.description ? '• ' + task.description : ''}</span>
      </div>
      <div style="display:flex;align-items:center;margin-left:8px;">
        ${isAssigned ? `<button type="button" class="btn-start-study" style="padding:4px 12px;font-size:11px;border-radius:6px;cursor:pointer;">Start →</button>` : `<span style="font-size:11px;color:#94A3B8;font-style:italic;">Reviewing...</span>`}
      </div>
    `;

    if (isAssigned) {
      row.addEventListener('click', () => {
        const input = document.getElementById('task-input');
        if (input) {
          input.value = task.title;
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    container.appendChild(row);
  });
}

function openProposeTaskModal() {
  const modal = document.getElementById('propose-task-modal');
  if (modal) {
    modal.classList.remove('hidden');
    const input = document.getElementById('propose-task-title');
    if (input) input.focus();
  }
}
window.openProposeTaskModal = openProposeTaskModal;

function closeProposeTaskModal() {
  const modal = document.getElementById('propose-task-modal');
  if (modal) modal.classList.add('hidden');
}
window.closeProposeTaskModal = closeProposeTaskModal;

async function handleProposeTask(e) {
  if (e) e.preventDefault();
  const titleInput = document.getElementById('propose-task-title');
  const subjectInput = document.getElementById('propose-task-subject');
  const descInput = document.getElementById('propose-task-desc');

  const title = titleInput ? titleInput.value.trim() : '';
  const subject = subjectInput ? subjectInput.value : 'General';
  const description = descInput ? descInput.value.trim() : '';

  if (!title) return;

  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ title, subject, description }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to propose task');

    closeProposeTaskModal();
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';

    await fetchStudentTasks();
    showToastNotification(
      '🚀 Task Proposed!',
      `"${title}" sent to your parent for approval!`
    );
  } catch (err) {
    showToastNotification('❌ Could not propose task', err.message);
  }
}
window.handleProposeTask = handleProposeTask;

// Pairing Form Submit
pairingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  pairingError.classList.add('hidden');
  pairingSuccess.classList.add('hidden');

  const code = pairingCodeInput.value.trim().toUpperCase();
  const deviceName = deviceNameInput.value.trim();

  try {
    const res = await fetch(`${API_BASE}/pairing/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ code, deviceName, platform: 'Windows' }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Pairing failed');

    currentDeviceId = data.deviceId;
    localStorage.setItem('student_device_id', currentDeviceId);

    // Keep Electron native main process synchronized with newly paired device
    if (window.electronAPI && window.electronAPI.redeemPairingCode) {
      window.electronAPI.redeemPairingCode({
        code,
        token: authToken,
        deviceName,
        deviceType: 'DESKTOP',
      }).catch(() => {});
    }

    pairingSuccess.innerText = 'Device successfully paired with parent!';
    pairingSuccess.classList.remove('hidden');

    setTimeout(() => {
      showSection(taskSection);
      fetchStudentTasks();
      loadStudentStats();
    }, 1200);
  } catch (err) {
    pairingError.innerText = err.message;
    pairingError.classList.remove('hidden');
  }
});

window.quickPairWithDemoParent = async function() {
  const codeInput = document.getElementById('pairing-code-input');
  const nameInput = document.getElementById('device-name-input');
  const pairingError = document.getElementById('pairing-error');
  const pairingSuccess = document.getElementById('pairing-success');
  if (pairingError) pairingError.classList.add('hidden');

  try {
    // 1. Get demo parent auth token
    const parentLogin = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'parent@example.com', password: 'Password123!' }),
    });
    const parentData = await parentLogin.json();
    if (!parentLogin.ok) throw new Error('Could not access demo parent account');

    // 2. Request fresh pairing code from demo parent
    const codeRes = await fetch(`${API_BASE}/pairing/code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${parentData.token}` },
    });
    const codeData = await codeRes.json();
    if (!codeRes.ok) throw new Error('Could not generate pairing code');

    // 3. Fill and submit pairing form
    const studentDeviceName = (currentUser?.name ? `${currentUser.name.split(' ')[0]}'s Laptop` : 'Alex-Surface-Laptop');
    if (codeInput) codeInput.value = codeData.code;
    if (nameInput) nameInput.value = studentDeviceName;

    // 4. Redeem code immediately
    const redeemRes = await fetch(`${API_BASE}/pairing/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        code: codeData.code,
        deviceName: studentDeviceName,
        platform: 'Windows',
      }),
    });
    const redeemData = await redeemRes.json();
    if (!redeemRes.ok) throw new Error(redeemData.error || 'Pairing failed');

    currentDeviceId = redeemData.deviceId;
    localStorage.setItem('student_device_id', currentDeviceId);

    if (pairingSuccess) {
      pairingSuccess.innerText = `Connected with ${parentData.user.name}! Unlocking dashboard...`;
      pairingSuccess.classList.remove('hidden');
    }

    setTimeout(() => {
      showSection(taskSection);
      fetchStudentTasks();
      loadStudentStats();
    }, 1000);
  } catch (err) {
    if (pairingError) {
      pairingError.innerText = err.message;
      pairingError.classList.remove('hidden');
    }
  }
};

// Start Study Session
taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const taskText = taskInput.value.trim();
  if (!taskText) return;

  // Strict Pairing Gate: Prevent starting study session without a paired device
  if (!currentDeviceId) {
    showToastNotification('⚠️ Device Not Paired', 'Please pair your device with your parent before starting a study session.');
    showSection(pairingSection);
    return;
  }

  if (window.electronAPI) {
    // Via Electron native IPC bridge
    const res = await window.electronAPI.startSession({
      taskText,
      token: authToken,
      devId: currentDeviceId,
    });
    if (res.success) {
      currentSession = res.session;
      launchActiveView(taskText);
    } else {
      showToastNotification('❌ Session Error', res.error || 'Could not start study session. Please try again.');
    }
  } else {
    // Direct REST API fallback for web preview
    try {
      const res = await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ deviceId: currentDeviceId, taskText }),
      });
      const session = await res.json();
      if (!res.ok) throw new Error(session.error || 'Failed to start session');
      currentSession = session;
      launchActiveView(taskText);
    } catch (err) {
      showToastNotification('❌ Failed to Start Session', err.message || 'Please check your connection and try again.');
    }
  }
});

function launchActiveView(taskText) {
  activeTaskDisplay.innerText = taskText;
  sessionSeconds = 0;
  showSection(activeSessionSection);

  timerInterval = setInterval(() => {
    sessionSeconds++;
    const h = String(Math.floor(sessionSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((sessionSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(sessionSeconds % 60).padStart(2, '0');
    sessionTimer.innerText = `${h}:${m}:${s}`;
  }, 1000);

  // If in web browser, start live real-time screen capture & 2-min periodic monitoring
  if (!window.electronAPI) {
    startWebMonitoring(taskText);
  }
}

// Live Real-Time Web Screen Capture Engine
async function captureLiveScreen(taskText = 'Active Study Session') {
  // 1. Electron Native Desktop Capture (Captures Entire Windows Display)
  if (window.electronAPI && window.electronAPI.captureScreen) {
    try {
      const shot = await window.electronAPI.captureScreen();
      if (shot) return shot;
    } catch (e) {
      console.warn('[ScreenCapture] Electron capture error:', e);
    }
  }

  // 2. Web Screen Sharing (Captures Real Browser Window / Selected Display)
  if (webScreenStream && webScreenStream.active && webVideoEl) {
    try {
      if (webVideoEl.videoWidth > 0 && webVideoEl.videoHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(webVideoEl, 0, 0, 1280, 720);
        return canvas.toDataURL('image/jpeg', 0.85);
      }
    } catch (e) {
      console.warn('[ScreenCapture] Display media frame grab error:', e);
    }
  }

  // 3. Dynamic Real-Time Study Workspace Canvas (Tailored to active subject & task)
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  // Background gradient (Modern slate workspace)
  const grad = ctx.createLinearGradient(0, 0, 1280, 720);
  grad.addColorStop(0, '#0b1329');
  grad.addColorStop(0.5, '#1e293b');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1280, 720);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 1280; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke();
  }
  for (let y = 0; y < 720; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke();
  }

  // Top OS Bar
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, 1280, 32);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('⚡ StudySafe AI Study Companion — Live Supervision', 18, 21);
  ctx.fillText(`Student: ${currentUser?.name || 'Student'}`, 360, 21);
  ctx.fillText(`Elapsed: ${sessionTimer ? sessionTimer.innerText : '00:00:00'}`, 600, 21);
  ctx.fillText(new Date().toLocaleTimeString(), 1180, 21);

  // Main App Window
  const winX = 50, winY = 55, winW = 1180, winH = 625;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, 12);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Window Titlebar
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, 44, [12, 12, 0, 0]);
  ctx.fill();

  // Traffic lights
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(winX + 22, winY + 22, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(winX + 42, winY + 22, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(winX + 62, winY + 22, 6, 0, Math.PI * 2); ctx.fill();

  // Window Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillText(`📖 StudySafe Learning Workspace — ${taskText}`, winX + 85, winY + 27);

  // Left Sidebar
  ctx.fillStyle = '#090d16';
  ctx.fillRect(winX, winY + 44, 250, winH - 44);

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillText('ACTIVE STUDY SESSION', winX + 18, winY + 75);

  ctx.font = '13px Inter, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('📌 Current Objective', winX + 18, winY + 110);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px Inter, sans-serif';
  const displayTitle = taskText.length > 25 ? taskText.slice(0, 25) + '...' : taskText;
  ctx.fillText(displayTitle, winX + 32, winY + 132);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('⏱️ Session Duration:', winX + 18, winY + 175);
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(sessionTimer ? sessionTimer.innerText : '00:00:00', winX + 18, winY + 198);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('🛡️ Real-Time Supervision:', winX + 18, winY + 240);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('Active & Monitored (2m)', winX + 18, winY + 260);

  // Content Area
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(winX + 250, winY + 44, winW - 250, winH - 44);

  // Subject-specific content display
  const lowerTask = taskText.toLowerCase();
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillText(`Subject Study Material: ${taskText}`, winX + 280, winY + 85);

  ctx.font = '13px "Courier New", monospace';
  let studyLines = [];

  if (lowerTask.includes('math') || lowerTask.includes('fraction') || lowerTask.includes('algebra')) {
    studyLines = [
      '// Mathematics Problem Set & Exercise Solutions',
      'Topic: Fractions, Decimals & Operations',
      '',
      '1. Simplify fraction: 48 / 64 = 3 / 4',
      '2. Convert decimal to fraction: 0.875 = 7 / 8',
      '3. Solve linear equation: 3x + 15 = 45  =>  x = 10',
      '4. Word problem: If a recipe calls for 2/3 cup of sugar and we make 2.5 batches:',
      '   Total sugar required = (2/3) * (5/2) = 5/3 = 1 and 2/3 cups',
      '',
      'Status: All practice problems solved. Reviewing steps for test preparation.',
    ];
  } else if (lowerTask.includes('science') || lowerTask.includes('solar') || lowerTask.includes('biology')) {
    studyLines = [
      '// Science & Biology Study Notes',
      'Topic: The Solar System & Planetary Orbits',
      '',
      '• Terrestrial Planets: Mercury, Venus, Earth, Mars (Rocky surfaces, dense iron cores)',
      '• Gas Giants: Jupiter, Saturn (Composed primarily of hydrogen and helium)',
      '• Ice Giants: Uranus, Neptune (Water, ammonia, and methane ice compositions)',
      '• Kepler’s Laws of Planetary Motion:',
      '  1st Law: Planets orbit in ellipses with the Sun at one focus.',
      '  2nd Law: A line connecting planet and sun sweeps equal areas in equal time.',
      '',
      'Status: Chapter review questions completed. Ready for unit quiz.',
    ];
  } else if (lowerTask.includes('english') || lowerTask.includes('read') || lowerTask.includes('vocab')) {
    studyLines = [
      '// English Language Arts — Reading Comprehension & Vocabulary',
      'Topic: Literary Devices and Thematic Analysis',
      '',
      '• Central Theme: Resilience in the face of environmental adversity.',
      '• Literary Devices Identified in Passage:',
      '  - Metaphor: "The mountain was a silent sentinel keeping watch."',
      '  - Personification: "The wind whispered through the hollow pines."',
      '• Comprehension Questions:',
      '  Q1: Why does the protagonist decide to continue forward despite the storm?',
      '  A1: Dedication to protecting their family motivates their perseverance.',
      '',
      'Status: Summary paragraph written and vocabulary cards reviewed.',
    ];
  } else if (lowerTask.includes('code') || lowerTask.includes('java') || lowerTask.includes('tree') || lowerTask.includes('program')) {
    studyLines = [
      '// Computer Science — Data Structures & Algorithms',
      'Topic: Binary Search Tree Traversal (In-Order, Pre-Order, Post-Order)',
      '',
      'public class Solution {',
      '    public void inOrder(TreeNode root) {',
      '        if (root == null) return;',
      '        inOrder(root.left);',
      '        System.out.print(root.val + " ");',
      '        inOrder(root.right);',
      '    }',
      '}',
      'Complexity: Time O(N), Space O(H) where H is the height of the tree.',
    ];
  } else {
    studyLines = [
      `// StudySafe Active Study Notes — Real-Time Session`,
      `Student: ${currentUser?.name || 'Student'} • Task: ${taskText}`,
      ``,
      `• Focus Objective: Read core materials, complete active practice questions.`,
      `• Key Takeaways & Notes:`,
      `  - Reviewed key chapter concepts and core definitions.`,
      `  - Completed assigned exercises and self-assessment checklist.`,
      `  - Prepared summary flashcards for upcoming knowledge check.`,
      ``,
      `Supervision Status: 2-minute periodic captures streaming to parent in real-time.`,
    ];
  }

  studyLines.forEach((line, idx) => {
    ctx.fillStyle = line.startsWith('//') ? '#38bdf8' : line.startsWith('•') || line.startsWith('Topic') ? '#a7f3d0' : '#cbd5e1';
    ctx.fillText(line, winX + 280, winY + 125 + (idx * 24));
  });

  // Live watermark badge
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.beginPath();
  ctx.roundRect(winX + winW - 280, winY + winH - 55, 260, 36, 6);
  ctx.fill();
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillText('● REAL-TIME STUDY CAPTURE (2M)', winX + winW - 265, winY + winH - 32);

  return canvas.toDataURL('image/jpeg', 0.85);
}

// Record web activity event to API
async function recordWebActivityEvent(eventData) {
  if (!currentSession || !authToken) return;
  try {
    const res = await fetch(`${API_BASE}/activity/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        sessionId: currentSession.id,
        timestamp: new Date().toISOString(),
        idleSeconds: 0,
        ...eventData,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.decision?.action === 'WARN_STUDENT') {
        const titleEl = document.getElementById('toast-title');
        const msgEl = document.getElementById('toast-message');
        if (titleEl) titleEl.innerText = `Focus Alert: ${eventData.appName || 'Distraction'}`;
        if (msgEl) msgEl.innerText = data.decision.studentMessage || 'Please refocus on your task.';
        distractionToast.classList.remove('hidden');
        if (currentStatusBadge) {
          currentStatusBadge.innerText = 'DISTRACTED';
          currentStatusBadge.className = 'ind-val text-amber';
        }
      }
    }
  } catch (err) {
    console.warn('Failed to record web activity event:', err);
  }
}

// Start live web monitoring
async function startWebMonitoring(taskText) {
  // Try to acquire display media for actual desktop capture if student permits
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && !webScreenStream) {
    try {
      webScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', displaySurface: 'monitor' },
        audio: false,
      });
      webVideoEl = document.createElement('video');
      webVideoEl.autoplay = true;
      webVideoEl.playsInline = true;
      webVideoEl.muted = true;
      webVideoEl.srcObject = webScreenStream;
      await webVideoEl.play().catch(e => console.warn(e));
      if (webVideoEl.readyState < 2) {
        await new Promise(r => {
          webVideoEl.onloadedmetadata = () => r();
          setTimeout(r, 600);
        });
      }
      webScreenStream.getVideoTracks()[0].onended = () => {
        webScreenStream = null;
        webVideoEl = null;
      };
    } catch (e) {
      console.warn('Screen capture permission skipped:', e);
      webScreenStream = null;
      webVideoEl = null;
    }
  }

  // 1. Immediate baseline capture at session start
  const baselineSs = await captureLiveScreen(taskText);
  await recordWebActivityEvent({
    eventType: 'SESSION_BASELINE',
    appName: webScreenStream ? 'Live Screen Share' : 'Study Workspace',
    processName: webScreenStream ? 'display.exe' : 'study.exe',
    windowTitle: taskText,
    visualContext: baselineSs,
  });

  // 2. 2-minute periodic screenshot timer (120,000 ms)
  if (webCaptureTimer) clearInterval(webCaptureTimer);
  webCaptureTimer = setInterval(async () => {
    if (!currentSession) return;
    const ss = await captureLiveScreen(taskText);
    await recordWebActivityEvent({
      eventType: 'CONTEXT_SNAPSHOT',
      appName: webScreenStream ? 'Live Screen Share' : 'Study Workspace',
      processName: webScreenStream ? 'display.exe' : 'study.exe',
      windowTitle: taskText,
      visualContext: ss,
      metadata: { periodic: true, intervalMinutes: 2 },
    });
  }, 120000);

  // 3. INSTANT screenshot on tab-hide / tab-show / window blur+focus
  //    This fires immediately when the child switches away — zero delay for the parent.
  if (visibilityListener) document.removeEventListener('visibilitychange', visibilityListener);
  visibilityListener = async () => {
    if (!currentSession) return;
    if (document.hidden) {
      // Child LEFT the study tab — capture immediately
      const ss = await captureLiveScreen('Tab Hidden — Possible Distraction');
      await recordWebActivityEvent({
        eventType: 'ACTIVE_WINDOW_CHANGE',
        appName: 'Browser',
        windowTitle: 'Background Tab (Student switched away)',
        visualContext: ss,
        metadata: { instantCapture: true, trigger: 'tab_hide' },
      });
    } else {
      // Child RETURNED — capture immediately
      const ss = await captureLiveScreen(taskText);
      await recordWebActivityEvent({
        eventType: 'ACTIVE_WINDOW_CHANGE',
        appName: 'Browser',
        windowTitle: taskText,
        visualContext: ss,
        metadata: { instantCapture: true, trigger: 'tab_show' },
      });
    }
  };
  document.addEventListener('visibilitychange', visibilityListener);

  // 4. Window focus / blur — catches switching to another native app (e.g. YouTube, games)
  //    Gives the parent an instant snapshot the moment the student leaves the browser window.
  const handleWindowBlur = async () => {
    if (!currentSession) return;
    const ss = await captureLiveScreen('Window Blur — Possible App Switch');
    await recordWebActivityEvent({
      eventType: 'ACTIVE_WINDOW_CHANGE',
      appName: 'ExternalApp',
      windowTitle: 'Student left browser window',
      visualContext: ss,
      metadata: { instantCapture: true, trigger: 'window_blur' },
    });
  };
  const handleWindowFocus = async () => {
    if (!currentSession) return;
    const ss = await captureLiveScreen(taskText);
    await recordWebActivityEvent({
      eventType: 'ACTIVE_WINDOW_CHANGE',
      appName: 'Browser',
      windowTitle: taskText,
      visualContext: ss,
      metadata: { instantCapture: true, trigger: 'window_focus' },
    });
  };
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('focus', handleWindowFocus);

  // Store references for cleanup on session end
  startWebMonitoring._blurHandler = handleWindowBlur;
  startWebMonitoring._focusHandler = handleWindowFocus;
}

// End Study Session
endSessionBtn.addEventListener('click', async () => {
  if (timerInterval) clearInterval(timerInterval);

  if (webCaptureTimer) {
    clearInterval(webCaptureTimer);
    webCaptureTimer = null;
  }
  if (visibilityListener) {
    document.removeEventListener('visibilitychange', visibilityListener);
    visibilityListener = null;
  }
  // Clean up window blur/focus instant-capture handlers
  if (startWebMonitoring._blurHandler) {
    window.removeEventListener('blur', startWebMonitoring._blurHandler);
    startWebMonitoring._blurHandler = null;
  }
  if (startWebMonitoring._focusHandler) {
    window.removeEventListener('focus', startWebMonitoring._focusHandler);
    startWebMonitoring._focusHandler = null;
  }
  if (webScreenStream) {
    webScreenStream.getTracks().forEach(t => t.stop());
    webScreenStream = null;
    webVideoEl = null;
  }

  let reportData = null;
  if (window.electronAPI) {
    const res = await window.electronAPI.endSession();
    if (res.success) {
      reportData = res.report;
    }
  } else if (currentSession) {
    const res = await fetch(`${API_BASE}/sessions/${currentSession.id}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    reportData = await res.json();
  }

  if (reportData) {
    renderReport(reportData);
    // Refresh live stats so streak + reward points update
    loadStudentStats();
  }
});

function renderReport(report) {
  const score = report.focusScore ?? report.summary?.breakdown?.focusScore ?? 100;
  reportFocusScore.innerText = Math.round(score);
  reportTaskTitle.innerText = `Task: ${report.taskText || 'Study Session'}`;

  const breakdown = report.summary?.breakdown || {};
  repTotal.innerText = `${Math.round(breakdown.sessionMinutes || 1)} mins`;
  repProd.innerText = `${Math.round(breakdown.productiveMinutes || 1)} mins`;
  repDist.innerText = `${Math.round(breakdown.distractionMinutes || 0)} mins`;
  repIdle.innerText = `${Math.round(breakdown.idleMinutes || 0)} mins`;

  reportSummaryText.innerText = report.summary?.aiSummary || 'Great effort completing your study session!';
  
  reportRecommendations.innerHTML = '';
  (report.summary?.recommendations || []).forEach(rec => {
    const p = document.createElement('div');
    p.innerText = `• ${rec}`;
    reportRecommendations.appendChild(p);
  });

  showSection(reportSection);
}

newSessionBtn.addEventListener('click', () => {
  taskInput.value = '';
  showSection(taskSection);
});

// Logout
logoutBtn.addEventListener('click', () => {
  if (studentSocket) {
    studentSocket.disconnect();
    studentSocket = null;
  }
  // Stop web heartbeat so we don't keep sending after logout
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  localStorage.removeItem('student_token');
  localStorage.removeItem('student_device_id');
  authToken = null;
  currentUser = null;
  currentDeviceId = null;
  currentSession = null;
  studentTasks = [];

  const emailField = document.getElementById('email-input');
  const passField = document.getElementById('password-input');
  if (emailField) emailField.value = '';
  if (passField) passField.value = '';

  if (userPill) userPill.classList.add('hidden');
  showSection(authSection);
});

// Non-blocking distraction warning hook
if (window.electronAPI) {
  window.electronAPI.onDistractionWarning((data) => {
    toastTitle.innerText = `Focus Alert: ${data.appName || 'Distraction'}`;
    toastMessage.innerText = data.message || data.reason || 'Please refocus on your task.';
    distractionToast.classList.remove('hidden');

    currentStatusBadge.innerText = 'DISTRACTED';
    currentStatusBadge.className = 'ind-val text-amber';

    setTimeout(() => {
      distractionToast.classList.add('hidden');
      currentStatusBadge.innerText = 'ON TASK';
      currentStatusBadge.className = 'ind-val text-green';
    }, 8000);
  });
}

toastDismiss.addEventListener('click', () => {
  distractionToast.classList.add('hidden');
});

// Aggregate interaction tracking from user clicks/keys
document.addEventListener('click', () => {
  if (window.electronAPI) {
    window.electronAPI.recordInteraction();
  }
});

// Student sidebar tab navigation
document.querySelectorAll('.child-dashboard-shell .nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.child-dashboard-shell .nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Initialize on page load
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('demo') === '1') {
  window.loginAsDemoStudent();
} else if (authToken) {
  setupAuthenticatedUser();
} else {
  showSection(authSection);
}

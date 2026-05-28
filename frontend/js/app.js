/* ========================================
   app.js — Shared utilities & UI helpers
   ======================================== */

const API_BASE = "https://traffic-tracking-system.onrender.com/api";

/* ---- Auth helpers ---- */
const Auth = {
  getToken: () => localStorage.getItem('token'),

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  },

  isLoggedIn: () => !!localStorage.getItem('token'),

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
  },

  require() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }
};

/* ---- Toast Notifications ---- */
const Toast = (() => {
  let container;

  function ensureContainer() {
    if (!container || !document.body.contains(container)) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  function show(type, title, msg, duration = 4500) {
    const c = ensureContainer();
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const safe = s => String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    t.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-body">
        <div class="toast-title">${safe(title)}</div>
        ${msg ? `<div class="toast-msg">${safe(msg)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">×</button>
    `;
    t.querySelector('.toast-close').addEventListener('click', () => t.remove());
    c.appendChild(t);

    const timer = setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 300);
    }, duration);

    t.addEventListener('mouseenter', () => clearTimeout(timer));
    return t;
  }

  return {
    success: (title, msg) => show('success', title, msg),
    error  : (title, msg) => show('error',   title, msg),
    warning: (title, msg) => show('warning', title, msg),
    info   : (title, msg) => show('info',    title, msg),
  };
})();

/* ---- Dark Mode ---- */
const Theme = (() => {
  const KEY = 'tt-theme';
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
  }
  function init() {
    const saved = localStorage.getItem(KEY) || 'light';
    apply(saved);
    return saved;
  }
  function toggle() {
    const cur  = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    apply(next);
    return next;
  }
  return { init, toggle, apply };
})();

/* ---- API fetch helper ---- */
async function apiFetch(path, options = {}, _retries = 2) {
  const token = Auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let data = {};
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch { data = {}; }
    }

    /* Auto-logout on 401 (expired/invalid token) — but not on login page */
    if (res.status === 401 && token && !window.location.pathname.endsWith('login.html')) {
      Auth.logout();
      return { ok: false, status: 401, data: { message: 'Session expired — please sign in again.' } };
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (_retries > 0) {
      await new Promise(r => setTimeout(r, (3 - _retries) * 400));
      return apiFetch(path, options, _retries - 1);
    }
    console.error('[apiFetch] Network error on', path, err);
    showOfflineBanner();
    return {
      ok    : false,
      status: 0,
      data  : { message: 'Network error — check your connection or try again.' },
    };
  }
}

/* ---- Global unhandled-promise error handler ---- */
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise]', e.reason);
  if (e.reason && e.reason.name === 'AbortError') return;
  Toast.error('Unexpected error', 'Something went wrong. Please refresh.');
});

/* ---- Sidebar wiring ---- */
function initSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebarOverlay');
  const hamburger = document.getElementById('hamburger');

  function openSidebar()  { sidebar?.classList.add('open');    overlay?.classList.add('open'); }
  function closeSidebar() { sidebar?.classList.remove('open'); overlay?.classList.remove('open'); }

  if (hamburger && !hamburger._sidebarBound) {
    hamburger.addEventListener('click', openSidebar);
    hamburger._sidebarBound = true;
  }
  if (overlay && !overlay._sidebarBound) {
    overlay.addEventListener('click', closeSidebar);
    overlay._sidebarBound = true;
  }

  /* Populate user info */
  const user = Auth.getUser();
  if (user) {
    const raw      = (user.name || user.email || '?');
    const initials = raw.slice(0, 2).toUpperCase();

    const sidebarUser = document.getElementById('sidebarUser');
    if (sidebarUser) {
      sidebarUser.innerHTML = `
        <div class="avatar">${escapeHtml(initials)}</div>
        <div>
          <div class="sidebar-user-name">${escapeHtml(user.name || 'User')}</div>
          <div class="sidebar-user-role">${escapeHtml(user.role || 'citizen')}</div>
        </div>
      `;
    }

    /* Show admin-only nav items — remove the inline display:none */
    if (user.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.removeProperty('display');
      });
    }

    /* Show admin/officer stat cards on dashboard */
    if (user.role === 'admin' || user.role === 'officer') {
      document.querySelectorAll('.admin-stat').forEach(el => {
        el.style.removeProperty('display');
      });
    }

    const tbName   = document.getElementById('topbarUserName');
    const tbRole   = document.getElementById('topbarUserRole');
    const tbAvatar = document.getElementById('topbarAvatar');
    if (tbName)   tbName.textContent   = user.name  || user.email || 'User';
    if (tbRole)   tbRole.textContent   = user.role  || 'citizen';
    if (tbAvatar) tbAvatar.textContent = initials;
  }

  /* Logout buttons */
  document.querySelectorAll('[data-action="logout"]').forEach(el => {
    if (!el._logoutBound) {
      el.addEventListener('click', () => Auth.logout());
      el._logoutBound = true;
    }
  });

  /* Dark mode toggle */
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn && !themeBtn._themeBound) {
    function updateIcon(theme) {
      themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
      themeBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
    updateIcon(document.documentElement.getAttribute('data-theme') || 'light');
    themeBtn.addEventListener('click', () => updateIcon(Theme.toggle()));
    themeBtn._themeBound = true;
  }

  /* Mark active nav link */
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
}

/* ---- Safe HTML escape ---- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---- Format helpers ---- */
function formatCurrency(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '—';
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status) {
  const map = {
    paid       : ['badge-success', '✓ Paid'],
    pending    : ['badge-warning', '⏳ Pending'],
    contested  : ['badge-danger',  '⚡ Contested'],
    active     : ['badge-success', '● Active'],
    suspended  : ['badge-danger',  '✕ Suspended'],
    offline    : ['badge-danger',  '● Offline'],
    maintenance: ['badge-warning', '⚙ Maint.'],
  };
  const [cls, label] = map[status] || ['badge-neutral', escapeHtml(status || '—')];
  return `<span class="badge ${cls}">${label}</span>`;
}

function roleBadge(role) {
  const map = {
    admin  : ['badge-danger',  '👑 Admin'],
    officer: ['badge-info',    '🚔 Officer'],
    citizen: ['badge-neutral', '👤 Citizen'],
  };
  const [cls, label] = map[role] || ['badge-neutral', escapeHtml(role || '—')];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ---- Skeleton rows ---- */
function skeletonRows(cols, count = 5) {
  const cell = '<td><span class="skeleton" style="display:block;height:14px;border-radius:4px;"></span></td>';
  const row  = `<tr class="skeleton-row">${cell.repeat(cols)}</tr>`;
  return row.repeat(count);
}

/* ---- Offline banner ---- */
function showOfflineBanner() {
  if (document.getElementById('offlineBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'offlineBanner';
  banner.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:9998',
    'background:#ef4444;color:#fff',
    'padding:10px 20px;font-size:13px;font-weight:600',
    'text-align:center;display:flex;align-items:center;justify-content:center;gap:12px',
  ].join(';');
  banner.innerHTML = `
    ⚠️ Cannot connect to the server. Some features may be unavailable.
    <button onclick="location.reload()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">Retry</button>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;">×</button>
  `;
  document.body.prepend(banner);
}

function hideOfflineBanner() {
  document.getElementById('offlineBanner')?.remove();
}

/* ---- Shared modal close ---- */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* ---- Init on DOMContentLoaded ---- */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  initSidebar();
});

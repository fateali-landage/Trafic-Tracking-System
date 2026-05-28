/* ========================================
   users.js — User management logic
   ======================================== */

let allUsers      = [];
let filteredUsers = [];
let currentPage   = 1;
const PAGE_SIZE   = 15;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.require()) return;

  const user = Auth.getUser();
  if (user?.role !== 'admin') {
    document.querySelector('.page-body').innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">🔒</div>
        <h3>Admin Access Required</h3>
        <p>User management is restricted to administrators.</p>
        <a href="dashboard.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Go to Dashboard</a>
      </div>`;
    return;
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  const body = document.getElementById('usersBody');
  if (body) body.innerHTML = skeletonRows(6, 6);

  await loadUsers();
});

async function loadUsers() {
  const body = document.getElementById('usersBody');
  if (body) body.innerHTML = skeletonRows(6, 6);

  const { ok, status, data } = await apiFetch('/users');

  if (status === 0) { showOfflineBanner(); showError('Cannot connect to server'); return; }
  if (!ok) {
    if (status === 401) return Auth.logout();
    if (status === 403) { showError('Access denied'); return; }
    Toast.error('Load failed', data.message || 'Could not fetch users.');
    showError('Failed to load users');
    return;
  }

  hideOfflineBanner();
  allUsers = Array.isArray(data.users) ? data.users : [];
  applyFilters();
}

function showError(msg) {
  const body = document.getElementById('usersBody');
  if (!body) return;
  body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">⚠️</div><h3>${escapeHtml(msg)}</h3></div></td></tr>`;
}

function applyFilters() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const role  = document.getElementById('roleFilter')?.value || '';

  filteredUsers = allUsers.filter(u => {
    const matchSearch = !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
    const matchRole   = !role  || u.role === role;
    return matchSearch && matchRole;
  });

  currentPage = 1;
  renderPage();
}

function renderPage() {
  const tbody = document.getElementById('usersBody');
  if (!tbody) return;

  const total = filteredUsers.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const items = filteredUsers.slice(start, start + PAGE_SIZE);

  const pInfo = document.getElementById('paginationInfo');
  if (pInfo) pInfo.textContent = total === 0 ? 'No results' : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}`;

  const currentUser = Auth.getUser();

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👤</div><h3>No users found</h3></div></td></tr>`;
    renderPagination(0, 1);
    return;
  }

  tbody.innerHTML = items.map(u => {
    const initials = (u.name || u.email || '?').slice(0, 2).toUpperCase();
    const isSelf   = u.id === currentUser?.id;
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="avatar" style="width:36px;height:36px;font-size:13px;background:${roleColor(u.role)};">${escapeHtml(initials)}</div>
            <div>
              <div style="font-weight:600;font-size:13px;">${escapeHtml(u.name)}</div>
              ${isSelf ? '<div style="font-size:11px;color:var(--accent);">You</div>' : ''}
            </div>
          </div>
        </td>
        <td class="td-muted" style="font-size:12px;">${escapeHtml(u.email)}</td>
        <td>${roleBadge(u.role)}</td>
        <td style="font-weight:600;">${u.violations_reported}</td>
        <td class="td-muted" style="font-size:12px;">${formatDate(u.created_at)}</td>
        <td>
          ${!isSelf ? `<button class="btn btn-outline btn-sm js-role-btn" data-id="${u.id}" data-name="${escapeHtml(u.name)}" data-role="${u.role}" style="padding:4px 10px;">Change Role</button>` : '<span style="font-size:12px;color:var(--text-muted);">—</span>'}
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.js-role-btn').forEach(btn => {
    btn.addEventListener('click', () => openRoleModal(parseInt(btn.dataset.id, 10), btn.dataset.name, btn.dataset.role));
  });

  renderPagination(pages, currentPage);
}

function roleColor(role) {
  return role === 'admin' ? '#ef4444' : role === 'officer' ? '#3b82f6' : '#64748b';
}

function renderPagination(pages, cur) {
  const btns = document.getElementById('pageBtns');
  if (!btns) return;
  if (pages <= 1) { btns.innerHTML = ''; return; }

  const mkBtn = (label, page, disabled = false, active = false) =>
    `<button class="page-btn${active ? ' active' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;

  let html = mkBtn('‹', cur - 1, cur === 1);
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - cur) <= 1) html += mkBtn(i, i, false, i === cur);
    else if (Math.abs(i - cur) === 2) html += `<span style="padding:0 4px;color:var(--text-muted);">…</span>`;
  }
  html += mkBtn('›', cur + 1, cur === pages);
  btns.innerHTML = html;
  btns.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page, 10); renderPage(); });
  });
}

/* ---- Role Modal ---- */
function openRoleModal(id, name, currentRole) {
  document.getElementById('roleUserId').value = id;
  document.getElementById('roleUserName').textContent = name;
  document.getElementById('newRole').value = currentRole;
  document.getElementById('roleModal')?.classList.add('open');
}

async function saveRole() {
  const uid     = parseInt(document.getElementById('roleUserId').value, 10);
  const newRole = document.getElementById('newRole').value;

  const { ok, status, data } = await apiFetch(`/users/${uid}/role`, {
    method: 'PUT',
    body  : JSON.stringify({ role: newRole }),
  });

  if (status === 0) {
    Toast.error('No connection', 'Cannot reach server.');
  } else if (ok) {
    Toast.success('Role updated', `User role changed to ${newRole}.`);
    const u = allUsers.find(x => x.id === uid);
    if (u) u.role = newRole;
    closeModal('roleModal');
    applyFilters();
  } else {
    Toast.error('Failed', data.message || 'Could not update role.');
  }
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/* ========================================
   vehicles.js — Vehicle management logic
   ======================================== */

let allVehicles      = [];
let filteredVehicles = [];
let currentPage      = 1;
const PAGE_SIZE      = 10;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.require()) return;

  const user = Auth.getUser();
  if (user && (user.role === 'admin' || user.role === 'officer')) {
    const btn = document.getElementById('addVehicleBtn');
    if (btn) btn.style.display = 'inline-flex';
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  const body = document.getElementById('vehiclesBody');
  if (body) body.innerHTML = skeletonRows(9, 6);

  await loadVehicles();
});

async function loadVehicles() {
  const body = document.getElementById('vehiclesBody');
  if (body) body.innerHTML = skeletonRows(9, 6);

  const { ok, status, data } = await apiFetch('/vehicles');

  if (status === 0) { showOfflineBanner(); showError('Cannot connect to server'); return; }
  if (!ok) {
    if (status === 401) return Auth.logout();
    Toast.error('Load failed', data.message || 'Could not fetch vehicles.');
    showError('Failed to load vehicles');
    return;
  }

  hideOfflineBanner();
  allVehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  applyFilters();
}

function showError(msg) {
  const body = document.getElementById('vehiclesBody');
  if (!body) return;
  body.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">⚠️</div><h3>${escapeHtml(msg)}</h3><p><a href="#" onclick="event.preventDefault();loadVehicles();" style="color:var(--accent);">Try again</a></p></div></td></tr>`;
}

function applyFilters() {
  const query  = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const type   = document.getElementById('typeFilter')?.value   || '';
  const status = document.getElementById('statusFilter')?.value || '';

  filteredVehicles = allVehicles.filter(v => {
    const matchSearch = !query || v.vehicle_number.toLowerCase().includes(query) || v.owner_name.toLowerCase().includes(query);
    const matchType   = !type   || v.vehicle_type === type;
    const matchStatus = !status || v.status === status;
    return matchSearch && matchType && matchStatus;
  });

  currentPage = 1;
  renderPage();
}

function renderPage() {
  const tbody = document.getElementById('vehiclesBody');
  if (!tbody) return;

  const total = filteredVehicles.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const items = filteredVehicles.slice(start, start + PAGE_SIZE);

  const pInfo = document.getElementById('paginationInfo');
  if (pInfo) pInfo.textContent = total === 0 ? 'No results' : `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}`;

  const user      = Auth.getUser();
  const canEdit   = user?.role === 'admin' || user?.role === 'officer';
  const canDelete = user?.role === 'admin';

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🚗</div><h3>No vehicles found</h3><p>No vehicles match your search criteria.</p></div></td></tr>`;
    renderPagination(0, 1);
    return;
  }

  tbody.innerHTML = items.map(v => {
    const actions = [];
    if (canEdit) actions.push(`<button class="btn btn-outline btn-sm js-edit-btn" data-id="${v.id}" style="padding:4px 8px;">✏️ Edit</button>`);
    if (canDelete) actions.push(`<button class="btn btn-sm js-del-btn" data-id="${v.id}" style="padding:4px 8px;border:1px solid var(--danger);color:var(--danger);background:transparent;">🗑</button>`);

    const vcntClass = v.violations > 0 ? (v.violations > 3 ? 'color:var(--danger);font-weight:700;' : 'color:var(--warning);font-weight:600;') : '';
    return `
      <tr>
        <td><span class="vehicle-num">${escapeHtml(v.vehicle_number)}</span></td>
        <td>
          <div style="font-weight:600;">${escapeHtml(v.owner_name)}</div>
          ${v.owner_email ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(v.owner_email)}</div>` : ''}
        </td>
        <td>${escapeHtml(v.vehicle_type || '—')}</td>
        <td>${escapeHtml([v.make, v.model].filter(Boolean).join(' ') || '—')}</td>
        <td class="td-muted">${v.year || '—'}</td>
        <td class="td-muted">${escapeHtml(v.color || '—')}</td>
        <td>${statusBadge(v.status)}</td>
        <td style="${vcntClass}">${v.violations}</td>
        <td>
          <div style="display:flex;gap:4px;">${actions.join('')}</div>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.js-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id, 10)));
  });
  tbody.querySelectorAll('.js-del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteVehicle(parseInt(btn.dataset.id, 10)));
  });

  renderPagination(pages, currentPage);
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

/* ---- Add/Edit Modal ---- */
function openAddModal() {
  document.getElementById('vehicleModalTitle').textContent = '🚗 Register Vehicle';
  document.getElementById('vehicleSubmitBtn').textContent  = 'Register';
  document.getElementById('editVehicleId').value = '';
  document.getElementById('vehicleForm').reset();

  const plateField = document.getElementById('vPlate');
  if (plateField) { plateField.disabled = false; plateField.style.opacity = ''; }

  document.getElementById('vehicleModal')?.classList.add('open');
}

function openEditModal(id) {
  const v = allVehicles.find(x => x.id === id);
  if (!v) return;

  document.getElementById('vehicleModalTitle').textContent = '✏️ Edit Vehicle';
  document.getElementById('vehicleSubmitBtn').textContent  = 'Save Changes';
  document.getElementById('editVehicleId').value           = id;

  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('vPlate', v.vehicle_number);
  set('vType',  v.vehicle_type);
  set('vOwner', v.owner_name);
  set('vEmail', v.owner_email);
  set('vPhone', v.owner_phone);
  set('vMake',  v.make);
  set('vModel', v.model);
  set('vYear',  v.year || '');
  set('vColor', v.color);
  set('vStatus',v.status);

  const plateField = document.getElementById('vPlate');
  if (plateField) { plateField.disabled = true; plateField.style.opacity = '.7'; }

  document.getElementById('vehicleModal')?.classList.add('open');
}

async function submitVehicle(e) {
  e.preventDefault();
  const btn = document.getElementById('vehicleSubmitBtn');
  const vid = document.getElementById('editVehicleId').value;
  const isEdit = !!vid;

  const origText  = btn.textContent;
  btn.textContent = isEdit ? 'Saving…' : 'Registering…';
  btn.disabled    = true;

  const payload = {
    vehicle_number: document.getElementById('vPlate')?.value?.trim().toUpperCase(),
    owner_name    : document.getElementById('vOwner')?.value?.trim(),
    owner_email   : document.getElementById('vEmail')?.value?.trim(),
    owner_phone   : document.getElementById('vPhone')?.value?.trim(),
    vehicle_type  : document.getElementById('vType')?.value,
    make          : document.getElementById('vMake')?.value?.trim(),
    model         : document.getElementById('vModel')?.value?.trim(),
    year          : parseInt(document.getElementById('vYear')?.value) || null,
    color         : document.getElementById('vColor')?.value?.trim(),
    status        : document.getElementById('vStatus')?.value,
  };

  const path   = isEdit ? `/vehicles/${vid}` : '/vehicles';
  const method = isEdit ? 'PUT' : 'POST';

  const { ok, status, data } = await apiFetch(path, { method, body: JSON.stringify(payload) });

  if (status === 0) {
    Toast.error('No connection', 'Cannot reach server.');
  } else if (ok) {
    Toast.success(isEdit ? 'Vehicle updated' : 'Vehicle registered', data.message);
    closeModal('vehicleModal');
    await loadVehicles();
  } else {
    Toast.error('Failed', data.message || 'Operation failed.');
  }

  btn.textContent = origText;
  btn.disabled    = false;
}

async function deleteVehicle(id) {
  const v = allVehicles.find(x => x.id === id);
  if (!confirm(`Delete vehicle ${v?.vehicle_number}? This cannot be undone.`)) return;

  const { ok, data } = await apiFetch(`/vehicles/${id}`, { method: 'DELETE' });
  if (ok) {
    Toast.success('Deleted', `Vehicle ${v?.vehicle_number} removed.`);
    await loadVehicles();
  } else {
    Toast.error('Delete failed', data.message || 'Could not delete vehicle.');
  }
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/* ========================================
   violations.js — Violations page logic
   ======================================== */

let allViolations      = [];
let filteredViolations = [];
let currentFilter = 'all';
let currentSort   = { key: 'created_at', dir: 'desc' };
let currentPage   = 1;
const PAGE_SIZE   = 10;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.require()) return;

  const user = Auth.getUser();
  if (user && (user.role === 'admin' || user.role === 'officer')) {
    const btn = document.getElementById('addViolationBtn');
    if (btn) btn.style.display = 'inline-flex';
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  const body = document.getElementById('violationsBody');
  if (body) body.innerHTML = skeletonRows(7, 6);

  await loadViolations();
});

async function loadViolations() {
  const body = document.getElementById('violationsBody');
  const info = document.getElementById('paginationInfo');
  if (body) body.innerHTML = skeletonRows(7, 6);
  if (info) info.textContent = 'Loading…';

  const { ok, status, data } = await apiFetch('/traffic/violations');

  if (status === 0) {
    showOfflineBanner();
    showViolationsError('Cannot connect to server');
    return;
  }

  if (!ok) {
    if (status === 401) return Auth.logout();
    Toast.error('Load failed', data.message || 'Could not fetch violations.');
    showViolationsError('Failed to load violations');
    return;
  }

  hideOfflineBanner();
  allViolations = Array.isArray(data.violations) ? data.violations : [];
  applyFilters();
}

function showViolationsError(msg) {
  const body = document.getElementById('violationsBody');
  if (!body) return;
  body.innerHTML = `
    <tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>${escapeHtml(msg)}</h3>
        <p>Check your connection and <a href="#" onclick="event.preventDefault();loadViolations();" style="color:var(--accent);">try again</a>.</p>
      </div>
    </td></tr>`;
}

function setFilter(el, filter) {
  currentFilter = filter;
  currentPage   = 1;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}

function applyFilters() {
  const query     = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const typeQuery = (document.getElementById('typeFilter')?.value  || '').toLowerCase();

  filteredViolations = allViolations.filter(v => {
    const matchFilter = currentFilter === 'all' || v.status === currentFilter;
    const vNum  = (v.vehicle_number  || '').toLowerCase();
    const vType = (v.violation_type  || '').toLowerCase();
    const matchSearch = !query || vNum.includes(query) || vType.includes(query);
    const matchType   = !typeQuery || vType === typeQuery;
    return matchFilter && matchSearch && matchType;
  });

  applySortToFiltered();
  renderPage();
}

function sortBy(key) {
  currentSort = (currentSort.key === key)
    ? { key, dir: currentSort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: 'asc' };

  document.querySelectorAll('thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = '↕';
    const oc = th.getAttribute('onclick') || '';
    if (oc.includes(`'${key}'`)) {
      th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      if (icon) icon.textContent = currentSort.dir === 'asc' ? '↑' : '↓';
    }
  });

  applySortToFiltered();
  renderPage();
}

function applySortToFiltered() {
  const { key, dir } = currentSort;
  filteredViolations.sort((a, b) => {
    let va = a[key] ?? '';
    let vb = b[key] ?? '';
    if (key === 'fine_amount') { va = parseFloat(va) || 0; vb = parseFloat(vb) || 0; }
    else if (key === 'created_at') { va = new Date(va).getTime() || 0; vb = new Date(vb).getTime() || 0; }
    else if (key === 'id') { va = Number(va); vb = Number(vb); }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

function renderPage() {
  const tbody = document.getElementById('violationsBody');
  if (!tbody) return;

  const total = filteredViolations.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const items = filteredViolations.slice(start, start + PAGE_SIZE);

  const pInfo  = document.getElementById('paginationInfo');
  const pStart = total === 0 ? 0 : start + 1;
  const pEnd   = Math.min(start + PAGE_SIZE, total);
  if (pInfo) pInfo.textContent = total === 0 ? 'No results' : `Showing ${pStart}–${pEnd} of ${total}`;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No violations found</h3>
          <p>${currentFilter !== 'all' ? 'Try clearing the filter.' : 'No violations have been recorded yet.'}</p>
        </div>
      </td></tr>`;
    renderPagination(0, 1);
    return;
  }

  const user   = Auth.getUser();
  const canPay = user?.role === 'citizen' || user?.role === 'admin';
  const canDelete = user?.role === 'admin';

  tbody.innerHTML = items.map(v => {
    const actionCell = (() => {
      const parts = [];
      parts.push(`<button class="btn btn-outline btn-sm js-detail-btn" data-id="${v.id}" style="padding:4px 8px;">👁 View</button>`);
      if (v.status === 'pending' && canPay) {
        parts.push(`<button class="btn btn-primary btn-sm js-pay-btn"
                            data-id="${v.id}"
                            data-vehicle="${escapeHtml(v.vehicle_number)}"
                            data-amount="${parseFloat(v.fine_amount) || 0}"
                            style="padding:4px 8px;">💳 Pay</button>`);
      }
      if (canDelete) {
        parts.push(`<button class="btn btn-sm js-delete-btn" data-id="${v.id}" style="padding:4px 8px;border:1px solid var(--danger);color:var(--danger);background:transparent;">🗑</button>`);
      }
      return `<div style="display:flex;gap:4px;">${parts.join('')}</div>`;
    })();

    return `
      <tr>
        <td class="td-muted" style="font-size:12px;">#${v.id}</td>
        <td><span class="vehicle-num">${escapeHtml(v.vehicle_number || '—')}</span></td>
        <td>${escapeHtml(v.violation_type || '—')}</td>
        <td style="font-weight:700;">${formatCurrency(v.fine_amount)}</td>
        <td>${statusBadge(v.status)}</td>
        <td class="td-muted">${formatDate(v.created_at)}</td>
        <td>${actionCell}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.js-pay-btn').forEach(btn => {
    btn.addEventListener('click', () => openPayModal(
      parseInt(btn.dataset.id, 10),
      btn.dataset.vehicle,
      parseFloat(btn.dataset.amount),
    ));
  });

  tbody.querySelectorAll('.js-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => openDetailModal(parseInt(btn.dataset.id, 10)));
  });

  tbody.querySelectorAll('.js-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteViolation(parseInt(btn.dataset.id, 10)));
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
    if (i === 1 || i === pages || Math.abs(i - cur) <= 1) {
      html += mkBtn(i, i, false, i === cur);
    } else if (Math.abs(i - cur) === 2) {
      html += `<span style="padding:0 4px;color:var(--text-muted);">…</span>`;
    }
  }
  html += mkBtn('›', cur + 1, cur === pages);
  btns.innerHTML = html;

  btns.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = parseInt(btn.dataset.page, 10); renderPage(); });
  });
}

/* ---- Detail Modal ---- */
function openDetailModal(id) {
  const v = allViolations.find(x => x.id === id);
  if (!v) return;

  const content = document.getElementById('detailContent');
  if (content) {
    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Vehicle</div>
          <div class="vehicle-num" style="font-size:15px;">${escapeHtml(v.vehicle_number)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Status</div>
          ${statusBadge(v.status)}
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Violation Type</div>
          <div style="font-size:13px;font-weight:600;">${escapeHtml(v.violation_type)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Fine Amount</div>
          <div style="font-size:18px;font-weight:800;color:var(--accent);">${formatCurrency(v.fine_amount)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Recorded On</div>
          <div style="font-size:13px;">${formatDate(v.created_at)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Location</div>
          <div style="font-size:13px;">${escapeHtml(v.location || '—')}</div>
        </div>
      </div>
      ${v.description ? `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Description</div>
          <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(v.description)}</div>
        </div>
      ` : ''}
      ${v.paid_at ? `<div style="font-size:12px;color:var(--success);font-weight:600;">✓ Paid on ${formatDate(v.paid_at)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button class="btn btn-outline" style="flex:1;justify-content:center;" onclick="closeModal('detailModal')">Close</button>
        ${v.status === 'pending' ? `<button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="closeModal('detailModal');openPayModal(${v.id},'${escapeHtml(v.vehicle_number)}',${parseFloat(v.fine_amount)||0})">💳 Pay Now</button>` : ''}
      </div>
    `;
  }
  document.getElementById('detailModal')?.classList.add('open');
}

/* ---- Payment Modal ---- */
let payingViolationId = null;

function openPayModal(id, vehicle, amount) {
  payingViolationId = id;
  const setEl = (elId, val) => { const el = document.getElementById(elId); if (el) el.textContent = val; };
  setEl('payViolationId', '#' + id);
  setEl('payVehicle',     vehicle);
  setEl('payAmount',      formatCurrency(amount));

  const step1 = document.getElementById('payStep1');
  const step2 = document.getElementById('payStep2');
  if (step1) step1.style.display = '';
  if (step2) step2.style.display = 'none';

  document.getElementById('payModal')?.classList.add('open');
}

async function processPayment() {
  const btn = document.getElementById('payNowBtn');
  if (!btn) return;

  const origText  = btn.textContent;
  btn.textContent = '⏳ Processing…';
  btn.disabled    = true;

  const { ok, status, data } = await apiFetch(`/traffic/violations/${payingViolationId}/pay`, { method: 'POST' });

  if (status === 0 || !ok) {
    Toast.error('Payment failed', data?.message || 'Could not process payment.');
    btn.textContent = origText;
    btn.disabled    = false;
    return;
  }

  /* Update local data */
  const v = allViolations.find(x => x.id === payingViolationId);
  if (v) {
    v.status  = 'paid';
    v.paid_at = data.violation?.paid_at;
  }

  const step1 = document.getElementById('payStep1');
  const step2 = document.getElementById('payStep2');
  if (step1) step1.style.display = 'none';
  if (step2) step2.style.display = '';

  Toast.success('Payment successful!', 'Your violation has been marked as paid.');
  applyFilters();

  btn.textContent = origText;
  btn.disabled    = false;
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

/* ---- Add Violation Modal ---- */
function autoFine() {
  const sel  = document.getElementById('avType');
  const opt  = sel?.options[sel.selectedIndex];
  const fine = opt?.dataset?.fine;
  if (fine) {
    const fineInput = document.getElementById('avFine');
    if (fineInput) fineInput.value = fine;
  }
}

function openAddModal() {
  document.getElementById('addModal')?.classList.add('open');
}

async function submitViolation(e) {
  e.preventDefault();
  const btn = document.getElementById('avSubmitBtn');
  if (!btn) return;

  const origText  = btn.textContent;
  btn.textContent = 'Adding…';
  btn.disabled    = true;

  const fineVal = parseFloat(document.getElementById('avFine')?.value);
  if (isNaN(fineVal) || fineVal < 0) {
    Toast.error('Invalid amount', 'Please enter a valid fine amount.');
    btn.textContent = origText;
    btn.disabled    = false;
    return;
  }

  const payload = {
    vehicle_number: (document.getElementById('avVehicle')?.value || '').trim().toUpperCase(),
    violation_type: document.getElementById('avType')?.value || '',
    description   : (document.getElementById('avDesc')?.value  || '').trim(),
    fine_amount   : fineVal,
    location      : (document.getElementById('avLocation')?.value || '').trim(),
  };

  if (!payload.vehicle_number || !payload.violation_type) {
    Toast.error('Missing fields', 'Please fill in all required fields.');
    btn.textContent = origText;
    btn.disabled    = false;
    return;
  }

  const { ok, status, data } = await apiFetch('/traffic/violations', {
    method: 'POST',
    body  : JSON.stringify(payload),
  });

  if (status === 0) {
    Toast.error('No connection', 'Cannot reach server. Try again later.');
  } else if (ok) {
    Toast.success('Violation added', `#${data.id} created successfully.`);
    closeModal('addModal');
    e.target.reset();
    await loadViolations();
  } else {
    Toast.error('Failed to add', data.message || 'Could not create violation.');
  }

  btn.textContent = origText;
  btn.disabled    = false;
}

/* ---- Delete Violation ---- */
async function deleteViolation(id) {
  if (!confirm(`Delete violation #${id}? This cannot be undone.`)) return;

  const { ok, data } = await apiFetch(`/traffic/violations/${id}`, { method: 'DELETE' });
  if (ok) {
    Toast.success('Deleted', `Violation #${id} has been removed.`);
    allViolations = allViolations.filter(v => v.id !== id);
    applyFilters();
  } else {
    Toast.error('Delete failed', data.message || 'Could not delete violation.');
  }
}

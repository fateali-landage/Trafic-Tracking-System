/* ========================================
   cameras.js — Camera management logic
   ======================================== */

let allCameras = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.require()) return;

  const user = Auth.getUser();
  if (user?.role === 'admin') {
    const btn = document.getElementById('addCameraBtn');
    if (btn) btn.style.display = 'inline-flex';
  }

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  await loadCameras();
});

async function loadCameras() {
  const grid = document.getElementById('cameraGrid');
  if (grid) {
    grid.innerHTML = [1,2,3,4,5,6].map(() => `
      <div class="camera-card">
        <div class="skeleton" style="height:20px;width:60%;margin-bottom:12px;"></div>
        <div class="skeleton" style="height:14px;width:80%;margin-bottom:8px;"></div>
        <div class="skeleton" style="height:14px;width:40%;"></div>
      </div>`).join('');
  }

  const { ok, status, data } = await apiFetch('/cameras');

  if (status === 0) { showOfflineBanner(); renderError(); return; }
  if (!ok) {
    if (status === 401) return Auth.logout();
    Toast.error('Load failed', data.message);
    renderError();
    return;
  }

  hideOfflineBanner();
  allCameras = Array.isArray(data.cameras) ? data.cameras : [];
  renderCameras();
}

function renderCameras() {
  const grid = document.getElementById('cameraGrid');
  if (!grid) return;

  const total       = allCameras.length;
  const online      = allCameras.filter(c => c.status === 'active').length;
  const offline     = allCameras.filter(c => c.status === 'offline').length;
  const aiEnabled   = allCameras.filter(c => c.ai_enabled).length;

  setEl('cTotal',  total);
  setEl('cOnline', online);
  setEl('cOffline',offline);
  setEl('cAI',     aiEnabled);

  const user      = Auth.getUser();
  const canEdit   = user?.role === 'admin';

  if (allCameras.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;"><div class="empty-state"><div class="empty-icon">📹</div><h3>No cameras yet</h3><p>Add your first traffic camera to get started.</p></div></div>`;
    return;
  }

  const statusConfig = {
    active     : { label: 'Online',      cls: 'cam-status-online',      dot: '#22c55e' },
    offline    : { label: 'Offline',     cls: 'cam-status-offline',     dot: '#ef4444' },
    maintenance: { label: 'Maintenance', cls: 'cam-status-maintenance', dot: '#f59e0b' },
  };

  grid.innerHTML = allCameras.map(c => {
    const sc  = statusConfig[c.status] || statusConfig.offline;
    const loc = escapeHtml(c.location);
    const nm  = escapeHtml(c.name);

    return `
      <div class="camera-card">
        <div class="camera-card-header">
          <div class="camera-icon">📹</div>
          <div class="cam-status-badge ${sc.cls}">
            <span class="cam-dot" style="background:${sc.dot};"></span>${sc.label}
          </div>
        </div>
        <div class="camera-name">${nm}</div>
        <div class="camera-loc">📍 ${loc}</div>
        <div class="camera-stats">
          <div class="camera-stat">
            <div class="camera-stat-val">${c.violations_detected.toLocaleString()}</div>
            <div class="camera-stat-label">Detected</div>
          </div>
          <div class="camera-stat">
            <div class="camera-stat-val" style="color:${c.ai_enabled ? 'var(--success)' : 'var(--text-muted)'};">${c.ai_enabled ? '🤖 On' : '—'}</div>
            <div class="camera-stat-label">AI Mode</div>
          </div>
        </div>
        ${canEdit ? `
        <div class="camera-actions">
          <button class="btn btn-outline btn-sm js-edit-cam" data-id="${c.id}" style="flex:1;justify-content:center;">✏️ Edit</button>
          <button class="btn btn-sm js-del-cam" data-id="${c.id}" style="flex:1;justify-content:center;border:1px solid var(--danger);color:var(--danger);background:transparent;">🗑</button>
        </div>` : ''}
      </div>`;
  }).join('');

  if (canEdit) {
    document.querySelectorAll('.js-edit-cam').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id, 10)));
    });
    document.querySelectorAll('.js-del-cam').forEach(btn => {
      btn.addEventListener('click', () => deleteCamera(parseInt(btn.dataset.id, 10)));
    });
  }
}

function renderError() {
  const grid = document.getElementById('cameraGrid');
  if (grid) grid.innerHTML = `<div style="grid-column:1/-1;"><div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load cameras</h3><p><a href="#" onclick="event.preventDefault();loadCameras();" style="color:var(--accent);">Try again</a></p></div></div>`;
}

/* ---- Modal ---- */
function openAddModal() {
  document.getElementById('cameraModalTitle').textContent = '📹 Add Camera';
  document.getElementById('cameraSubmitBtn').textContent  = 'Add Camera';
  document.getElementById('editCameraId').value = '';
  document.getElementById('cameraForm').reset();
  document.getElementById('cameraModal')?.classList.add('open');
}

function openEditModal(id) {
  const c = allCameras.find(x => x.id === id);
  if (!c) return;

  document.getElementById('cameraModalTitle').textContent = '✏️ Edit Camera';
  document.getElementById('cameraSubmitBtn').textContent  = 'Save Changes';
  document.getElementById('editCameraId').value           = id;

  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('cName',      c.name);
  set('cLocation',  c.location);
  set('cLat',       c.latitude  ?? '');
  set('cLon',       c.longitude ?? '');
  set('cStatus',    c.status);
  set('cAIEnabled', c.ai_enabled ? 'true' : 'false');

  document.getElementById('cameraModal')?.classList.add('open');
}

async function submitCamera(e) {
  e.preventDefault();
  const btn = document.getElementById('cameraSubmitBtn');
  const cid = document.getElementById('editCameraId').value;
  const isEdit = !!cid;

  const origText  = btn.textContent;
  btn.textContent = 'Saving…';
  btn.disabled    = true;

  const payload = {
    name      : document.getElementById('cName')?.value?.trim(),
    location  : document.getElementById('cLocation')?.value?.trim(),
    latitude  : parseFloat(document.getElementById('cLat')?.value) || null,
    longitude : parseFloat(document.getElementById('cLon')?.value) || null,
    status    : document.getElementById('cStatus')?.value,
    ai_enabled: document.getElementById('cAIEnabled')?.value === 'true',
  };

  const path   = isEdit ? `/cameras/${cid}` : '/cameras';
  const method = isEdit ? 'PUT' : 'POST';

  const { ok, status, data } = await apiFetch(path, { method, body: JSON.stringify(payload) });

  if (status === 0) {
    Toast.error('No connection', 'Cannot reach server.');
  } else if (ok) {
    Toast.success(isEdit ? 'Camera updated' : 'Camera added', data.message || 'Done.');
    closeModal('cameraModal');
    await loadCameras();
  } else {
    Toast.error('Failed', data.message || 'Operation failed.');
  }

  btn.textContent = origText;
  btn.disabled    = false;
}

async function deleteCamera(id) {
  const c = allCameras.find(x => x.id === id);
  if (!confirm(`Delete camera "${c?.name}"? This cannot be undone.`)) return;

  const { ok, data } = await apiFetch(`/cameras/${id}`, { method: 'DELETE' });
  if (ok) {
    Toast.success('Deleted', `Camera "${c?.name}" removed.`);
    await loadCameras();
  } else {
    Toast.error('Delete failed', data.message || 'Could not delete camera.');
  }
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

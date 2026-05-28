/* ========================================
   dashboard.js — Dashboard page logic
   ======================================== */

let doughnutChart = null;
let barChart      = null;
let themeObserver = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.require()) return;

  const user = Auth.getUser();
  if (user) {
    const hour  = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const el = document.getElementById('dashboardGreeting');
    if (el) el.textContent = `${greet}, ${user.name || 'there'}. Here's your violations summary.`;
  }

  const recentTable = document.getElementById('recentTable');
  if (recentTable) recentTable.innerHTML = skeletonRows(6, 3);

  await loadDashboardData();
});

async function loadDashboardData() {
  const user = Auth.getUser();
  const isStaff = user?.role === 'admin' || user?.role === 'officer';

  /* Always load violations */
  const [violRes, statsRes] = await Promise.all([
    apiFetch('/traffic/violations'),
    isStaff ? apiFetch('/reports/stats') : Promise.resolve({ ok: false, data: {} }),
  ]);

  if (violRes.status === 0) {
    showOfflineBanner();
    showTableError('recentTable', 6, 'Cannot reach server', loadDashboardData);
    return;
  }

  if (!violRes.ok) {
    if (violRes.status === 401) return Auth.logout();
    Toast.error('Load failed', violRes.data.message || 'Could not fetch violation data.');
    showTableError('recentTable', 6, 'Failed to load data', loadDashboardData);
    return;
  }

  hideOfflineBanner();
  const violations = Array.isArray(violRes.data.violations) ? violRes.data.violations : [];

  /* ---- Stats ---- */
  const total    = violations.length;
  const pending  = violations.filter(v => v.status === 'pending').length;
  const paid     = violations.filter(v => v.status === 'paid').length;
  const revenue  = violations
    .filter(v => v.status === 'paid')
    .reduce((s, v) => s + parseFloat(v.fine_amount || 0), 0);

  setTextSafe('statTotal',   total);
  setTextSafe('statPending', pending);
  setTextSafe('statPaid',    paid);
  setTextSafe('statRevenue', formatCurrency(revenue));

  /* Staff-only stats from reports endpoint */
  if (isStaff && statsRes.ok) {
    const s = statsRes.data;
    setTextSafe('statVehicles', s.vehicles ?? '—');
    setTextSafe('statCameras',  `${s.cameras?.active ?? '—'}/${s.cameras?.total ?? '—'}`);
  }

  /* Pending badge */
  const badge = document.getElementById('pendingBadge');
  if (badge) {
    badge.textContent   = pending;
    badge.style.display = pending > 0 ? 'inline-block' : 'none';
  }

  /* Wait for Chart.js to load */
  await waitForChartJs();

  /* ---- Doughnut Chart ---- */
  const canvas = document.getElementById('chartDoughnut');
  if (canvas) {
    const ctx       = canvas.getContext('2d');
    const contested = violations.filter(v => v.status === 'contested').length;

    if (doughnutChart) { doughnutChart.destroy(); doughnutChart = null; }
    if (themeObserver) { themeObserver.disconnect(); themeObserver = null; }

    const legendColor = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#64748b';

    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels  : ['Pending', 'Paid', 'Contested'],
        datasets: [{
          data           : [pending, paid, contested],
          backgroundColor: ['#f59e0b', '#22c55e', '#ef4444'],
          borderWidth    : 0,
          hoverOffset    : 6,
        }],
      },
      options: {
        cutout : '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels  : { boxWidth: 10, padding: 16, font: { size: 12, family: 'Inter' }, color: legendColor() },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} (${total ? Math.round(ctx.raw / total * 100) : 0}%)`,
            },
          },
        },
      },
    });

    themeObserver = new MutationObserver(() => {
      if (doughnutChart) {
        doughnutChart.options.plugins.legend.labels.color = legendColor();
        doughnutChart.update('none');
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---- Monthly Bar Chart (staff only) ---- */
  if (isStaff) {
    const monthRes = await apiFetch('/reports/violations-by-month');
    const barCanvas = document.getElementById('chartBar');
    if (barCanvas && monthRes.ok) {
      const monthData = monthRes.data.data || [];
      const labels  = monthData.map(d => d.label);
      const counts  = monthData.map(d => d.count);

      if (barChart) { barChart.destroy(); barChart = null; }

      barChart = new Chart(barCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label          : 'Violations',
            data           : counts,
            backgroundColor: 'rgba(79,110,247,0.75)',
            borderRadius   : 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, color: '#64748b' },
              grid : { color: 'rgba(100,116,139,.1)' },
            },
            x: { ticks: { color: '#64748b' }, grid: { display: false } },
          },
        },
      });
    }
  }

  /* ---- Activity Feed ---- */
  const activityList = document.getElementById('activityList');
  if (activityList) {
    const recent = [...violations]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    if (recent.length === 0) {
      activityList.innerHTML = `<li style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px;">No recent activity.</li>`;
    } else {
      const dotColor = { pending: 'amber', paid: 'green', contested: 'red' };
      activityList.innerHTML = recent.map(v => `
        <li class="activity-item">
          <div class="activity-dot ${dotColor[v.status] || 'blue'}"></div>
          <div>
            <div class="activity-text">
              <strong>${escapeHtml(v.vehicle_number)}</strong> — ${escapeHtml(v.violation_type)}
              ${statusBadge(v.status)}
            </div>
            <div class="activity-time">${timeAgo(v.created_at)}</div>
          </div>
        </li>
      `).join('');
    }
  }

  /* ---- Recent Violations Table ---- */
  const tbody = document.getElementById('recentTable');
  if (tbody) {
    const recent5 = [...violations]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    if (recent5.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6">
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No violations yet</h3>
            <p>Violations will appear here once recorded.</p>
          </div>
        </td></tr>`;
    } else {
      tbody.innerHTML = recent5.map(v => `
        <tr>
          <td class="td-muted" style="font-size:12px;">#${v.id}</td>
          <td><span class="vehicle-num">${escapeHtml(v.vehicle_number)}</span></td>
          <td>${escapeHtml(v.violation_type)}</td>
          <td style="font-weight:700;">${formatCurrency(v.fine_amount)}</td>
          <td>${statusBadge(v.status)}</td>
          <td class="td-muted">${formatDate(v.created_at)}</td>
        </tr>
      `).join('');
    }
  }
}

/* ---- Helpers ---- */
function setTextSafe(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showTableError(tbodyId, cols, msg, retryFn) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="${cols}" style="text-align:center;padding:40px;color:var(--text-muted);">
      ⚠️ ${escapeHtml(msg)}.
      <a href="#" onclick="event.preventDefault();${retryFn.name}();" style="color:var(--accent);margin-left:6px;">Retry</a>
    </td></tr>`;
}

function waitForChartJs(timeout = 5000) {
  return new Promise((resolve) => {
    if (typeof Chart !== 'undefined') { resolve(); return; }
    const start = Date.now();
    const check = () => {
      if (typeof Chart !== 'undefined') { resolve(); return; }
      if (Date.now() - start > timeout) { resolve(); return; }
      setTimeout(check, 100);
    };
    check();
  });
}

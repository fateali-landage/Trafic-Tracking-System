/* ========================================
   reports.js — Reports & analytics logic
   ======================================== */

let monthlyChart = null;
let typeChart    = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.require()) return;

  const user = Auth.getUser();
  if (user && user.role === 'citizen') {
    document.querySelector('.page-body').innerHTML = `
      <div class="empty-state" style="padding:80px 20px;">
        <div class="empty-icon">🔒</div>
        <h3>Access Restricted</h3>
        <p>Reports are only available to officers and administrators.</p>
        <a href="dashboard.html" class="btn btn-primary" style="margin-top:16px;display:inline-flex;">Go to Dashboard</a>
      </div>`;
    return;
  }

  await loadReports();
});

async function loadReports() {
  const [statsRes, monthRes, typeRes, topRes] = await Promise.all([
    apiFetch('/reports/stats'),
    apiFetch('/reports/violations-by-month'),
    apiFetch('/reports/violations-by-type'),
    apiFetch('/reports/top-vehicles'),
  ]);

  if (statsRes.status === 0) {
    showOfflineBanner();
    Toast.error('Cannot connect', 'Failed to load reports.');
    return;
  }

  hideOfflineBanner();

  /* ---- Summary Stats ---- */
  if (statsRes.ok) {
    const s = statsRes.data;
    const total    = s.violations?.total || 0;
    const revenue  = s.revenue?.collected || 0;
    const pending  = s.revenue?.pending   || 0;
    const allRev   = s.revenue?.total || 0;
    const rate     = allRev > 0 ? Math.round((revenue / allRev) * 100) : 0;

    setEl('rTotal',   total);
    setEl('rRevenue', formatCurrency(revenue));
    setEl('rPending', formatCurrency(pending));
    setEl('rRate',    `${rate}%`);
  }

  /* Wait for Chart.js */
  await waitForChartJs();

  /* ---- Monthly Bar Chart ---- */
  if (monthRes.ok) {
    const rows   = monthRes.data.data || [];
    const labels = rows.map(r => r.label);
    const counts = rows.map(r => r.count);
    const revs   = rows.map(r => r.revenue);

    const ctx = document.getElementById('chartMonthly')?.getContext('2d');
    if (ctx) {
      if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }

      monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label          : 'Violations',
              data           : counts,
              backgroundColor: 'rgba(79,110,247,0.8)',
              borderRadius   : 6,
              yAxisID        : 'y',
            },
            {
              label          : 'Revenue ($)',
              data           : revs,
              type           : 'line',
              borderColor    : '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.1)',
              borderWidth    : 2,
              pointRadius    : 4,
              fill           : true,
              yAxisID        : 'y2',
              tension        : 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 12 }, color: '#64748b' } },
          },
          scales: {
            y  : { beginAtZero: true, ticks: { color: '#64748b', stepSize: 1 }, grid: { color: 'rgba(100,116,139,.1)' }, title: { display: true, text: 'Violations', color: '#94a3b8' } },
            y2 : { beginAtZero: true, position: 'right', ticks: { color: '#64748b', callback: v => '$' + v }, grid: { display: false }, title: { display: true, text: 'Revenue', color: '#94a3b8' } },
            x  : { ticks: { color: '#64748b' }, grid: { display: false } },
          },
        },
      });
    }
  }

  /* ---- Types Pie Chart ---- */
  if (typeRes.ok) {
    const rows   = typeRes.data.data || [];
    const labels = rows.map(r => r.type);
    const counts = rows.map(r => r.count);
    const colors = ['#4f6ef7','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6'];

    const ctx2 = document.getElementById('chartTypes')?.getContext('2d');
    if (ctx2) {
      if (typeChart) { typeChart.destroy(); typeChart = null; }

      typeChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data           : counts,
            backgroundColor: colors.slice(0, labels.length),
            borderWidth    : 0,
            hoverOffset    : 6,
          }],
        },
        options: {
          cutout : '60%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 11 }, color: '#64748b' } },
          },
        },
      });
    }
  }

  /* ---- Top Vehicles Table ---- */
  if (topRes.ok) {
    const rows = topRes.data.data || [];
    const tbody = document.getElementById('topVehiclesTable');
    if (tbody) {
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:40px;"><div class="empty-icon">🚗</div><h3>No data yet</h3><p>Violation data will appear here.</p></div></td></tr>`;
      } else {
        const maxFine = Math.max(...rows.map(r => r.total_fines), 1);
        tbody.innerHTML = rows.map((r, i) => {
          const pct = Math.round((r.total_fines / maxFine) * 100);
          return `
            <tr>
              <td class="td-muted" style="font-size:13px;font-weight:700;">${i + 1}</td>
              <td><span class="vehicle-num">${escapeHtml(r.vehicle_number)}</span></td>
              <td style="font-weight:700;">${r.count}</td>
              <td style="font-weight:700;color:var(--accent);">${formatCurrency(r.total_fines)}</td>
              <td style="width:160px;">
                <div style="background:var(--surface-2);border-radius:4px;height:8px;overflow:hidden;">
                  <div style="background:var(--accent);width:${pct}%;height:100%;border-radius:4px;transition:width .5s ease;"></div>
                </div>
              </td>
            </tr>`;
        }).join('');
      }
    }
  }
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function waitForChartJs(timeout = 5000) {
  return new Promise(resolve => {
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

const statRow = document.getElementById("stat-row");
const tabsBox = document.getElementById("tabs");
const contentBox = document.getElementById("tab-content");
const pageTitle = document.getElementById("page-title");

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut().then(() => window.location.href = "login.html"));

let activeTab = "overview";
let landlordsCache = [];
let unitsCache = [];
let tenantsCache = [];
let viewingTenantId = null;
let overviewCharts = {};

// Bug fix: onSnapshot listeners (Payments, Deposits tabs) were never
// unsubscribed when switching tabs, so navigating back and forth stacked
// up duplicate listeners. Every listener-based tab pushes its unsubscribe
// function here, and renderActiveTab() clears them all before rendering
// whichever tab is now active.
let activeListeners = [];
function clearActiveListeners() {
  activeListeners.forEach((unsub) => {
    try { unsub(); } catch (e) { /* already detached */ }
  });
  activeListeners = [];
}

// Single source of truth for chart colors — canvas rendering can't read
// CSS custom properties directly, so these mirror the values in style.css.
const COLORS = {
  pink: "#e6007e",
  pinkSoft: "rgba(230,0,126,.12)",
  green: "#1e9e5a",
  greenTint: "#e8f7ee",
  amber: "#a9760a",
  amberTint: "#fdf3e0",
  red: "#b42323",
  redTint: "rgba(180,35,35,.10)",
  ink: "#10233f",
  inkSoft: "#4b5c72",
  inkFaint: "#8c99ac",
  border: "#e4e9f0",
  surface: "#ffffff"
};

const money = (n) => `KSh ${Number(n || 0).toLocaleString()}`;

// Applied once so every chart on the page shares consistent typography
// and grid styling instead of Chart.js defaults.
(function configureChartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  Chart.defaults.font.size = 12.5;
  Chart.defaults.color = COLORS.inkSoft;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = "circle";
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = COLORS.ink;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { weight: "700", size: 12.5 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 12.5 };
})();

// Minimal line-icon set (Feather-style, 1.75 stroke) so each section reads at a glance in the sidebar
const ICONS = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  payments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>',
  tenants: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  landlords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-6h6v6"/></svg>',
  units: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg>',
  deposits: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11Z"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v5h5"/><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>'
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payments", label: "Payments" },
  { key: "tenants", label: "Tenants" },
  { key: "landlords", label: "Landlords" },
  { key: "units", label: "Units" },
  { key: "deposits", label: "Deposits" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" }
];

function renderTabs() {
  tabsBox.innerHTML = TABS.map((t) => `
    <button class="tab-btn ${activeTab === t.key ? "active" : ""}" data-tab="${t.key}">${ICONS[t.key] || ""}<span>${t.label}</span></button>
  `).join("");
  if (pageTitle) {
    const current = TABS.find((t) => t.key === activeTab);
    pageTitle.textContent = current ? current.label : "";
  }
  tabsBox.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      viewingTenantId = null;
      renderTabs();
      renderActiveTab();
    });
  });
}

async function refreshCaches() {
  const [landlordSnap, unitSnap, tenantSnap] = await Promise.all([
    db.collection("landlords").orderBy("name").get(),
    db.collection("units").get(),
    db.collection("tenants").orderBy("name").get()
  ]);
  landlordsCache = landlordSnap.docs;
  unitsCache = unitSnap.docs;
  tenantsCache = tenantSnap.docs;
}

function landlordName(id) {
  const doc = landlordsCache.find((d) => d.id === id);
  return doc ? doc.data().name : "Unknown";
}
function unitLabel(id) {
  const doc = unitsCache.find((d) => d.id === id);
  return doc ? doc.data().houseNumber : "Unknown unit";
}
function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}
async function getPaidUnitIdsThisMonth() {
  const { start, end } = currentMonthRange();
  const snap = await db.collection("payments")
    .where("status", "==", "verified")
    .where("submittedAt", ">=", start)
    .where("submittedAt", "<", end)
    .get();
  return new Set(snap.docs.map((d) => d.data().unitId));
}
function isOverdue(tenant, paidUnitIds) {
  if (!tenant.unitId || paidUnitIds.has(tenant.unitId)) return false;
  if (tenant.leaseStartDate) {
    const leaseStart = new Date(tenant.leaseStartDate);
    if (!isNaN(leaseStart) && leaseStart > new Date()) return false;
  }
  const dueDay = Number(tenant.rentDueDay) || 5;
  const now = new Date();
  const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
  return now > dueDate;
}

async function renderActiveTab() {
  clearActiveListeners();
  contentBox.innerHTML = `<p class="empty-state">Loading&hellip;</p>`;
  await refreshCaches();
  if (activeTab === "overview") renderOverviewTab();
  else if (activeTab === "payments") renderPaymentsTab();
  else if (activeTab === "tenants") renderTenantsTab();
  else if (activeTab === "landlords") renderLandlordsTab();
  else if (activeTab === "units") renderUnitsTab();
  else if (activeTab === "deposits") renderDepositsTab();
  else if (activeTab === "reports") renderReportsTab();
  else if (activeTab === "settings") renderSettingsTab();
}

// ---------------------------------------------------------------------
// COLLAPSIBLE "ADD / RECORD" PANEL HELPER
// ---------------------------------------------------------------------
// Wraps a form (or any block) in a collapsed-by-default panel with a
// toggle header, and returns the HTML string. Used so "Add Landlord",
// "Add Unit" and "Record Deposit" sit above their tables instead of
// buried below a long list, and can be tucked away when not needed.
// Call wireCollapsePanel(id) after inserting the HTML to hook up the
// toggle button; pass startOpen: true to render it expanded (e.g. when
// editing an existing record).
function collapsePanelHTML({ id, title, collapsedLabel, expandedLabel, bodyHTML, startOpen = false }) {
  return `
    <div class="card collapse-panel${startOpen ? " open" : ""}" id="${id}">
      <button type="button" class="collapse-panel-toggle" data-collapse-toggle="${id}" style="display:flex; align-items:center; justify-content:space-between; width:100%; background:none; border:none; cursor:pointer; padding:0; text-align:left;">
        <span class="card-title" id="${id}-title" style="margin:0;">${startOpen ? expandedLabel : collapsedLabel}</span>
        <svg class="collapse-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="flex-shrink:0; transition:transform .15s ease; transform:rotate(${startOpen ? "180" : "0"}deg);"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="collapse-panel-body" id="${id}-body" style="margin-top:${startOpen ? "14px" : "0"}; max-height:${startOpen ? "none" : "0"}; overflow:${startOpen ? "visible" : "hidden"};">
        ${bodyHTML}
      </div>
    </div>`;
}

function wireCollapsePanel(id, { expandedLabel, collapsedLabel } = {}) {
  const panel = document.getElementById(id);
  const body = document.getElementById(`${id}-body`);
  const titleEl = document.getElementById(`${id}-title`);
  if (!panel || !body) return;
  const toggleBtn = panel.querySelector(`[data-collapse-toggle="${id}"]`);
  const chevron = panel.querySelector(".collapse-chevron");

  function setOpen(open) {
    panel.classList.toggle("open", open);
    body.style.maxHeight = open ? "none" : "0";
    body.style.overflow = open ? "visible" : "hidden";
    body.style.marginTop = open ? "14px" : "0";
    if (chevron) chevron.style.transform = `rotate(${open ? 180 : 0}deg)`;
    if (titleEl && expandedLabel && collapsedLabel) {
      titleEl.textContent = open ? expandedLabel : collapsedLabel;
    }
  }

  toggleBtn.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  panel._setOpen = setOpen; // exposed so callers (e.g. "Edit") can force it open
}

// ---------------------------------------------------------------------
// OVERVIEW TAB (charts + PDF export)
// ---------------------------------------------------------------------
async function renderOverviewTab() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  const sixMonthsAgoStart = months[0];

  // Arrears-by-month queries used to run one at a time in a for-loop
  // (six sequential round trips). They're independent of each other, so
  // running them together with the trend/this-month queries cuts load
  // time roughly in half.
  const [trendSnap, thisMonthSnap, arrearsSnaps] = await Promise.all([
    db.collection("payments").where("status", "==", "verified").where("submittedAt", ">=", sixMonthsAgoStart).get(),
    (() => {
      const { start, end } = currentMonthRange();
      return db.collection("payments").where("submittedAt", ">=", start).where("submittedAt", "<", end).get();
    })(),
    Promise.all(months.map((m) => {
      const start = m;
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      return db.collection("payments")
        .where("status", "==", "verified")
        .where("submittedAt", ">=", start)
        .where("submittedAt", "<", end)
        .get();
    }))
  ]);

  if (activeTab !== "overview") return;

  // Monthly collected totals (verified payments only)
  const monthlyTotals = months.map(() => 0);
  trendSnap.docs.forEach((doc) => {
    const p = doc.data();
    if (!p.submittedAt) return;
    const date = p.submittedAt.toDate();
    const idx = months.findIndex((m) => m.getFullYear() === date.getFullYear() && m.getMonth() === date.getMonth());
    if (idx !== -1) monthlyTotals[idx] += Number(p.amount || 0);
  });

  // This month's status breakdown (all statuses)
  const statusCounts = { verified: 0, pending: 0, rejected: 0 };
  thisMonthSnap.docs.forEach((doc) => {
    const s = doc.data().status;
    if (statusCounts[s] !== undefined) statusCounts[s]++;
  });

  // Arrears trend — occupied units with no verified payment that month.
  // Uses today's unit list for all 6 months since we don't track historical
  // occupancy changes; treat this as an approximation, not an exact record.
  const occupiedUnits = unitsCache.filter((u) => u.data().occupancy !== "vacant");
  const arrearsByMonth = arrearsSnaps.map((snap) => {
    const paidUnitIds = new Set(snap.docs.map((d) => d.data().unitId));
    return occupiedUnits.filter((u) => !paidUnitIds.has(u.id)).length;
  });

  const occupiedCount = occupiedUnits.length;
  const vacantCount = unitsCache.length - occupiedCount;
  const monthLabels = months.map((m) => m.toLocaleString("en-KE", { month: "short" }));

  contentBox.innerHTML = `
    <div class="overview-actions"><button class="btn btn-primary" id="btn-download-pdf">Download PDF Report</button></div>
    <div class="chart-card">
      <div class="card-title">Rent Collected — Last 6 Months</div>
      <div class="chart-canvas-wrap"><canvas id="chart-trend"></canvas></div>
    </div>
    <div class="chart-grid-2">
      <div class="chart-card">
        <div class="card-title">Payment Status — This Month</div>
        <div class="chart-canvas-wrap chart-canvas-wrap-sm"><canvas id="chart-status"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="card-title">Occupancy</div>
        <div class="chart-canvas-wrap chart-canvas-wrap-sm"><canvas id="chart-occupancy"></canvas></div>
      </div>
    </div>
    <div class="chart-card">
      <div class="card-title">Arrears Trend — Last 6 Months</div>
      <div class="chart-canvas-wrap"><canvas id="chart-arrears"></canvas></div>
    </div>`;

  Object.values(overviewCharts).forEach((c) => c.destroy());
  overviewCharts = {};

  overviewCharts.trend = new Chart(document.getElementById("chart-trend"), {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [{
        label: "Rent Collected",
        data: monthlyTotals,
        backgroundColor: COLORS.pink,
        hoverBackgroundColor: "#c40068",
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 46
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => money(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.border },
          border: { display: false },
          ticks: { callback: (v) => v >= 1000 ? `${v / 1000}k` : v }
        }
      }
    }
  });

  overviewCharts.status = new Chart(document.getElementById("chart-status"), {
    type: "doughnut",
    data: {
      labels: ["Verified", "Pending", "Rejected"],
      datasets: [{
        data: [statusCounts.verified, statusCounts.pending, statusCounts.rejected],
        backgroundColor: [COLORS.green, COLORS.amber, COLORS.red],
        borderColor: COLORS.surface,
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } }
      }
    }
  });

  overviewCharts.arrears = new Chart(document.getElementById("chart-arrears"), {
    type: "line",
    data: {
      labels: monthLabels,
      datasets: [{
        label: "Units in Arrears",
        data: arrearsByMonth,
        borderColor: COLORS.red,
        backgroundColor: COLORS.redTint,
        pointBackgroundColor: COLORS.red,
        pointBorderColor: COLORS.surface,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} unit${ctx.parsed.y === 1 ? "" : "s"}` } }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: COLORS.border }, border: { display: false } }
      }
    }
  });

  overviewCharts.occupancy = new Chart(document.getElementById("chart-occupancy"), {
    type: "doughnut",
    data: {
      labels: ["Occupied", "Vacant"],
      datasets: [{
        data: [occupiedCount, vacantCount],
        backgroundColor: [COLORS.pink, COLORS.border],
        borderColor: COLORS.surface,
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } }
      }
    }
  });

  document.getElementById("btn-download-pdf").addEventListener("click", () => generateOverviewPDF({ occupiedCount, vacantCount, statusCounts }));
}

function generateOverviewPDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(230, 0, 126);
  doc.text("Sanefi Rent — Overview Report", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(75, 92, 114);
  doc.text(`Generated ${new Date().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}`, 14, 27);

  doc.setFontSize(12);
  doc.setTextColor(16, 35, 63);
  doc.text(`Occupied Units: ${data.occupiedCount}    Vacant Units: ${data.vacantCount}`, 14, 39);
  doc.text(`This Month — Verified: ${data.statusCounts.verified}, Pending: ${data.statusCounts.pending}, Rejected: ${data.statusCounts.rejected}`, 14, 46);

  const chartOrder = ["trend", "status", "arrears", "occupancy"];
  const titles = {
    trend: "Rent Collected — Last 6 Months",
    status: "Payment Status — This Month",
    arrears: "Arrears Trend — Last 6 Months",
    occupancy: "Occupancy"
  };

  chartOrder.forEach((key) => {
    const chart = overviewCharts[key];
    if (!chart) return;
    doc.addPage();
    doc.setFontSize(13);
    doc.setTextColor(16, 35, 63);
    doc.text(titles[key], 14, 20);
    doc.addImage(chart.toBase64Image(), "PNG", 14, 28, 180, 100);
  });

  doc.save(`sanefi-overview-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ---------------------------------------------------------------------
// PAYMENTS TAB (table view + Record Payment modal)
// ---------------------------------------------------------------------
function renderPaymentsTab() {
  const unsubscribe = db.collection("payments").orderBy("submittedAt", "desc").limit(100).onSnapshot((snapshot) => {
    if (activeTab !== "payments") return;

    function paymentRowHTML(doc) {
      const p = doc.data();
      const mismatchBadge = p.recipientMatch === false
        ? `<span class="pill pill-mismatch">Mismatch</span>` : "";
      const manualBadge = p.enteredByStaff
        ? `<span class="pill pill-neutral">Staff Entry</span>` : "";
      const actions = p.status === "pending"
        ? `
          <button class="btn-table-action" data-action="verify" data-id="${doc.id}">Verify</button>
          <button class="btn-table-action btn-table-action-danger" data-action="reject" data-id="${doc.id}">Reject</button>`
        : "";
      return `
        <tr>
          <td data-label="Amount"><div class="cell-title">${money(p.amount)}</div></td>
          <td data-label="Unit">${escapeHTML(unitLabel(p.unitId))}</td>
          <td data-label="Landlord">${escapeHTML(landlordName(p.landlordId))}</td>
          <td data-label="Reference">${escapeHTML(p.transactionCode || "Manual entry")}<div class="cell-muted" style="font-size:11.5px; margin-top:2px;">${escapeHTML(p.paidAtRaw || "")}</div></td>
          <td data-label="Status"><span class="pill pill-${p.status}">${p.status}</span> ${mismatchBadge}${manualBadge}</td>
          <td data-label="" class="table-actions">${actions}</td>
        </tr>`;
    }

    const rowsHTML = snapshot.docs.map(paymentRowHTML).join("");
    const unitOptions = unitsCache.map((doc) => `<option value="${doc.id}" data-landlord="${doc.data().landlordId}">${escapeHTML(doc.data().houseNumber)} — ${escapeHTML(landlordName(doc.data().landlordId))}</option>`).join("");

    contentBox.innerHTML = `
      ${collapsePanelHTML({
        id: "record-payment-panel",
        title: "Record Payment",
        collapsedLabel: "+ Record Payment",
        expandedLabel: "Record Payment on Behalf of a Tenant",
        bodyHTML: `
          <div class="card-sub" style="margin-bottom:14px;">Use this when a tenant forwarded their M-Pesa confirmation (e.g. via WhatsApp) instead of submitting it themselves through the app. Paste the exact message text below — it's parsed and counted toward commission the same as any tenant-submitted payment.</div>
          <form id="manual-payment-form">
            <div class="field"><label>Unit</label><select name="unitId" id="manual-unit-select" required>${unitOptions}</select></div>
            <div class="field"><label>M-Pesa Message</label><textarea name="message" placeholder="Paste the full confirmation message here..." required></textarea></div>
            <button type="submit" class="btn btn-primary">Record Payment</button>
            <p class="alert alert-error" id="manual-payment-error" style="display:none;"></p>
          </form>`
      })}
      <div class="table-toolbar">
        <div class="table-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" id="payment-search" placeholder="Search by unit, landlord or reference&hellip;">
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Amount</th><th>Unit</th><th>Landlord</th><th>Reference</th><th>Status</th><th></th></tr>
          </thead>
          <tbody id="payments-tbody">${rowsHTML}</tbody>
        </table>
        <p class="empty-state" id="payments-empty" style="display:${snapshot.empty ? "block" : "none"};">No payments submitted yet.</p>
      </div>`;

    wireCollapsePanel("record-payment-panel", { collapsedLabel: "+ Record Payment", expandedLabel: "Record Payment on Behalf of a Tenant" });

    // --- Client-side search over the already-loaded rows ---
    const tbody = document.getElementById("payments-tbody");
    const emptyState = document.getElementById("payments-empty");

    function paintRows(docs) {
      tbody.innerHTML = docs.map(paymentRowHTML).join("");
      emptyState.style.display = docs.length === 0 ? "block" : "none";
      emptyState.textContent = snapshot.empty ? "No payments submitted yet." : "No payments match your search.";
      wireRowActions();
    }

    document.getElementById("payment-search").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) { paintRows(snapshot.docs); return; }
      const filteredDocs = snapshot.docs.filter((doc) => {
        const p = doc.data();
        return (unitLabel(p.unitId) || "").toLowerCase().includes(q)
          || (landlordName(p.landlordId) || "").toLowerCase().includes(q)
          || (p.transactionCode || "").toLowerCase().includes(q);
      });
      paintRows(filteredDocs);
    });

    function wireRowActions() {
      contentBox.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const status = btn.dataset.action === "verify" ? "verified" : "rejected";
          const paymentDoc = snapshot.docs.find((d) => d.id === id);
          btn.disabled = true;
          try {
            await db.collection("payments").doc(id).update({ status });
            if (status === "verified" && paymentDoc && paymentDoc.data().tenantId) {
              const amt = Number(paymentDoc.data().amount || 0).toLocaleString();
              addNotification(paymentDoc.data().tenantId, "payment_verified", `Your payment of KSh ${amt} has been verified.`);
            }
          } catch (err) {
            alert("Couldn't update: " + err.message);
            btn.disabled = false;
          }
        });
      });
    }
    wireRowActions();

    const manualForm = document.getElementById("manual-payment-form");
    const manualError = document.getElementById("manual-payment-error");
    manualForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      manualError.style.display = "none";

      const data = new FormData(manualForm);
      const unitId = data.get("unitId");
      const rawMessage = data.get("message");
      const unitDoc = unitsCache.find((d) => d.id === unitId);
      const landlordId = unitDoc ? unitDoc.data().landlordId : null;

      const parsed = parseMpesaMessage(rawMessage);
      if (!parsed.success) {
        manualError.textContent = parsed.error;
        manualError.style.display = "block";
        return;
      }

      try {
        // Same duplicate check as the tenant portal — a message
        // shouldn't be recorded twice regardless of who enters it.
        const dupe = await db.collection("payments").where("transactionCode", "==", parsed.transactionCode).get();
        if (!dupe.empty) {
          manualError.textContent = "This payment has already been recorded.";
          manualError.style.display = "block";
          return;
        }

        const landlordDoc = landlordsCache.find((d) => d.id === landlordId);
        const recipientMatch = landlordDoc ? checkRecipientMatch(parsed, landlordDoc.data()) : false;

        await db.collection("payments").add({
          tenantId: null,
          unitId,
          landlordId,
          rawMessage: parsed.rawMessage,
          method: parsed.method,
          transactionCode: parsed.transactionCode,
          amount: parsed.amount,
          paidAtRaw: parsed.paidAtRaw,
          recipientName: parsed.recipientName || null,
          recipientMatch,
          enteredByStaff: true,
          status: "verified", // staff already reviewed the message before entering it
          submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        manualForm.reset();
        document.getElementById("record-payment-panel")._setOpen(false);
      } catch (err) {
        manualError.textContent = "Couldn't record payment: " + err.message;
        manualError.style.display = "block";
      }
    });
  });

  activeListeners.push(unsubscribe);
}

// ---------------------------------------------------------------------
// TENANTS TAB (searchable table + profile view)
// ---------------------------------------------------------------------
async function renderTenantsTab() {
  if (viewingTenantId) {
    renderTenantProfile(viewingTenantId);
    return;
  }

  const paidUnitIds = await getPaidUnitIdsThisMonth();
  if (activeTab !== "tenants" || viewingTenantId) return;

  const rowsData = tenantsCache.map((doc) => {
    const t = doc.data();
    return {
      id: doc.id,
      name: t.name || "",
      unit: t.unitId ? unitLabel(t.unitId) : "No unit assigned",
      landlord: t.landlordId ? landlordName(t.landlordId) : "—",
      status: t.status || "active",
      overdue: isOverdue(t, paidUnitIds)
    };
  });

  contentBox.innerHTML = `
    <div class="table-toolbar">
      <div class="table-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="tenant-search" placeholder="Search tenants by name, unit or landlord&hellip;">
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Tenant</th><th>Unit</th><th>Landlord</th><th>Status</th><th>Arrears</th><th></th></tr>
        </thead>
        <tbody id="tenants-tbody"></tbody>
      </table>
      <p class="empty-state" id="tenants-empty" style="display:none;">No tenants match your search.</p>
    </div>`;

  const tbody = document.getElementById("tenants-tbody");
  const emptyState = document.getElementById("tenants-empty");

  function paintRows(filter) {
    const q = (filter || "").trim().toLowerCase();
    const filtered = !q ? rowsData : rowsData.filter((r) =>
      r.name.toLowerCase().includes(q) || r.unit.toLowerCase().includes(q) || r.landlord.toLowerCase().includes(q)
    );

    if (rowsData.length === 0) {
      tbody.innerHTML = "";
      emptyState.style.display = "block";
      emptyState.textContent = "No tenants registered yet.";
      return;
    }
    if (filtered.length === 0) {
      tbody.innerHTML = "";
      emptyState.style.display = "block";
      emptyState.textContent = "No tenants match your search.";
      return;
    }
    emptyState.style.display = "none";

    tbody.innerHTML = filtered.map((r) => `
      <tr>
        <td data-label="Tenant"><div class="cell-title">${escapeHTML(r.name)}</div></td>
        <td data-label="Unit">${escapeHTML(r.unit)}</td>
        <td data-label="Landlord">${escapeHTML(r.landlord)}</td>
        <td data-label="Status"><span class="pill ${r.status === "pending" ? "pill-pending" : "pill-verified"}">${escapeHTML(r.status)}</span></td>
        <td data-label="Arrears">${r.overdue ? `<span class="badge-arrears">Arrears</span>` : `<span class="cell-muted">&mdash;</span>`}</td>
        <td data-label="" class="table-actions"><button class="btn-table-action" data-view-tenant="${r.id}">View Details</button></td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-view-tenant]").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewingTenantId = btn.dataset.viewTenant;
        renderTenantsTab();
      });
    });
  }

  paintRows("");
  document.getElementById("tenant-search").addEventListener("input", (e) => paintRows(e.target.value));
}

function maintenanceStatusPill(status) {
  const map = { open: "pill-pending", in_progress: "pill-pending", resolved: "pill-verified" };
  const label = { open: "Open", in_progress: "In Progress", resolved: "Resolved" };
  return `<span class="pill ${map[status] || "pill-pending"}">${label[status] || status}</span>`;
}

async function renderTenantProfile(tenantId) {
  const cachedDoc = tenantsCache.find((d) => d.id === tenantId);
  const tenantDoc = cachedDoc || await db.collection("tenants").doc(tenantId).get();

  // Bug fix: a doc fetched directly via .get() (i.e. not in the cache)
  // can come back non-existent — reading .data() on it used to throw.
  if (!tenantDoc.exists) {
    contentBox.innerHTML = `<p class="empty-state">This tenant could not be found. They may have been removed.</p>`;
    return;
  }

  const t = tenantDoc.data();
  const unitDoc = t.unitId ? unitsCache.find((d) => d.id === t.unitId) : null;

  const [depositSnap, paymentsSnap, maintenanceSnap] = await Promise.all([
    t.unitId ? db.collection("deposits").where("unitId", "==", t.unitId).orderBy("paidAt", "desc").limit(1).get() : Promise.resolve({ empty: true, docs: [] }),
    db.collection("payments").where("tenantId", "==", tenantId).orderBy("submittedAt", "desc").limit(15).get(),
    db.collection("maintenanceRequests").where("tenantId", "==", tenantId).orderBy("submittedAt", "desc").get()
  ]);

  if (activeTab !== "tenants" || viewingTenantId !== tenantId) return;

  const depositHTML = depositSnap.empty ? `<p class="card-sub">No deposit on record.</p>` : (() => {
    const d = depositSnap.docs[0].data();
    const refunded = d.status === "refunded";
    return `<div class="card-sub">${money(d.amountPaid)} paid on ${d.paidAt || ""}</div>
      <div style="margin-top:6px;"><span class="pill ${refunded ? "pill-verified" : "pill-pending"}">${refunded ? "Refunded" : "Held"}</span></div>`;
  })();

  const paymentsHTML = paymentsSnap.empty ? `<p class="empty-state">No payments yet.</p>` : paymentsSnap.docs.map((doc) => {
    const p = doc.data();
    return `<div class="payment-row"><div><div class="amount">${money(p.amount)}</div><div class="meta">${p.paidAtRaw || ""}</div></div><span class="pill pill-${p.status}">${p.status}</span></div>`;
  }).join("");

  const maintenanceHTML = maintenanceSnap.empty ? `<p class="empty-state">No maintenance requests.</p>` : maintenanceSnap.docs.map((doc) => {
    const m = doc.data();
    const actions = m.status !== "resolved" ? `
      ${m.status === "open" ? `<button class="btn btn-outline" style="width:auto; padding:7px 14px; font-size:12.5px;" data-mtn-action="in_progress" data-mtn-id="${doc.id}">Mark In Progress</button>` : ""}
      <button class="btn btn-primary" style="width:auto; padding:7px 14px; font-size:12.5px;" data-mtn-action="resolved" data-mtn-id="${doc.id}">Mark Resolved</button>` : "";
    return `
      <div class="card">
        <span class="chip">${escapeHTML(m.category || "Other")}</span>
        <div class="card-sub" style="margin-top:8px;">${escapeHTML(m.description || "")}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
          ${maintenanceStatusPill(m.status)}
          <div style="display:flex; gap:6px;">${actions}</div>
        </div>
      </div>`;
  }).join("");

  contentBox.innerHTML = `
    <button class="btn-link" id="back-to-tenants" style="margin-bottom:14px;">&larr; Back to Tenants</button>
    <div class="card">
      <div class="card-title">${escapeHTML(t.name || "")}</div>
      <div class="card-sub">${unitDoc ? escapeHTML(unitDoc.data().houseNumber) : "No unit assigned"} ${t.landlordId ? "&middot; " + escapeHTML(landlordName(t.landlordId)) : ""}</div>
      <form id="lease-form" style="margin-top:14px;">
        <div class="field"><label>Lease Start Date</label><input type="date" name="leaseStartDate" value="${t.leaseStartDate || ""}"></div>
        <div class="field"><label>Rent Due Day (day of month)</label><input type="number" name="rentDueDay" min="1" max="28" value="${t.rentDueDay || 5}"></div>
        <button type="submit" class="btn btn-outline">Save Lease Info</button>
        <p class="alert alert-success" id="lease-save-success" style="display:none;">Saved.</p>
      </form>
    </div>
    <div class="card">
      <div class="card-title">Deposit</div>
      ${depositHTML}
    </div>
    <h3 style="margin-bottom:8px;">Payment History</h3>
    <div class="card">${paymentsHTML}</div>
    <h3 style="margin-bottom:8px;">Maintenance Requests</h3>
    ${maintenanceHTML}`;

  document.getElementById("back-to-tenants").addEventListener("click", () => {
    viewingTenantId = null;
    renderTenantsTab();
  });

  document.getElementById("lease-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await db.collection("tenants").doc(tenantId).update({
        leaseStartDate: data.get("leaseStartDate") || null,
        rentDueDay: Number(data.get("rentDueDay")) || 5
      });
      document.getElementById("lease-save-success").style.display = "block";
    } catch (err) {
      alert("Couldn't save: " + err.message);
    }
  });

  contentBox.querySelectorAll("[data-mtn-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.mtnId;
      const status = btn.dataset.mtnAction;
      let staffNote = "";
      if (status === "resolved") {
        staffNote = prompt("Add a note for the tenant (optional):", "") || "";
      }
      btn.disabled = true;
      try {
        await db.collection("maintenanceRequests").doc(id).update({
          status,
          staffNote: staffNote || null,
          resolvedAt: status === "resolved" ? firebase.firestore.FieldValue.serverTimestamp() : null
        });
        addNotification(tenantId, "maintenance_update", `Your maintenance request is now ${status === "in_progress" ? "in progress" : "resolved"}.`);
        renderTenantProfile(tenantId);
      } catch (err) {
        alert("Couldn't update: " + err.message);
        btn.disabled = false;
      }
    });
  });
}

// ---------------------------------------------------------------------
// LANDLORDS TAB (searchable table + edit/delete + add form)
// ---------------------------------------------------------------------
let editingLandlordId = null;

function landlordMethodDetail(l) {
  return l.paymentMethod === "paybill" ? `Paybill ${l.paybillNumber || ""} (Acc: ${l.accountHint || "any"})`
    : l.paymentMethod === "till" ? `Till ${l.tillNumber || ""} (${l.businessName || ""})`
    : `Phone ${l.phoneNumber || ""} (${l.registeredName || ""})`;
}

function renderLandlordsTab() {
  const rowsData = landlordsCache.map((doc) => {
    const l = doc.data();
    return { id: doc.id, name: l.name || "", detail: landlordMethodDetail(l), contact: l.contact || "—" };
  });

  contentBox.innerHTML = `
    ${collapsePanelHTML({
      id: "landlord-form-panel",
      title: "Add Landlord",
      collapsedLabel: "+ Add Landlord",
      expandedLabel: "Add Landlord",
      bodyHTML: `
        <form id="landlord-form">
          <div class="field"><label>Name</label><input type="text" name="name" required></div>
          <div class="field"><label>Contact</label><input type="text" name="contact"></div>
          <div class="field">
            <label>Payment Method</label>
            <select name="paymentMethod" id="ll-method">
              <option value="paybill">Paybill</option>
              <option value="till">Till Number</option>
              <option value="phone">Send Money (Phone)</option>
            </select>
          </div>
          <div id="ll-paybill-fields">
            <div class="field"><label>Paybill Number</label><input type="text" name="paybillNumber"></div>
            <div class="field"><label>Account Number (optional, for matching)</label><input type="text" name="accountHint"></div>
          </div>
          <div id="ll-till-fields" style="display:none;">
            <div class="field"><label>Till Number</label><input type="text" name="tillNumber"></div>
            <div class="field"><label>Business Name (as shown on M-Pesa)</label><input type="text" name="businessName"></div>
          </div>
          <div id="ll-phone-fields" style="display:none;">
            <div class="field"><label>Phone Number</label><input type="text" name="phoneNumber"></div>
            <div class="field"><label>Registered M-Pesa Name</label><input type="text" name="registeredName"></div>
          </div>
          <div style="display:flex; gap:10px;">
            <button type="submit" class="btn btn-primary" id="landlord-form-submit">Add Landlord</button>
            <button type="button" class="btn btn-outline" id="landlord-form-cancel" style="display:none;">Cancel</button>
          </div>
        </form>`
    })}
    <div class="table-toolbar">
      <div class="table-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="landlord-search" placeholder="Search landlords by name or contact&hellip;">
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Landlord</th><th>Payment Details</th><th>Contact</th><th></th></tr></thead>
        <tbody id="landlords-tbody"></tbody>
      </table>
      <p class="empty-state" id="landlords-empty" style="display:none;">No landlords match your search.</p>
    </div>`;

  wireCollapsePanel("landlord-form-panel", { collapsedLabel: "+ Add Landlord", expandedLabel: "Add Landlord" });

  const tbody = document.getElementById("landlords-tbody");
  const emptyState = document.getElementById("landlords-empty");

  function paintRows(filter) {
    const q = (filter || "").trim().toLowerCase();
    const filtered = !q ? rowsData : rowsData.filter((r) =>
      r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q)
    );

    if (rowsData.length === 0) {
      tbody.innerHTML = "";
      emptyState.style.display = "block";
      emptyState.textContent = "No landlords added yet.";
      return;
    }
    if (filtered.length === 0) {
      tbody.innerHTML = "";
      emptyState.style.display = "block";
      emptyState.textContent = "No landlords match your search.";
      return;
    }
    emptyState.style.display = "none";

    tbody.innerHTML = filtered.map((r) => `
      <tr>
        <td data-label="Landlord"><div class="cell-title">${escapeHTML(r.name)}</div></td>
        <td data-label="Payment Details">${escapeHTML(r.detail)}</td>
        <td data-label="Contact">${escapeHTML(r.contact)}</td>
        <td data-label="" class="table-actions">
          <button class="btn-table-action" data-view-landlord="${r.id}">View Details</button>
          <button class="btn-table-action" data-edit-landlord="${r.id}">Edit</button>
          <button class="btn-table-action btn-table-action-danger" data-delete-landlord="${r.id}">Delete</button>
        </td>
      </tr>`).join("");

    tbody.querySelectorAll("[data-view-landlord]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const doc = landlordsCache.find((d) => d.id === btn.dataset.viewLandlord);
        if (!doc) return;
        const l = doc.data();
        alert(`${l.name}\n\n${landlordMethodDetail(l)}\nContact: ${l.contact || "—"}`);
      });
    });

    tbody.querySelectorAll("[data-edit-landlord]").forEach((btn) => {
      btn.addEventListener("click", () => beginEditLandlord(btn.dataset.editLandlord));
    });

    tbody.querySelectorAll("[data-delete-landlord]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const doc = landlordsCache.find((d) => d.id === btn.dataset.deleteLandlord);
        if (!doc) return;
        if (!confirm(`Delete ${doc.data().name}? This can't be undone.`)) return;
        try {
          await db.collection("landlords").doc(btn.dataset.deleteLandlord).delete();
          renderActiveTab();
        } catch (err) {
          alert("Couldn't delete: " + err.message);
        }
      });
    });
  }

  paintRows("");
  document.getElementById("landlord-search").addEventListener("input", (e) => paintRows(e.target.value));

  const methodSelect = document.getElementById("ll-method");
  const form = document.getElementById("landlord-form");
  const submitBtn = document.getElementById("landlord-form-submit");
  const cancelBtn = document.getElementById("landlord-form-cancel");
  const panel = document.getElementById("landlord-form-panel");
  const panelTitle = document.getElementById("landlord-form-panel-title");

  function toggleMethodFields() {
    document.getElementById("ll-paybill-fields").style.display = methodSelect.value === "paybill" ? "block" : "none";
    document.getElementById("ll-till-fields").style.display = methodSelect.value === "till" ? "block" : "none";
    document.getElementById("ll-phone-fields").style.display = methodSelect.value === "phone" ? "block" : "none";
  }
  methodSelect.addEventListener("change", toggleMethodFields);

  function beginEditLandlord(id) {
    const doc = landlordsCache.find((d) => d.id === id);
    if (!doc) return;
    const l = doc.data();
    editingLandlordId = id;
    form.name.value = l.name || "";
    form.contact.value = l.contact || "";
    form.paymentMethod.value = l.paymentMethod || "paybill";
    form.paybillNumber.value = l.paybillNumber || "";
    form.accountHint.value = l.accountHint || "";
    form.tillNumber.value = l.tillNumber || "";
    form.businessName.value = l.businessName || "";
    form.phoneNumber.value = l.phoneNumber || "";
    form.registeredName.value = l.registeredName || "";
    toggleMethodFields();
    if (panelTitle) panelTitle.textContent = `Edit ${l.name}`;
    submitBtn.textContent = "Save Changes";
    cancelBtn.style.display = "inline-block";
    panel._setOpen(true);
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cancelBtn.addEventListener("click", () => {
    editingLandlordId = null;
    form.reset();
    toggleMethodFields();
    if (panelTitle) panelTitle.textContent = "Add Landlord";
    submitBtn.textContent = "Add Landlord";
    cancelBtn.style.display = "none";
    panel._setOpen(false);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const payload = {
      name: data.get("name"),
      contact: data.get("contact"),
      paymentMethod: data.get("paymentMethod"),
      paybillNumber: data.get("paybillNumber") || null,
      accountHint: data.get("accountHint") || null,
      tillNumber: data.get("tillNumber") || null,
      businessName: data.get("businessName") || null,
      phoneNumber: data.get("phoneNumber") || null,
      registeredName: data.get("registeredName") || null
    };
    try {
      if (editingLandlordId) {
        await db.collection("landlords").doc(editingLandlordId).update(payload);
        editingLandlordId = null;
      } else {
        await db.collection("landlords").add(payload);
      }
      renderActiveTab();
    } catch (err) {
      alert("Couldn't save landlord: " + err.message);
    }
  });
}

// ---------------------------------------------------------------------
// UNITS TAB
// ---------------------------------------------------------------------
function renderUnitsTab() {
  const cards = unitsCache.map((doc) => {
    const u = doc.data();
    const vacant = u.occupancy === "vacant";
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="card-title">${u.houseNumber} ${u.unitType ? "&middot; " + escapeHTML(u.unitType) : ""}</div>
            <div class="card-sub">${u.propertyName || ""} &middot; ${landlordName(u.landlordId)}</div>
            <div class="card-sub">Rent: ${money(u.rentAmount)}</div>
            <div class="card-sub">Water Meter: ${u.waterMeterNumber || "—"} &middot; Power Meter: ${u.powerMeterNumber || "—"}</div>
          </div>
          <span class="pill ${vacant ? "pill-rejected" : "pill-verified"}" data-toggle-occupancy="${doc.id}" style="cursor:pointer;">${vacant ? "Vacant" : "Occupied"}</span>
        </div>
      </div>`;
  }).join("") || `<p class="empty-state">No units added yet.</p>`;

  const landlordOptions = landlordsCache.map((doc) => `<option value="${doc.id}">${doc.data().name}</option>`).join("");

  contentBox.innerHTML = `
    ${collapsePanelHTML({
      id: "unit-form-panel",
      title: "Add Unit",
      collapsedLabel: "+ Add Unit",
      expandedLabel: "Add Unit",
      bodyHTML: `
        <form id="unit-form">
          <div class="field"><label>Landlord / Property</label><select name="landlordId" required>${landlordOptions}</select></div>
          <div class="field"><label>House / Unit Number</label><input type="text" name="houseNumber" placeholder="e.g. 3A" required></div>
          <div class="field"><label>Property Name</label><input type="text" name="propertyName" placeholder="e.g. E&amp;L Apartments"></div>
          <div class="field"><label>Unit Type</label><input type="text" name="unitType" placeholder="e.g. 2BR, Bedsitter, Single"></div>
          <div class="field"><label>Monthly Rent (KSh)</label><input type="number" name="rentAmount" min="0"></div>
          <div class="field"><label>Water Meter Number</label><input type="text" name="waterMeterNumber"></div>
          <div class="field"><label>Power Meter Number</label><input type="text" name="powerMeterNumber"></div>
          <button type="submit" class="btn btn-primary">Add Unit</button>
        </form>`
    })}
    ${cards}`;

  wireCollapsePanel("unit-form-panel", { collapsedLabel: "+ Add Unit", expandedLabel: "Add Unit" });

  contentBox.querySelectorAll("[data-toggle-occupancy]").forEach((pill) => {
    pill.addEventListener("click", async () => {
      const id = pill.dataset.toggleOccupancy;
      const doc = unitsCache.find((d) => d.id === id);
      const currentlyVacant = doc.data().occupancy === "vacant";
      try {
        await db.collection("units").doc(id).update({ occupancy: currentlyVacant ? "occupied" : "vacant" });
        renderActiveTab();
      } catch (err) {
        alert("Couldn't update: " + err.message);
      }
    });
  });

  document.getElementById("unit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await db.collection("units").add({
        landlordId: data.get("landlordId"),
        houseNumber: data.get("houseNumber"),
        propertyName: data.get("propertyName") || "",
        unitType: data.get("unitType") || "",
        rentAmount: Number(data.get("rentAmount")) || 0,
        waterMeterNumber: data.get("waterMeterNumber") || "",
        powerMeterNumber: data.get("powerMeterNumber") || "",
        occupancy: "vacant"
      });
      renderActiveTab();
    } catch (err) {
      alert("Couldn't add unit: " + err.message);
    }
  });
}

// ---------------------------------------------------------------------
// DEPOSITS TAB
// ---------------------------------------------------------------------
function renderDepositsTab() {
  const unsubscribe = db.collection("deposits").orderBy("paidAt", "desc").onSnapshot((snapshot) => {
    if (activeTab !== "deposits") return;

    const rows = snapshot.empty ? `<p class="empty-state">No deposits recorded yet.</p>` : snapshot.docs.map((doc) => {
      const d = doc.data();
      const refunded = d.status === "refunded";
      return `
        <div class="card">
          <div class="card-title">${escapeHTML(d.tenantName)} &middot; ${unitLabel(d.unitId)}</div>
          <div class="card-sub">Paid: ${money(d.amountPaid)} on ${d.paidAt || ""}</div>
          ${refunded ? `<div class="card-sub">Refunded: ${money(d.amountRefundable)} (deductions: ${money(d.deductions)})</div>` : ""}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
            <span class="pill ${refunded ? "pill-verified" : "pill-pending"}">${refunded ? "Refunded" : "Held"}</span>
            ${!refunded ? `<button class="btn btn-outline" style="width:auto; padding:8px 16px; font-size:13px;" data-action="refund" data-id="${doc.id}">Process Refund</button>` : ""}
          </div>
        </div>`;
    }).join("");

    const unitOptions = unitsCache.map((doc) => `<option value="${doc.id}">${escapeHTML(doc.data().houseNumber)} — ${escapeHTML(landlordName(doc.data().landlordId))}</option>`).join("");

    contentBox.innerHTML = `
      ${collapsePanelHTML({
        id: "deposit-form-panel",
        title: "Record a Deposit",
        collapsedLabel: "+ Record a Deposit",
        expandedLabel: "Record a Deposit",
        bodyHTML: `
          <form id="deposit-form">
            <div class="field"><label>Unit</label><select name="unitId" required>${unitOptions}</select></div>
            <div class="field"><label>Tenant Name</label><input type="text" name="tenantName" required></div>
            <div class="field"><label>Amount Paid (KSh)</label><input type="number" name="amountPaid" min="0" required></div>
            <div class="field"><label>Date Paid</label><input type="date" name="paidAt" required></div>
            <button type="submit" class="btn btn-primary">Record Deposit</button>
          </form>`
      })}
      ${rows}`;

    wireCollapsePanel("deposit-form-panel", { collapsedLabel: "+ Record a Deposit", expandedLabel: "Record a Deposit" });

    document.getElementById("deposit-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const unitId = data.get("unitId");
      const unitDoc = unitsCache.find((d) => d.id === unitId);
      try {
        await db.collection("deposits").add({
          unitId,
          landlordId: unitDoc ? unitDoc.data().landlordId : null,
          tenantName: data.get("tenantName"),
          amountPaid: Number(data.get("amountPaid")) || 0,
          paidAt: data.get("paidAt"),
          status: "held",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        e.target.reset();
        document.getElementById("deposit-form-panel")._setOpen(false);
      } catch (err) {
        alert("Couldn't record deposit: " + err.message);
      }
    });

    contentBox.querySelectorAll("[data-action='refund']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const deductions = Number(prompt("Any deductions from the deposit? Enter 0 if none.", "0")) || 0;
        const doc = snapshot.docs.find((d) => d.id === btn.dataset.id);
        const amountRefundable = Number(doc.data().amountPaid || 0) - deductions;
        try {
          await db.collection("deposits").doc(btn.dataset.id).update({
            status: "refunded",
            deductions,
            amountRefundable,
            refundedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (err) {
          alert("Couldn't process refund: " + err.message);
        }
      });
    });
  });

  activeListeners.push(unsubscribe);
}

// ---------------------------------------------------------------------
// SETTINGS TAB
// ---------------------------------------------------------------------
async function renderSettingsTab() {
  const configDoc = await db.doc("settings/commission").get();
  const config = configDoc.exists ? configDoc.data() : { commissionRate: 0.06, cleaningFee: 2000 };

  contentBox.innerHTML = `
    <div class="card">
      <div class="card-title">Commission Settings</div>
      <div class="card-sub" style="margin-bottom:14px;">Applies the same way to every landlord's monthly commission statement.</div>
      <form id="settings-form">
        <div class="field"><label>Commission Rate (%)</label><input type="number" name="commissionRatePercent" step="0.1" min="0" max="100" value="${(config.commissionRate * 100).toFixed(1)}" required></div>
        <div class="field"><label>Cleaning Fee (KSh, flat per property per month)</label><input type="number" name="cleaningFee" min="0" value="${config.cleaningFee}" required></div>
        <button type="submit" class="btn btn-primary">Save Settings</button>
        <p class="alert alert-success" id="settings-success" style="display:none;">Saved.</p>
      </form>
    </div>`;

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await db.doc("settings/commission").set({
        commissionRate: Number(data.get("commissionRatePercent")) / 100,
        cleaningFee: Number(data.get("cleaningFee"))
      });
      document.getElementById("settings-success").style.display = "block";
    } catch (err) {
      alert("Couldn't save: " + err.message);
    }
  });
}

// ---------------------------------------------------------------------
// REPORTS TAB
// ---------------------------------------------------------------------
function renderReportsTab() {
  const landlordOptions = `<option value="">All Landlords</option>` +
    landlordsCache.map((doc) => `<option value="${doc.id}">${doc.data().name}</option>`).join("");

  contentBox.innerHTML = `
    <div class="card">
      <div class="field"><label>Filter by Landlord</label><select id="report-landlord">${landlordOptions}</select></div>
      <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-rent-roll" style="width:auto; padding:10px 16px;">Rent Roll (This Month)</button>
        <button class="btn btn-outline" id="btn-arrears" style="width:auto; padding:10px 16px;">Arrears</button>
        <button class="btn btn-outline" id="btn-commission" style="width:auto; padding:10px 16px;">Commission Statement</button>
        <button class="btn btn-outline" id="btn-export" style="width:auto; padding:10px 16px;">Export CSV</button>
      </div>
    </div>
    <div id="report-output"></div>`;

  document.getElementById("btn-rent-roll").addEventListener("click", showRentRoll);
  document.getElementById("btn-arrears").addEventListener("click", showArrears);
  document.getElementById("btn-commission").addEventListener("click", showCommissionStatement);
  document.getElementById("btn-export").addEventListener("click", exportCSV);
}

async function showCommissionStatement() {
  const output = document.getElementById("report-output");
  output.innerHTML = `<p class="empty-state">Loading&hellip;</p>`;
  const landlordId = document.getElementById("report-landlord").value;
  const { start, end } = currentMonthRange();

  const configDoc = await db.doc("settings/commission").get();
  const config = configDoc.exists ? configDoc.data() : { commissionRate: 0.06, cleaningFee: 2000 };

  const paymentsSnap = await db.collection("payments")
    .where("status", "==", "verified")
    .where("submittedAt", ">=", start)
    .where("submittedAt", "<", end)
    .get();

  const relevantLandlords = landlordId ? landlordsCache.filter((l) => l.id === landlordId) : landlordsCache;

  const statements = relevantLandlords.map((l) => {
    // Every verified payment counts toward commission the same way,
    // whether the tenant submitted it themselves or staff entered it on
    // their behalf — money always lands in the landlord's own account
    // either way, and Sanefi's fee is for managing that collection.
    const collected = paymentsSnap.docs
      .filter((d) => d.data().landlordId === l.id)
      .reduce((sum, d) => sum + Number(d.data().amount || 0), 0);
    const commission = Math.round(collected * config.commissionRate);
    const totalFees = commission + config.cleaningFee;
    const dueToLandlord = collected - totalFees;
    return { name: l.data().name, collected, commission, cleaningFee: config.cleaningFee, totalFees, dueToLandlord };
  });

  output.innerHTML = `<div class="card"><div class="card-title">Commission Statement &mdash; ${start.toLocaleString("en-KE", { month: "long", year: "numeric" })}</div>` +
    statements.map((s) => `
      <div style="padding:12px 0; border-bottom:1px solid var(--border);">
        <div style="font-weight:700; margin-bottom:6px;">${escapeHTML(s.name)}</div>
        <div class="payment-row"><div>Rent Collected</div><span>${money(s.collected)}</span></div>
        <div class="payment-row"><div>Commission (${(config.commissionRate * 100).toFixed(1)}%)</div><span>${money(s.commission)}</span></div>
        <div class="payment-row"><div>Cleaning Fee</div><span>${money(s.cleaningFee)}</span></div>
        <div class="payment-row"><div><strong>Amount Due to Landlord</strong></div><span><strong>${money(s.dueToLandlord)}</strong></span></div>
      </div>`).join("") + `</div>`;
}

async function showRentRoll() {
  const output = document.getElementById("report-output");
  output.innerHTML = `<p class="empty-state">Loading&hellip;</p>`;
  const landlordId = document.getElementById("report-landlord").value;
  const { start, end } = currentMonthRange();

  const relevantUnits = unitsCache.filter((u) => !landlordId || u.data().landlordId === landlordId);
  const paymentsSnap = await db.collection("payments")
    .where("status", "==", "verified")
    .where("submittedAt", ">=", start)
    .where("submittedAt", "<", end)
    .get();

  const paidUnitIds = new Set(paymentsSnap.docs.map((d) => d.data().unitId));

  output.innerHTML = `<div class="card"><div class="card-title">Rent Roll &mdash; ${start.toLocaleString("en-KE", { month: "long", year: "numeric" })}</div>` +
    relevantUnits.map((u) => {
      const paid = paidUnitIds.has(u.id);
      return `<div class="payment-row"><div>${u.data().houseNumber} &middot; ${landlordName(u.data().landlordId)}</div>${paid ? `<span class="pill pill-verified">Paid</span>` : `<span class="pill pill-rejected">Unpaid</span>`}</div>`;
    }).join("") + `</div>`;
}

async function showArrears() {
  const output = document.getElementById("report-output");
  output.innerHTML = `<p class="empty-state">Loading&hellip;</p>`;
  const landlordId = document.getElementById("report-landlord").value;
  const { start, end } = currentMonthRange();

  const relevantUnits = unitsCache.filter((u) => !landlordId || u.data().landlordId === landlordId);
  const paymentsSnap = await db.collection("payments")
    .where("status", "==", "verified")
    .where("submittedAt", ">=", start)
    .where("submittedAt", "<", end)
    .get();
  const paidUnitIds = new Set(paymentsSnap.docs.map((d) => d.data().unitId));
  const overdue = relevantUnits.filter((u) => !paidUnitIds.has(u.id));

  output.innerHTML = `<div class="card"><div class="card-title">Arrears &mdash; ${overdue.length} unit(s) overdue this month</div>` +
    (overdue.length === 0 ? `<p class="empty-state">Everyone's paid up!</p>` :
      overdue.map((u) => `<div class="payment-row"><div>${u.data().houseNumber} &middot; ${landlordName(u.data().landlordId)}</div><span>${money(u.data().rentAmount)}</span></div>`).join("")
    ) + `</div>`;
}

// Bug fix: values (unit names, landlord names, transaction codes) were
// dropped into the CSV unquoted. A comma inside any of those fields
// used to silently shift every column after it. Each field is now
// quoted and internal quotes are escaped per the CSV spec.
function csvField(value) {
  const str = String(value == null ? "" : value);
  return `"${str.replace(/"/g, '""')}"`;
}

async function exportCSV() {
  const landlordId = document.getElementById("report-landlord").value;
  const snap = await db.collection("payments").where("status", "==", "verified").get();
  const rows = snap.docs
    .filter((d) => !landlordId || d.data().landlordId === landlordId)
    .map((d) => {
      const p = d.data();
      return [
        csvField(p.transactionCode),
        csvField(p.amount),
        csvField(unitLabel(p.unitId)),
        csvField(landlordName(p.landlordId)),
        csvField(p.method),
        csvField(p.paidAtRaw)
      ].join(",");
    });
  const header = ["Transaction Code", "Amount", "Unit", "Landlord", "Method", "Paid At"].map(csvField).join(",");
  const csv = header + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "payment-history.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  const { role } = await getCurrentUserRole(user);
  if (role !== "staff") {
    window.location.href = role === "tenant" ? "portal.html" : "login.html";
    return;
  }

  const [pendingSnap, tenantSnap, unitsSnap, paidUnitIds] = await Promise.all([
    db.collection("payments").where("status", "==", "pending").get(),
    db.collection("tenants").get(),
    db.collection("units").get(),
    getPaidUnitIdsThisMonth()
  ]);
  const overdueCount = tenantSnap.docs.filter((d) => isOverdue(d.data(), paidUnitIds)).length;
  const occupiedCount = unitsSnap.docs.filter((d) => d.data().occupancy !== "vacant").length;
  const vacantCount = unitsSnap.size - occupiedCount;

  statRow.innerHTML = `
    <div class="stat-box"><div class="num">${pendingSnap.size}</div><div class="label">Pending Payments</div></div>
    <div class="stat-box"><div class="num">${tenantSnap.size}</div><div class="label">Total Tenants</div></div>
    <div class="stat-box"><div class="num">${occupiedCount}</div><div class="label">Occupied Units</div></div>
    <div class="stat-box"><div class="num">${vacantCount}</div><div class="label">Vacant Units</div></div>
    <div class="stat-box"><div class="num">${overdueCount}</div><div class="label">Overdue This Month</div></div>`;

  renderTabs();
  renderActiveTab();

  const notifBtn = document.getElementById("notif-btn");
  const notifPanel = document.getElementById("notif-panel");
  wireNotificationToggle(notifBtn, notifPanel);
  attachNotificationBell(notifBtn, notifPanel, "staff");
});

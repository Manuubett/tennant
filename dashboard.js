const statRow = document.getElementById("stat-row");
const tabsBox = document.getElementById("tabs");
const contentBox = document.getElementById("tab-content");

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut().then(() => window.location.href = "login.html"));

let activeTab = "payments";
let landlordsCache = [];
let unitsCache = [];

const TABS = [
  { key: "payments", label: "Payments" },
  { key: "landlords", label: "Landlords" },
  { key: "units", label: "Units" },
  { key: "reports", label: "Reports" }
];

function renderTabs() {
  tabsBox.innerHTML = TABS.map((t) => `
    <button class="tab-btn ${activeTab === t.key ? "active" : ""}" data-tab="${t.key}">${t.label}</button>
  `).join("");
  tabsBox.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderTabs();
      renderActiveTab();
    });
  });
}

async function refreshCaches() {
  const [landlordSnap, unitSnap] = await Promise.all([
    db.collection("landlords").orderBy("name").get(),
    db.collection("units").get()
  ]);
  landlordsCache = landlordSnap.docs;
  unitsCache = unitSnap.docs;
}

function landlordName(id) {
  const doc = landlordsCache.find((d) => d.id === id);
  return doc ? doc.data().name : "Unknown";
}
function unitLabel(id) {
  const doc = unitsCache.find((d) => d.id === id);
  return doc ? doc.data().houseNumber : "Unknown unit";
}

async function renderActiveTab() {
  contentBox.innerHTML = `<p class="empty-state">Loading&hellip;</p>`;
  await refreshCaches();
  if (activeTab === "payments") renderPaymentsTab();
  else if (activeTab === "landlords") renderLandlordsTab();
  else if (activeTab === "units") renderUnitsTab();
  else if (activeTab === "reports") renderReportsTab();
}

// ---------------------------------------------------------------------
// PAYMENTS TAB
// ---------------------------------------------------------------------
function renderPaymentsTab() {
  db.collection("payments").orderBy("submittedAt", "desc").limit(100).onSnapshot((snapshot) => {
    if (activeTab !== "payments") return;
    if (snapshot.empty) {
      contentBox.innerHTML = `<p class="empty-state">No payments submitted yet.</p>`;
      return;
    }
    contentBox.innerHTML = snapshot.docs.map((doc) => {
      const p = doc.data();
      const mismatchBadge = p.recipientMatch === false
        ? `<span class="pill pill-mismatch">Recipient Mismatch</span>` : "";
      const actions = p.status === "pending"
        ? `
          <button class="btn btn-primary" style="width:auto; padding:8px 16px; font-size:13px;" data-action="verify" data-id="${doc.id}">Verify</button>
          <button class="btn btn-outline" style="width:auto; padding:8px 16px; font-size:13px;" data-action="reject" data-id="${doc.id}">Reject</button>`
        : "";
      return `
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div>
              <div class="card-title">KSh ${Number(p.amount || 0).toLocaleString()}</div>
              <div class="card-sub">${unitLabel(p.unitId)} &middot; ${landlordName(p.landlordId)}</div>
              <div class="card-sub">${p.transactionCode} &middot; ${p.paidAtRaw || ""}</div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <span class="pill pill-${p.status}">${p.status}</span>
              ${mismatchBadge}
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:12px;">${actions}</div>
        </div>`;
    }).join("");

    contentBox.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const status = btn.dataset.action === "verify" ? "verified" : "rejected";
        btn.disabled = true;
        try {
          await db.collection("payments").doc(id).update({ status });
        } catch (err) {
          alert("Couldn't update: " + err.message);
          btn.disabled = false;
        }
      });
    });
  });
}

// ---------------------------------------------------------------------
// LANDLORDS TAB
// ---------------------------------------------------------------------
function renderLandlordsTab() {
  const rows = landlordsCache.map((doc) => {
    const l = doc.data();
    const detail = l.paymentMethod === "paybill" ? `Paybill ${l.paybillNumber || ""} (Acc: ${l.accountHint || "any"})`
      : l.paymentMethod === "till" ? `Till ${l.tillNumber || ""} (${l.businessName || ""})`
      : `Phone ${l.phoneNumber || ""} (${l.registeredName || ""})`;
    return `
      <div class="card">
        <div class="card-title">${l.name}</div>
        <div class="card-sub">${detail}</div>
        <div class="card-sub">${l.contact || ""}</div>
      </div>`;
  }).join("") || `<p class="empty-state">No landlords added yet.</p>`;

  contentBox.innerHTML = `
    ${rows}
    <div class="card">
      <div class="card-title">Add Landlord</div>
      <form id="landlord-form" style="margin-top:12px;">
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
        <button type="submit" class="btn btn-primary">Add Landlord</button>
      </form>
    </div>`;

  const methodSelect = document.getElementById("ll-method");
  methodSelect.addEventListener("change", () => {
    document.getElementById("ll-paybill-fields").style.display = methodSelect.value === "paybill" ? "block" : "none";
    document.getElementById("ll-till-fields").style.display = methodSelect.value === "till" ? "block" : "none";
    document.getElementById("ll-phone-fields").style.display = methodSelect.value === "phone" ? "block" : "none";
  });

  document.getElementById("landlord-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await db.collection("landlords").add({
        name: data.get("name"),
        contact: data.get("contact"),
        paymentMethod: data.get("paymentMethod"),
        paybillNumber: data.get("paybillNumber") || null,
        accountHint: data.get("accountHint") || null,
        tillNumber: data.get("tillNumber") || null,
        businessName: data.get("businessName") || null,
        phoneNumber: data.get("phoneNumber") || null,
        registeredName: data.get("registeredName") || null
      });
      renderActiveTab();
    } catch (err) {
      alert("Couldn't add landlord: " + err.message);
    }
  });
}

// ---------------------------------------------------------------------
// UNITS TAB
// ---------------------------------------------------------------------
function renderUnitsTab() {
  const rows = unitsCache.map((doc) => {
    const u = doc.data();
    return `
      <div class="card">
        <div class="card-title">${u.houseNumber}</div>
        <div class="card-sub">${u.propertyName || ""} &middot; ${landlordName(u.landlordId)}</div>
        <div class="card-sub">Rent: KSh ${Number(u.rentAmount || 0).toLocaleString()}</div>
      </div>`;
  }).join("") || `<p class="empty-state">No units added yet.</p>`;

  const landlordOptions = landlordsCache.map((doc) => `<option value="${doc.id}">${doc.data().name}</option>`).join("");

  contentBox.innerHTML = `
    ${rows}
    <div class="card">
      <div class="card-title">Add Unit</div>
      <form id="unit-form" style="margin-top:12px;">
        <div class="field"><label>Landlord / Property</label><select name="landlordId" required>${landlordOptions}</select></div>
        <div class="field"><label>House / Unit Number</label><input type="text" name="houseNumber" placeholder="e.g. A101" required></div>
        <div class="field"><label>Property Name</label><input type="text" name="propertyName"></div>
        <div class="field"><label>Monthly Rent (KSh)</label><input type="number" name="rentAmount" min="0"></div>
        <button type="submit" class="btn btn-primary">Add Unit</button>
      </form>
    </div>`;

  document.getElementById("unit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await db.collection("units").add({
        landlordId: data.get("landlordId"),
        houseNumber: data.get("houseNumber"),
        propertyName: data.get("propertyName") || "",
        rentAmount: Number(data.get("rentAmount")) || 0
      });
      renderActiveTab();
    } catch (err) {
      alert("Couldn't add unit: " + err.message);
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
        <button class="btn btn-outline" id="btn-export" style="width:auto; padding:10px 16px;">Export CSV</button>
      </div>
    </div>
    <div id="report-output"></div>`;

  document.getElementById("btn-rent-roll").addEventListener("click", showRentRoll);
  document.getElementById("btn-arrears").addEventListener("click", showArrears);
  document.getElementById("btn-export").addEventListener("click", exportCSV);
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
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
      overdue.map((u) => `<div class="payment-row"><div>${u.data().houseNumber} &middot; ${landlordName(u.data().landlordId)}</div><span>KSh ${Number(u.data().rentAmount || 0).toLocaleString()}</span></div>`).join("")
    ) + `</div>`;
}

async function exportCSV() {
  const landlordId = document.getElementById("report-landlord").value;
  const snap = await db.collection("payments").where("status", "==", "verified").get();
  const rows = snap.docs
    .filter((d) => !landlordId || d.data().landlordId === landlordId)
    .map((d) => {
      const p = d.data();
      return [p.transactionCode, p.amount, unitLabel(p.unitId), landlordName(p.landlordId), p.method, p.paidAtRaw].join(",");
    });
  const csv = "Transaction Code,Amount,Unit,Landlord,Method,Paid At\n" + rows.join("\n");
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

  const pendingCount = (await db.collection("payments").where("status", "==", "pending").get()).size;
  const tenantCount = (await db.collection("tenants").get()).size;
  statRow.innerHTML = `
    <div class="stat-box"><div class="num">${pendingCount}</div><div class="label">Pending Payments</div></div>
    <div class="stat-box"><div class="num">${tenantCount}</div><div class="label">Total Tenants</div></div>`;

  renderTabs();
  renderActiveTab();
});

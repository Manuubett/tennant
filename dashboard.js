const statRow = document.getElementById("stat-row");
const tabsBox = document.getElementById("tabs");
const contentBox = document.getElementById("tab-content");

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut().then(() => window.location.href = "login.html"));

let activeTab = "payments";
let landlordsCache = [];
let unitsCache = [];

const TABS = [
  { key: "payments", label: "Payments" },
  { key: "landlords", label: "Landlords" },
  { key: "units", label: "Units" },
  { key: "deposits", label: "Deposits" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" }
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
  else if (activeTab === "deposits") renderDepositsTab();
  else if (activeTab === "reports") renderReportsTab();
  else if (activeTab === "settings") renderSettingsTab();
}

// ---------------------------------------------------------------------
// PAYMENTS TAB
// ---------------------------------------------------------------------
function renderPaymentsTab() {
  db.collection("payments").orderBy("submittedAt", "desc").limit(100).onSnapshot((snapshot) => {
    if (activeTab !== "payments") return;
    const listHTML = snapshot.empty ? `<p class="empty-state">No payments submitted yet.</p>` : snapshot.docs.map((doc) => {
      const p = doc.data();
      const mismatchBadge = p.recipientMatch === false
        ? `<span class="pill pill-mismatch">Recipient Mismatch</span>` : "";
      const manualBadge = p.enteredByStaff
        ? `<span class="pill" style="background:#e6e9f0; color:var(--ink-soft);">Entered by Staff</span>` : "";
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
              <div class="card-sub">${p.transactionCode || "Manual entry"} &middot; ${p.paidAtRaw || ""}</div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <span class="pill pill-${p.status}">${p.status}</span>
              ${mismatchBadge}${manualBadge}
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:12px;">${actions}</div>
        </div>`;
    }).join("");

    const unitOptions = unitsCache.map((doc) => `<option value="${doc.id}" data-landlord="${doc.data().landlordId}">${escapeHTML(doc.data().houseNumber)} — ${escapeHTML(landlordName(doc.data().landlordId))}</option>`).join("");

    contentBox.innerHTML = listHTML + `
      <div class="card">
        <div class="card-title">Record Payment on Behalf of a Tenant</div>
        <div class="card-sub" style="margin-bottom:12px;">Use this when a tenant forwarded their M-Pesa confirmation (e.g. via WhatsApp) instead of submitting it themselves through the app. Paste the exact message text below — it's parsed and counted toward commission the same as any tenant-submitted payment.</div>
        <form id="manual-payment-form">
          <div class="field"><label>Unit</label><select name="unitId" id="manual-unit-select" required>${unitOptions}</select></div>
          <div class="field"><label>M-Pesa Message</label><textarea name="message" placeholder="Paste the full confirmation message here..." required></textarea></div>
          <button type="submit" class="btn btn-outline">Record Payment</button>
          <p class="alert alert-error" id="manual-payment-error" style="display:none;"></p>
        </form>
      </div>`;

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

    const manualForm = document.getElementById("manual-payment-form");
    const manualError = document.getElementById("manual-payment-error");
    if (manualForm) {
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
        } catch (err) {
          manualError.textContent = "Couldn't record payment: " + err.message;
          manualError.style.display = "block";
        }
      });
    }
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
    const vacant = u.occupancy === "vacant";
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="card-title">${u.houseNumber} ${u.unitType ? "&middot; " + escapeHTML(u.unitType) : ""}</div>
            <div class="card-sub">${u.propertyName || ""} &middot; ${landlordName(u.landlordId)}</div>
            <div class="card-sub">Rent: KSh ${Number(u.rentAmount || 0).toLocaleString()}</div>
            <div class="card-sub">Water Meter: ${u.waterMeterNumber || "—"} &middot; Power Meter: ${u.powerMeterNumber || "—"}</div>
          </div>
          <span class="pill ${vacant ? "pill-rejected" : "pill-verified"}" data-toggle-occupancy="${doc.id}" style="cursor:pointer;">${vacant ? "Vacant" : "Occupied"}</span>
        </div>
      </div>`;
  }).join("") || `<p class="empty-state">No units added yet.</p>`;

  const landlordOptions = landlordsCache.map((doc) => `<option value="${doc.id}">${doc.data().name}</option>`).join("");

  contentBox.innerHTML = `
    ${rows}
    <div class="card">
      <div class="card-title">Add Unit</div>
      <form id="unit-form" style="margin-top:12px;">
        <div class="field"><label>Landlord / Property</label><select name="landlordId" required>${landlordOptions}</select></div>
        <div class="field"><label>House / Unit Number</label><input type="text" name="houseNumber" placeholder="e.g. 3A" required></div>
        <div class="field"><label>Property Name</label><input type="text" name="propertyName" placeholder="e.g. E&amp;L Apartments"></div>
        <div class="field"><label>Unit Type</label><input type="text" name="unitType" placeholder="e.g. 2BR, Bedsitter, Single"></div>
        <div class="field"><label>Monthly Rent (KSh)</label><input type="number" name="rentAmount" min="0"></div>
        <div class="field"><label>Water Meter Number</label><input type="text" name="waterMeterNumber"></div>
        <div class="field"><label>Power Meter Number</label><input type="text" name="powerMeterNumber"></div>
        <button type="submit" class="btn btn-primary">Add Unit</button>
      </form>
    </div>`;

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
  db.collection("deposits").orderBy("paidAt", "desc").onSnapshot((snapshot) => {
    if (activeTab !== "deposits") return;

    const rows = snapshot.empty ? `<p class="empty-state">No deposits recorded yet.</p>` : snapshot.docs.map((doc) => {
      const d = doc.data();
      const refunded = d.status === "refunded";
      return `
        <div class="card">
          <div class="card-title">${escapeHTML(d.tenantName)} &middot; ${unitLabel(d.unitId)}</div>
          <div class="card-sub">Paid: KSh ${Number(d.amountPaid || 0).toLocaleString()} on ${d.paidAt || ""}</div>
          ${refunded ? `<div class="card-sub">Refunded: KSh ${Number(d.amountRefundable || 0).toLocaleString()} (deductions: KSh ${Number(d.deductions || 0).toLocaleString()})</div>` : ""}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
            <span class="pill ${refunded ? "pill-verified" : "pill-pending"}">${refunded ? "Refunded" : "Held"}</span>
            ${!refunded ? `<button class="btn btn-outline" style="width:auto; padding:8px 16px; font-size:13px;" data-action="refund" data-id="${doc.id}">Process Refund</button>` : ""}
          </div>
        </div>`;
    }).join("");

    const unitOptions = unitsCache.map((doc) => `<option value="${doc.id}">${escapeHTML(doc.data().houseNumber)} — ${escapeHTML(landlordName(doc.data().landlordId))}</option>`).join("");

    contentBox.innerHTML = rows + `
      <div class="card">
        <div class="card-title">Record a Deposit</div>
        <form id="deposit-form" style="margin-top:12px;">
          <div class="field"><label>Unit</label><select name="unitId" required>${unitOptions}</select></div>
          <div class="field"><label>Tenant Name</label><input type="text" name="tenantName" required></div>
          <div class="field"><label>Amount Paid (KSh)</label><input type="number" name="amountPaid" min="0" required></div>
          <div class="field"><label>Date Paid</label><input type="date" name="paidAt" required></div>
          <button type="submit" class="btn btn-primary">Record Deposit</button>
        </form>
      </div>`;

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
        <div class="payment-row"><div>Rent Collected</div><span>KSh ${s.collected.toLocaleString()}</span></div>
        <div class="payment-row"><div>Commission (${(config.commissionRate * 100).toFixed(1)}%)</div><span>KSh ${s.commission.toLocaleString()}</span></div>
        <div class="payment-row"><div>Cleaning Fee</div><span>KSh ${s.cleaningFee.toLocaleString()}</span></div>
        <div class="payment-row"><div><strong>Amount Due to Landlord</strong></div><span><strong>KSh ${s.dueToLandlord.toLocaleString()}</strong></span></div>
      </div>`).join("") + `</div>`;
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

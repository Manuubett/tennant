const header = document.getElementById("tenant-header");
const pendingNotice = document.getElementById("pending-notice");
const paymentForm = document.getElementById("payment-form");
const submitBtn = document.getElementById("submit-payment-btn");
const errorBox = document.getElementById("payment-error");
const successBox = document.getElementById("payment-success");
const historyCard = document.getElementById("history-card");
const rentStatusCard = document.getElementById("rent-status-card");
const leaseDepositCard = document.getElementById("lease-deposit-card");
const maintenanceList = document.getElementById("maintenance-list");
const maintenanceForm = document.getElementById("maintenance-form");
const maintenanceSubmitBtn = document.getElementById("submit-maintenance-btn");
const maintenanceError = document.getElementById("maintenance-error");
const maintenanceSuccess = document.getElementById("maintenance-success");

let tenantProfile = null;
let landlordProfile = null;
let unitProfile = null;

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut().then(() => window.location.href = "login.html"));

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function pillFor(status) {
  const map = { pending: "Pending Review", verified: "Verified", rejected: "Rejected" };
  return `<span class="pill pill-${status}">${map[status] || status}</span>`;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

// ---------------------------------------------------------------------
// RENT STATUS SUMMARY
// ---------------------------------------------------------------------
async function renderRentStatus(uid) {
  if (!unitProfile) {
    rentStatusCard.innerHTML = "";
    return;
  }

  const dueDay = Number(tenantProfile.rentDueDay) || 5;
  const now = new Date();
  const { start, end } = currentMonthRange();

  // Lease hasn't started yet — nothing owed.
  if (tenantProfile.leaseStartDate) {
    const leaseStart = new Date(tenantProfile.leaseStartDate);
    if (!isNaN(leaseStart) && leaseStart > now) {
      rentStatusCard.innerHTML = `
        <div class="card rent-status-card">
          <div class="card-title">Lease Starts ${leaseStart.toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}</div>
          <div class="card-sub">Nothing is due yet.</div>
        </div>`;
      return;
    }
  }

  const paidSnap = await db.collection("payments")
    .where("tenantId", "==", uid)
    .where("status", "==", "verified")
    .where("submittedAt", ">=", start)
    .where("submittedAt", "<", end)
    .get();

  const paidThisMonth = !paidSnap.empty;
  const rentAmount = Number(unitProfile.rentAmount || 0);

  let dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
  let statusClass = "is-paid";
  let statusLine = "";

  if (paidThisMonth) {
    // Show next month's due date once this month is settled.
    dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    statusClass = "is-paid";
    statusLine = `<span class="pill pill-verified">Paid for this month</span>`;
  } else if (now > dueDate) {
    statusClass = "is-overdue";
    statusLine = `<span class="pill pill-rejected">Overdue</span>`;
  } else {
    statusClass = "is-due";
    statusLine = `<span class="pill pill-pending">Due Soon</span>`;
  }

  rentStatusCard.innerHTML = `
    <div class="card rent-status-card ${statusClass}">
      <div class="card-sub">${paidThisMonth ? "Next Payment Due" : "Amount Due"}</div>
      <div class="rent-status-amount">KSh ${rentAmount.toLocaleString()}</div>
      <div class="rent-status-due">Due ${dueDate.toLocaleDateString("en-KE", { day: "numeric", month: "long" })}</div>
      <div style="margin-top:10px;">${statusLine}</div>
    </div>`;
}

// ---------------------------------------------------------------------
// LEASE & DEPOSIT INFO
// ---------------------------------------------------------------------
async function renderLeaseDeposit() {
  if (!unitProfile) {
    leaseDepositCard.innerHTML = "";
    return;
  }

  let depositHTML = `<div class="card-sub">No deposit on record yet.</div>`;
  if (tenantProfile.unitId) {
    const depositSnap = await db.collection("deposits")
      .where("unitId", "==", tenantProfile.unitId)
      .orderBy("paidAt", "desc")
      .limit(1)
      .get();
    if (!depositSnap.empty) {
      const d = depositSnap.docs[0].data();
      const refunded = d.status === "refunded";
      depositHTML = `
        <div class="card-sub">Deposit Paid: KSh ${Number(d.amountPaid || 0).toLocaleString()} on ${d.paidAt || ""}</div>
        <div style="margin-top:6px;"><span class="pill ${refunded ? "pill-verified" : "pill-pending"}">${refunded ? "Refunded" : "Held"}</span></div>
        ${refunded ? `<div class="card-sub" style="margin-top:6px;">Refunded Amount: KSh ${Number(d.amountRefundable || 0).toLocaleString()}</div>` : ""}`;
    }
  }

  const leaseStartLine = tenantProfile.leaseStartDate
    ? new Date(tenantProfile.leaseStartDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
    : "Not on record";

  leaseDepositCard.innerHTML = `
    <div class="card">
      <div class="card-title">Lease & Deposit</div>
      <div class="card-sub">Unit: ${escapeHTML(unitProfile.houseNumber || "")} ${unitProfile.propertyName ? "&middot; " + escapeHTML(unitProfile.propertyName) : ""}</div>
      <div class="card-sub">Monthly Rent: KSh ${Number(unitProfile.rentAmount || 0).toLocaleString()}</div>
      <div class="card-sub">Lease Start: ${leaseStartLine}</div>
      <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">${depositHTML}</div>
    </div>`;
}

// ---------------------------------------------------------------------
// PAYMENT HISTORY + RECEIPTS
// ---------------------------------------------------------------------
function openReceipt(payment) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to view the receipt.");
    return;
  }
  const paidOn = payment.submittedAt && payment.submittedAt.toDate
    ? payment.submittedAt.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
    : (payment.paidAtRaw || "");

  win.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Receipt</title>
    <link rel="stylesheet" href="app-style.css"></head>
    <body>
      <div class="receipt-page">
        <div class="receipt-card">
          <div class="receipt-brand">Sanefi Rent</div>
          <div class="receipt-sub">Official Payment Receipt</div>
          <div class="receipt-row"><span class="label">Tenant</span><span class="value">${escapeHTML(tenantProfile.name || "")}</span></div>
          <div class="receipt-row"><span class="label">Unit</span><span class="value">${escapeHTML(unitProfile ? unitProfile.houseNumber : "")}</span></div>
          <div class="receipt-row"><span class="label">Landlord</span><span class="value">${escapeHTML(landlordProfile ? landlordProfile.name : "")}</span></div>
          <div class="receipt-row"><span class="label">Transaction Code</span><span class="value">${escapeHTML(payment.transactionCode || "Manual")}</span></div>
          <div class="receipt-row"><span class="label">Date Paid</span><span class="value">${escapeHTML(paidOn)}</span></div>
          <div class="receipt-row"><span class="label">Status</span><span class="value">Verified</span></div>
          <div class="receipt-total"><span>Amount</span><span>KSh ${Number(payment.amount || 0).toLocaleString()}</span></div>
          <button class="btn btn-primary receipt-print-btn" onclick="window.print()">Print / Save as PDF</button>
        </div>
      </div>
    </body></html>`);
  win.document.close();
}

function loadHistory(uid) {
  db.collection("payments")
    .where("tenantId", "==", uid)
    .orderBy("submittedAt", "desc")
    .onSnapshot((snapshot) => {
      renderRentStatus(uid);

      if (snapshot.empty) {
        historyCard.innerHTML = `<p class="empty-state">No payments submitted yet.</p>`;
        return;
      }
      historyCard.innerHTML = snapshot.docs.map((doc) => {
        const p = doc.data();
        const receiptBtn = p.status === "verified"
          ? `<button class="btn-link" data-receipt-id="${doc.id}" style="margin-top:6px;">Download Receipt</button>`
          : "";
        return `
          <div class="payment-row">
            <div>
              <div class="amount">KSh ${Number(p.amount || 0).toLocaleString()}</div>
              <div class="meta">${p.paidAtRaw || ""} &middot; ${p.transactionCode || ""}</div>
              ${receiptBtn}
            </div>
            ${pillFor(p.status)}
          </div>`;
      }).join("");

      historyCard.querySelectorAll("[data-receipt-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const doc = snapshot.docs.find((d) => d.id === btn.dataset.receiptId);
          if (doc) openReceipt(doc.data());
        });
      });
    }, (err) => {
      console.error(err);
      historyCard.innerHTML = `<p class="empty-state">Couldn't load payment history.</p>`;
    });
}

paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.style.display = "none";
  successBox.style.display = "none";

  const rawMessage = new FormData(paymentForm).get("message");
  const parsed = parseMpesaMessage(rawMessage);

  if (!parsed.success) {
    errorBox.textContent = parsed.error;
    errorBox.style.display = "block";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    // Duplicate check: same transaction code shouldn't be submitted twice.
    const dupe = await db.collection("payments").where("transactionCode", "==", parsed.transactionCode).get();
    if (!dupe.empty) {
      errorBox.textContent = "This payment has already been submitted.";
      errorBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Payment";
      return;
    }

    const recipientMatch = landlordProfile ? checkRecipientMatch(parsed, landlordProfile) : false;

    await db.collection("payments").add({
      tenantId: auth.currentUser.uid,
      unitId: tenantProfile.unitId,
      landlordId: tenantProfile.landlordId,
      rawMessage: parsed.rawMessage,
      method: parsed.method,
      transactionCode: parsed.transactionCode,
      amount: parsed.amount,
      paidAtRaw: parsed.paidAtRaw,
      recipientName: parsed.recipientName || null,
      recipientMatch,
      status: "pending",
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    addNotification("staff", "payment_submitted", `${tenantProfile.name} submitted a payment of KSh ${Number(parsed.amount || 0).toLocaleString()}.`);

    successBox.textContent = "Payment submitted! It will show as verified once the office confirms it.";
    successBox.style.display = "block";
    paymentForm.reset();
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Couldn't submit: " + err.message;
    errorBox.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Payment";
  }
});

// ---------------------------------------------------------------------
// MAINTENANCE REQUESTS
// ---------------------------------------------------------------------
// Status lifecycle: open -> in_progress -> resolved -> closed
// "resolved" is a staff claim, not a fact — the tenant gets the final
// word. From "resolved" they either confirm (-> closed, done) or say
// it's still broken (-> back to open, with their note attached so
// staff isn't guessing why it bounced back).
function maintenancePillFor(status) {
  const map = { open: "pill-pending", in_progress: "pill-pending", resolved: "pill-awaiting", closed: "pill-verified" };
  const label = { open: "Open", in_progress: "In Progress", resolved: "Awaiting Your Confirmation", closed: "Closed" };
  return `<span class="pill ${map[status] || "pill-pending"}">${label[status] || status}</span>`;
}

function maintenanceCardHTML(doc) {
  const m = doc.data();
  const when = m.submittedAt && m.submittedAt.toDate ? m.submittedAt.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : "";

  const confirmBlockHTML = m.status === "resolved" ? `
    <div class="maintenance-confirm">
      <div class="card-sub"><strong>The office marked this as resolved.</strong> Is it fixed?</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" data-mtn-confirm-fixed="${doc.id}">Yes, it's fixed</button>
        <button class="btn btn-outline" data-mtn-reopen-toggle="${doc.id}">Still broken</button>
      </div>
      <div class="maintenance-reopen-form" id="reopen-form-${doc.id}" style="display:none;">
        <div class="field">
          <label>What's still wrong? (optional)</label>
          <textarea id="reopen-note-${doc.id}" placeholder="e.g. still leaking, just slower now"></textarea>
        </div>
        <button class="btn btn-outline" data-mtn-reopen-submit="${doc.id}">Send Back to Office</button>
      </div>
    </div>` : "";

  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div>
          <span class="chip">${escapeHTML(m.category || "Other")}</span>
          <div class="card-sub" style="margin-top:8px;">${escapeHTML(m.description || "")}</div>
          <div class="card-sub" style="margin-top:4px;">Reported ${when}</div>
          ${m.staffNote ? `<div class="card-sub" style="margin-top:6px;"><strong>Office note:</strong> ${escapeHTML(m.staffNote)}</div>` : ""}
        </div>
        ${maintenancePillFor(m.status)}
      </div>
      ${confirmBlockHTML}
    </div>`;
}

function loadMaintenance(uid) {
  db.collection("maintenanceRequests")
    .where("tenantId", "==", uid)
    .orderBy("submittedAt", "desc")
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        maintenanceList.innerHTML = `<p class="empty-state">No maintenance requests yet.</p>`;
        return;
      }
      maintenanceList.innerHTML = snapshot.docs.map(maintenanceCardHTML).join("");

      maintenanceList.querySelectorAll("[data-mtn-confirm-fixed]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.mtnConfirmFixed;
          btn.disabled = true;
          try {
            await db.collection("maintenanceRequests").doc(id).update({
              status: "closed",
              closedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          } catch (err) {
            alert("Couldn't update: " + err.message);
            btn.disabled = false;
          }
        });
      });

      maintenanceList.querySelectorAll("[data-mtn-reopen-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.mtnReopenToggle;
          const form = document.getElementById(`reopen-form-${id}`);
          if (form) form.style.display = form.style.display === "none" ? "block" : "none";
        });
      });

      maintenanceList.querySelectorAll("[data-mtn-reopen-submit]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.mtnReopenSubmit;
          const noteField = document.getElementById(`reopen-note-${id}`);
          const note = noteField ? noteField.value.trim() : "";
          btn.disabled = true;
          try {
            const doc = snapshot.docs.find((d) => d.id === id);
            const m = doc ? doc.data() : {};
            await db.collection("maintenanceRequests").doc(id).update({
              status: "open",
              tenantNote: note || null,
              reopenedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            addNotification("staff", "maintenance_reopened", `${tenantProfile.name} says the ${(m.category || "").toLowerCase() || "reported"} issue isn't fixed${unitProfile ? " at " + unitProfile.houseNumber : ""}.`);
          } catch (err) {
            alert("Couldn't send: " + err.message);
            btn.disabled = false;
          }
        });
      });
    }, (err) => {
      console.error(err);
      maintenanceList.innerHTML = `<p class="empty-state">Couldn't load maintenance requests.</p>`;
    });
}

maintenanceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  maintenanceError.style.display = "none";
  maintenanceSuccess.style.display = "none";

  const data = new FormData(maintenanceForm);
  const category = data.get("category");
  const description = data.get("description");

  maintenanceSubmitBtn.disabled = true;
  maintenanceSubmitBtn.textContent = "Submitting...";

  try {
    await db.collection("maintenanceRequests").add({
      tenantId: auth.currentUser.uid,
      unitId: tenantProfile.unitId,
      landlordId: tenantProfile.landlordId,
      category,
      description,
      status: "open",
      submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    addNotification("staff", "maintenance_submitted", `${tenantProfile.name} reported a ${category.toLowerCase()} issue${unitProfile ? " at " + unitProfile.houseNumber : ""}.`);

    maintenanceSuccess.textContent = "Request submitted. The office will follow up.";
    maintenanceSuccess.style.display = "block";
    maintenanceForm.reset();
  } catch (err) {
    console.error(err);
    maintenanceError.textContent = "Couldn't submit: " + err.message;
    maintenanceError.style.display = "block";
  } finally {
    maintenanceSubmitBtn.disabled = false;
    maintenanceSubmitBtn.textContent = "Submit Request";
  }
});

// ---------------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const { role, profile } = await getCurrentUserRole(user);
  if (role !== "tenant") {
    window.location.href = role === "staff" ? "dashboard.html" : "login.html";
    return;
  }

  tenantProfile = profile;
  header.textContent = `Hi, ${profile.name.split(" ")[0]}`;

  if (profile.status === "pending") {
    pendingNotice.innerHTML = `<p class="alert alert-error">Your account is pending verification by the office. You can still submit payments, but let the office know you've registered.</p>`;
  }

  if (profile.landlordId) {
    db.collection("landlords").doc(profile.landlordId).get().then((doc) => {
      if (doc.exists) landlordProfile = doc.data();
    });
  }

  if (profile.unitId) {
    const unitDoc = await db.collection("units").doc(profile.unitId).get();
    if (unitDoc.exists) unitProfile = unitDoc.data();
  }

  renderLeaseDeposit();
  loadHistory(user.uid);
  loadMaintenance(user.uid);

  const notifBtn = document.getElementById("notif-btn");
  const notifPanel = document.getElementById("notif-panel");
  wireNotificationToggle(notifBtn, notifPanel);
  attachNotificationBell(notifBtn, notifPanel, user.uid);
});

const header = document.getElementById("tenant-header");
const pendingNotice = document.getElementById("pending-notice");
const paymentForm = document.getElementById("payment-form");
const submitBtn = document.getElementById("submit-payment-btn");
const errorBox = document.getElementById("payment-error");
const successBox = document.getElementById("payment-success");
const historyCard = document.getElementById("history-card");

let tenantProfile = null;
let landlordProfile = null;

document.getElementById("logout-btn").addEventListener("click", () => auth.signOut().then(() => window.location.href = "login.html"));

function pillFor(status) {
  const map = { pending: "Pending Review", verified: "Verified", rejected: "Rejected" };
  return `<span class="pill pill-${status}">${map[status] || status}</span>`;
}

function loadHistory(uid) {
  db.collection("payments")
    .where("tenantId", "==", uid)
    .orderBy("submittedAt", "desc")
    .onSnapshot((snapshot) => {
      if (snapshot.empty) {
        historyCard.innerHTML = `<p class="empty-state">No payments submitted yet.</p>`;
        return;
      }
      historyCard.innerHTML = snapshot.docs.map((doc) => {
        const p = doc.data();
        return `
          <div class="payment-row">
            <div>
              <div class="amount">KSh ${Number(p.amount || 0).toLocaleString()}</div>
              <div class="meta">${p.paidAtRaw || ""} &middot; ${p.transactionCode || ""}</div>
            </div>
            ${pillFor(p.status)}
          </div>`;
      }).join("");
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

  loadHistory(user.uid);
});

const form = document.getElementById("signup-form");
const errorBox = document.getElementById("signup-error");
const signupBtn = document.getElementById("signup-btn");
const landlordSelect = document.getElementById("landlord-select");
const unitSelect = document.getElementById("unit-select");

let unitsByLandlord = {};

// Load landlords + units up front so the tenant can pick their property
// and specific house/unit number.
db.collection("landlords").orderBy("name").get().then((snapshot) => {
  if (snapshot.empty) {
    landlordSelect.innerHTML = `<option value="">No properties available yet</option>`;
    return;
  }
  landlordSelect.innerHTML = `<option value="">Select a property</option>` +
    snapshot.docs.map((doc) => `<option value="${doc.id}">${escapeHTML(doc.data().name)}</option>`).join("");
}).catch((err) => {
  console.error(err);
  landlordSelect.innerHTML = `<option value="">Couldn't load properties</option>`;
});

landlordSelect.addEventListener("change", async () => {
  const landlordId = landlordSelect.value;
  unitSelect.disabled = true;
  unitSelect.innerHTML = `<option value="">Loading units&hellip;</option>`;
  if (!landlordId) {
    unitSelect.innerHTML = `<option value="">Choose a property first</option>`;
    return;
  }

  if (!unitsByLandlord[landlordId]) {
    const snapshot = await db.collection("units").where("landlordId", "==", landlordId).get();
    unitsByLandlord[landlordId] = snapshot.docs;
  }

  const units = unitsByLandlord[landlordId];
  if (units.length === 0) {
    unitSelect.innerHTML = `<option value="">No units listed for this property</option>`;
    return;
  }
  unitSelect.innerHTML = `<option value="">Select your unit</option>` +
    units.map((doc) => `<option value="${doc.id}">${escapeHTML(doc.data().houseNumber)}</option>`).join("");
  unitSelect.disabled = false;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.style.display = "none";
  signupBtn.disabled = true;
  signupBtn.textContent = "Creating account...";

  const data = new FormData(form);
  const landlordId = data.get("landlordId");
  const unitId = data.get("unitId");

  try {
    const cred = await auth.createUserWithEmailAndPassword(data.get("email"), data.get("password"));

    // Tenant profile starts "pending" — staff confirm they actually live
    // in the unit they selected before payments are trusted.
    await db.collection("tenants").doc(cred.user.uid).set({
      name: data.get("name"),
      phone: data.get("phone"),
      email: data.get("email"),
      landlordId,
      unitId,
      status: "pending",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    window.location.href = "portal.html";
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message;
    errorBox.style.display = "block";
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account";
  }
});

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

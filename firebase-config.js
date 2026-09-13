// ---------------------------------------------------------------------
// SEPARATE Firebase project for the Tenant Payment App.
// Do NOT reuse the Sanefi Consult website's project here — this keeps
// tenant/landlord/payment data isolated from the public website's Auth
// user pool, per the earlier decision.
//
// Firebase Console -> create a NEW project (e.g. "sanefi-rent-app")
// -> Project Settings -> General -> "Your apps" -> Web app
// -> paste the generated config object below.
// ---------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBfxyeNE8aeIv0VuJtDaYnQA54MS6JX0F4",
  authDomain: "tennant-app-ee8d1.firebaseapp.com",
  projectId: "tennant-app-ee8d1",
  storageBucket: "tennant-app-ee8d1.firebasestorage.app",
  messagingSenderId: "907886343081",
  appId: "1:907886343081:web:5ff590b6a6e6c790a20ab8",
  measurementId: "G-37QGXSX14R"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Offline persistence — same reasoning as the main site: faster repeat
// loads, and works for a beat even if connectivity drops (useful for a
// mobile-wrapped app on a spotty connection).
db.enablePersistence().catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore persistence disabled: multiple tabs open.");
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence not supported in this browser.");
  }
});

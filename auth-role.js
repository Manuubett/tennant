// ---------------------------------------------------------------------
// auth-role.js
// Figures out whether the signed-in user is a tenant or staff, and
// redirects them to the right dashboard. Include after firebase-config.js.
// ---------------------------------------------------------------------

// Resolves to { role: "tenant"|"staff"|null, profile: {...} }
async function getCurrentUserRole(user) {
  if (!user) return { role: null, profile: null };

  const staffDoc = await db.collection("staff").doc(user.uid).get();
  if (staffDoc.exists) {
    return { role: "staff", profile: staffDoc.data() };
  }

  const tenantDoc = await db.collection("tenants").doc(user.uid).get();
  if (tenantDoc.exists) {
    return { role: "tenant", profile: tenantDoc.data() };
  }

  return { role: null, profile: null };
}

// Call at the top of a page that requires a specific role. Redirects
// away if the user is signed out or has the wrong role.
function requireRole(expectedRole, redirectTo) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const { role } = await getCurrentUserRole(user);
    if (role !== expectedRole) {
      window.location.href = redirectTo || "login.html";
    }
  });
}

// ---------------------------------------------------------------------
// REPLY.JS — click a notification, land directly on what it's about
// ---------------------------------------------------------------------
// Plugs into notifications.js's attachNotificationBell via a single
// global hook: window.onNotificationClick(notifData, notifId). Owns all
// the "what does this notification type mean, where do I navigate"
// logic so dashboard.js / portal.js don't need to know this feature
// exists at all beyond passing relatedId into addNotification().
//
// Works on both pages — it detects which one it's on by checking for
// globals unique to each (see isStaffDashboard() below) — since both
// load this same file.
//
// ASSUMPTION: the tenant portal's section ids (used by
// activatePortalSection below) are assumed to be "overview", "payments",
// "maintenance" based on portal.js's TABS-less nav pattern. If your
// portal.html uses different ids for its .portal-section elements,
// update SECTION_IDS below to match — everything else here is
// independent of the exact ids used.
const SECTION_IDS = {
  payments: "payments",
  maintenance: "maintenance"
};

function isStaffDashboard() {
  // TABS is a dashboard.js-only global; portal.js has no equivalent.
  return typeof TABS !== "undefined";
}

// Polls for an element to exist rather than assuming a fixed render
// delay — dashboard.js's renderTenantProfile() and portal.js's
// loadMaintenance() are both async and don't expose a promise reply.js
// can reliably await, so this is the simplest robust option without
// modifying either file just to add a callback.
function waitForElement(id, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const start = performance.now();
    (function poll() {
      const el = document.getElementById(id);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(poll);
    })();
  });
}

// ---------------------------------------------------------------------
// STAFF DASHBOARD navigation (dashboard.js globals: activeTab,
// viewingTenantId, renderTabs, renderActiveTab, openThread — all
// top-level, not wrapped in an IIFE, so they're directly callable here)
// ---------------------------------------------------------------------
async function goToTenantProfile(tenantId, maintenanceRequestId) {
  if (!tenantId) return;
  activeTab = "tenants";
  viewingTenantId = tenantId;
  renderTabs();
  renderActiveTab(); // not awaited upstream either — see waitForElement below

  if (maintenanceRequestId) {
    const threadContainer = await waitForElement(`thread-${maintenanceRequestId}`);
    if (threadContainer) openThread(maintenanceRequestId);
  }
}

function goToPaymentsTab() {
  activeTab = "payments";
  renderTabs();
  renderActiveTab();
}

// ---------------------------------------------------------------------
// TENANT PORTAL navigation (portal.js's activateSection is private to
// an IIFE, so this reimplements the same few lines rather than exposing
// it — see the SECTION_IDS assumption note above)
// ---------------------------------------------------------------------
function activatePortalSection(sectionId) {
  document.querySelectorAll(".portal-section").forEach((s) => s.classList.toggle("active", s.id === sectionId));
  document.querySelectorAll("#tabs [data-nav-link]").forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${sectionId}`));
  const main = document.querySelector(".main-wrap");
  if (main) main.scrollTo({ top: 0, behavior: "auto" });
}

async function goToMaintenanceThread(maintenanceRequestId) {
  activatePortalSection(SECTION_IDS.maintenance);
  if (!maintenanceRequestId) return;
  const threadContainer = await waitForElement(`thread-${maintenanceRequestId}`);
  if (threadContainer) openThread(maintenanceRequestId); // global in portal.js
}

function goToPaymentHistory() {
  activatePortalSection(SECTION_IDS.payments);
}

// ---------------------------------------------------------------------
// THE HOOK — this is the entire integration surface with notifications.js
// ---------------------------------------------------------------------
window.onNotificationClick = function (notif, notifId) {
  const rel = notif.relatedId || {};

  if (isStaffDashboard()) {
    switch (notif.type) {
      case "payment_submitted":
        goToTenantProfile(rel.tenantId);
        break;
      case "maintenance_submitted":
      case "maintenance_comment":
      case "maintenance_reopened":
        goToTenantProfile(rel.tenantId, rel.maintenanceRequestId);
        break;
      default:
        // Unknown/older notification with no relatedId — leave the
        // panel closed (already done by notifications.js) and do
        // nothing further, rather than guessing at a destination.
        break;
    }
    return;
  }

  // Tenant portal
  switch (notif.type) {
    case "payment_verified":
      goToPaymentHistory();
      break;
    case "maintenance_update":
    case "maintenance_comment":
      goToMaintenanceThread(rel.maintenanceRequestId);
      break;
    default:
      break;
  }
};

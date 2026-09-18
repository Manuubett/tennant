// Shared notification helpers.
// A notification's "audience" is either the string "staff" (any staff member
// can see and dismiss it) or a tenant's uid (only that tenant sees it).
// Requires `db` (Firestore) and `firebase` to already be loaded on the page.
//
// `relatedId` (optional 4th arg to addNotification) carries whatever IDs the
// click-to-navigate feature in reply.js needs — e.g. { tenantId,
// maintenanceRequestId } or { paymentId }. This file doesn't interpret it at
// all; it's just stored and handed back on click via the onNotificationClick
// hook below, so notifications.js stays generic and reply.js owns the
// "what does this notification mean" logic.

function addNotification(audience, type, message, relatedId) {
  return db.collection("notifications").add({
    audience,
    type,
    message,
    relatedId: relatedId || null,
    read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch((err) => console.error("Notification failed to save:", err));
}

// Wires a bell button + dropdown panel to a live query of notifications for
// the given audience. Call once per page after both elements exist in the DOM.
function attachNotificationBell(buttonEl, panelEl, audience) {
  if (!buttonEl || !panelEl) return;

  db.collection("notifications")
    .where("audience", "==", audience)
    .orderBy("createdAt", "desc")
    .limit(20)
    .onSnapshot((snapshot) => {
      const unreadCount = snapshot.docs.filter((d) => !d.data().read).length;

      let badge = buttonEl.querySelector(".bell-badge");
      if (unreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "bell-badge";
          buttonEl.appendChild(badge);
        }
        badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
      } else if (badge) {
        badge.remove();
      }

      // Bug fix: message text was inserted into innerHTML unescaped — a
      // maintenance description or tenant name containing HTML would
      // execute as markup instead of displaying as text. `escapeHTML` is
      // defined globally by dashboard.js/portal.js, both of which load
      // before any notification data can actually arrive (this callback
      // only fires once Firestore responds, well after page scripts have
      // all executed), so it's safe to rely on here despite notifications.js
      // itself loading earlier in the page.
      panelEl.innerHTML = snapshot.empty
        ? `<p class="empty-state">No notifications yet.</p>`
        : snapshot.docs.map((doc) => {
            const n = doc.data();
            const when = n.createdAt
              ? n.createdAt.toDate().toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              : "";
            return `
              <div class="notif-row ${n.read ? "" : "unread"}" data-id="${doc.id}">
                <div class="notif-msg">${escapeHTML(n.message)}</div>
                <div class="notif-time">${when}</div>
              </div>`;
          }).join("");

      panelEl.querySelectorAll(".notif-row").forEach((row) => {
        row.addEventListener("click", () => {
          db.collection("notifications").doc(row.dataset.id).update({ read: true }).catch(() => {});

          // Hand off to reply.js (if loaded) to jump straight into whatever
          // this notification is about. notifications.js doesn't know or
          // care what that means — it just passes the stored doc through.
          const doc = snapshot.docs.find((d) => d.id === row.dataset.id);
          if (doc && typeof window.onNotificationClick === "function") {
            window.onNotificationClick(doc.data(), doc.id);
          }
          panelEl.classList.remove("open");
        });
      });
    }, (err) => {
      console.error("Notifications failed to load:", err);
      panelEl.innerHTML = `<p class="empty-state">Couldn't load notifications.</p>`;
    });
}

// Toggles the dropdown panel open/closed and closes it on an outside click.
function wireNotificationToggle(buttonEl, panelEl) {
  if (!buttonEl || !panelEl) return;
  buttonEl.addEventListener("click", (e) => {
    e.stopPropagation();
    panelEl.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (panelEl.classList.contains("open") && !panelEl.contains(e.target) && e.target !== buttonEl) {
      panelEl.classList.remove("open");
    }
  });
}

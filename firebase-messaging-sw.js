// FCM arka plan bildirim service worker'i.
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAkmaq0nFi4322Qm7DlyFe0_7aNg8Ck4bE",
  authDomain: "kupa26-lig.firebaseapp.com",
  projectId: "kupa26-lig",
  storageBucket: "kupa26-lig.firebasestorage.app",
  messagingSenderId: "638301742002",
  appId: "1:638301742002:web:88e7fda7793c9eb51abaab"
});

const messaging = firebase.messaging();

// mutlak ikon yolu (site /kupa26/ alt yolunda; goreli yol kok'e cozulup 404 olur -> beyaz kare)
const ICON = new URL("icons/icon-192.png", self.registration.scope).href;
const HOME = self.registration.scope;

// SADECE-VERI mesaj geldiginde TEK bildirim goster (cift gosterimi engeller)
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  if (!d.title) return;
  self.registration.showNotification(d.title, {
    body: d.body || "",
    icon: ICON,
    tag: d.tag || undefined
  });
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if (c.url.indexOf(HOME) === 0) return c.focus(); }
      return self.clients.openWindow(HOME);
    })
  );
});

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

// notification yuklu mesajlar tarayici tarafindan otomatik gosterilir;
// bu handler veri-only mesajlar icin yedek.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  if (!n.title) return;
  self.registration.showNotification(n.title, {
    body: n.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: (payload.data && payload.data.tag) || undefined
  });
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow("./");
    })
  );
});

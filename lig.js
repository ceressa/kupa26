// Tahmin ligi: Firebase Firestore + anonim giris.
// Klasik app.js bu modulu window.lig uzerinden kullanir.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, collectionGroup, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

// Firebase Console > Proje Ayarlari > Cloud Messaging > Web Push sertifikalari > Anahtar cifti
const VAPID_KEY = "BCm25YHybc5do9VzgPAa1vKCRz5YNuN_WtxMMOnXZcGxEY4yL7e52WOiBoda3R4enWVbMjtt5xyJBVJrEtI2ZC4";

const firebaseConfig = {
  apiKey: "AIzaSyAkmaq0nFi4322Qm7DlyFe0_7aNg8Ck4bE",
  authDomain: "kupa26-lig.firebaseapp.com",
  projectId: "kupa26-lig",
  storageBucket: "kupa26-lig.firebasestorage.app",
  messagingSenderId: "638301742002",
  appId: "1:638301742002:web:88e7fda7793c9eb51abaab"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let user = null;
const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (u) => { user = u; resolve(u); });
});

async function ensureSignedIn() {
  await authReady;
  if (!user) {
    const cred = await signInAnonymously(auth);
    user = cred.user;
  }
  return user;
}

let messaging = null;

window.lig = {
  myUid() { return user ? user.uid : null; },

  pushAvailable() { return !!VAPID_KEY; },

  // arka plan push'u ac: izin iste, token al, kullanici dokumanina yaz
  async enablePush() {
    if (!VAPID_KEY) throw new Error("no-vapid");
    if (!(await isSupported().catch(() => false))) throw new Error("unsupported");
    const u = await ensureSignedIn();
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error("denied");
    const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    if (!messaging) messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error("no-token");
    await setDoc(doc(db, "users", u.uid), { fcmTokens: arrayUnion(token) }, { merge: true });
    return token;
  },

  // favori takimlar ve bildirim tercihlerini buluta yaz (push yonlendirmesi icin)
  async saveProfile(favs, prefs) {
    const u = await ensureSignedIn();
    await setDoc(doc(db, "users", u.uid), { favs: (favs || []).map(String), notifPrefs: prefs || {} }, { merge: true });
  },

  // takma ad + davet koduyla lige katil. Kod kuralda dogrulanir; yanlissa hata firlatir.
  async join(name, code) {
    const u = await ensureSignedIn();
    try {
      await setDoc(doc(db, "members", u.uid), { code: String(code || ""), t: serverTimestamp() });
    } catch (e) {
      const err = new Error("bad-code");
      err.code = (e && e.code) || "permission-denied";
      throw err;
    }
    await setDoc(doc(db, "users", u.uid), { name: String(name).slice(0, 20) }, { merge: true });
    return u.uid;
  },

  // bu cihaz daha once dogru kodla katildi mi?
  async isMember() {
    const u = await ensureSignedIn();
    try {
      const s = await getDoc(doc(db, "members", u.uid));
      return s.exists();
    } catch { return false; }
  },

  // tahmini buluta yaz; t sunucu damgasi (kurallar zorunlu kiliyor)
  async savePred(matchId, h, a) {
    const u = await ensureSignedIn();
    await setDoc(doc(db, "users", u.uid, "preds", String(matchId)), { h, a, t: serverTimestamp() });
  },

  // turnuva tahmini: key = "group-A".."group-L" -> {first, second} | "champion" -> {team}
  async savePick(key, data) {
    const u = await ensureSignedIn();
    await setDoc(doc(db, "users", u.uid, "picks", String(key)), { ...data, t: serverTimestamp() });
  },

  // tum lig verisi: [{uid, name, preds: {matchId: {h, a, tMillis}}, picks: {key: {..., tMillis}}}]
  async fetchLeague() {
    await ensureSignedIn();
    const [usersSnap, predsSnap, picksSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collectionGroup(db, "preds")),
      getDocs(collectionGroup(db, "picks"))
    ]);
    const byUid = {};
    usersSnap.forEach((d) => { byUid[d.id] = { uid: d.id, name: d.data().name || "?", preds: {}, picks: {} }; });
    predsSnap.forEach((d) => {
      const uid = d.ref.parent.parent.id;
      if (!byUid[uid]) return;
      const v = d.data();
      byUid[uid].preds[d.id] = { h: v.h, a: v.a, tMillis: v.t && v.t.toMillis ? v.t.toMillis() : 0 };
    });
    picksSnap.forEach((d) => {
      const uid = d.ref.parent.parent.id;
      if (!byUid[uid]) return;
      const v = d.data();
      byUid[uid].picks[d.id] = { ...v, tMillis: v.t && v.t.toMillis ? v.t.toMillis() : 0 };
    });
    return Object.values(byUid);
  }
};

window.dispatchEvent(new Event("lig-ready"));

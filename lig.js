// Tahmin ligi: Firebase Firestore + kullanici adi/PIN (custom token) girisi.
// Klasik app.js bu modulu window.lig uzerinden kullanir.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, collection, collectionGroup, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
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
const functions = getFunctions(app, "europe-west1");

let user = null;
const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (u) => { user = u; resolve(u); });
});

// oturum acik mi? (custom token ile giris yapilmis kullanici)
async function currentUser() {
  await authReady;
  // eski sistemden kalan anonim oturumlari temizle (uyelik yok, okuma reddedilir)
  if (user && user.isAnonymous) {
    try { await signOut(auth); } catch {}
    user = null;
  }
  return user;
}
// yazma islemleri icin giris sart; degilse hata
function requireUser() {
  if (!user) throw new Error("not-signed-in");
  return user;
}

let messaging = null;

window.lig = {
  myUid() { return user ? user.uid : null; },
  async ready() { return await currentUser(); },
  async signedIn() { return !!(await currentUser()); },

  // kullanici adi + PIN + davet koduyla giris/kayit. Ayni ad+PIN her cihazda ayni hesap.
  async login(username, pin, code) {
    await authReady;
    let res;
    try {
      res = await httpsCallable(functions, "enterLeague")({ username, pin, code });
    } catch (e) {
      const msg = (e && e.message) || "";
      const err = new Error(/bad-code/.test(msg) ? "bad-code" : (e && e.code) || "error");
      throw err;
    }
    const token = res && res.data && res.data.token;
    if (!token) throw new Error("no-token");
    const cred = await signInWithCustomToken(auth, token);
    user = cred.user;
    return user.uid;
  },

  async logout() {
    try { await signOut(auth); } catch {}
    user = null;
  },

  pushAvailable() { return !!VAPID_KEY; },

  // arka plan push'u ac: izin iste, token al, kullanici dokumanina yaz
  async enablePush() {
    if (!VAPID_KEY) throw new Error("no-vapid");
    if (!(await isSupported().catch(() => false))) throw new Error("unsupported");
    const u = requireUser();
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
    const u = requireUser();
    await setDoc(doc(db, "users", u.uid), { favs: (favs || []).map(String), notifPrefs: prefs || {} }, { merge: true });
  },

  // giris yapan kullanicinin kendi bulut tahminlerini indir (cihaz/oturum degisince geri yukleme)
  async fetchMine() {
    const u = requireUser();
    const [predsSnap, picksSnap] = await Promise.all([
      getDocs(collection(db, "users", u.uid, "preds")),
      getDocs(collection(db, "users", u.uid, "picks"))
    ]);
    const preds = {}, picks = {};
    predsSnap.forEach((d) => { const v = d.data(); preds[d.id] = { h: v.h, a: v.a }; });
    picksSnap.forEach((d) => { const v = d.data(); const o = {}; for (const k of ["first", "second", "team", "r", "ou", "kg", "ht"]) if (v[k] != null) o[k] = v[k]; picks[d.id] = o; });
    return { preds, picks };
  },

  // devre arasi skorlari (ilk yari tahmini puanlamasi icin, fonksiyon yazar)
  async fetchHtScores() {
    await currentUser();
    try {
      const s = await getDoc(doc(db, "public", "htScores"));
      return s.exists() ? (s.data().scores || {}) : {};
    } catch { return {}; }
  },

  // tahmini buluta yaz; t sunucu damgasi (kurallar zorunlu kiliyor)
  async savePred(matchId, h, a) {
    const u = requireUser();
    await setDoc(doc(db, "users", u.uid, "preds", String(matchId)), { h, a, t: serverTimestamp() });
  },

  // turnuva tahmini: key = "group-A".."group-L" -> {first, second} | "champion" -> {team}
  async savePick(key, data) {
    const u = requireUser();
    await setDoc(doc(db, "users", u.uid, "picks", String(key)), { ...data, t: serverTimestamp() });
  },

  // tum lig verisi: [{uid, name, preds: {matchId: {h, a, tMillis}}, picks: {key: {..., tMillis}}}]
  async fetchLeague() {
    requireUser();
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

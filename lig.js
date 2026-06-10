// Tahmin ligi: Firebase Firestore + anonim giris.
// Klasik app.js bu modulu window.lig uzerinden kullanir.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDocs, collection, collectionGroup, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

window.lig = {
  myUid() { return user ? user.uid : null; },

  // takma adla lige katil (ya da adi guncelle)
  async join(name) {
    const u = await ensureSignedIn();
    await setDoc(doc(db, "users", u.uid), { name: String(name).slice(0, 20) }, { merge: true });
    return u.uid;
  },

  // tahmini buluta yaz; t sunucu damgasi (kurallar zorunlu kiliyor)
  async savePred(matchId, h, a) {
    const u = await ensureSignedIn();
    await setDoc(doc(db, "users", u.uid, "preds", String(matchId)), { h, a, t: serverTimestamp() });
  },

  // tum lig verisi: [{uid, name, preds: {matchId: {h, a, tMillis}}}]
  async fetchLeague() {
    await ensureSignedIn();
    const [usersSnap, predsSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collectionGroup(db, "preds"))
    ]);
    const byUid = {};
    usersSnap.forEach((d) => { byUid[d.id] = { uid: d.id, name: d.data().name || "?", preds: {} }; });
    predsSnap.forEach((d) => {
      const uid = d.ref.parent.parent.id;
      if (!byUid[uid]) return;
      const v = d.data();
      byUid[uid].preds[d.id] = { h: v.h, a: v.a, tMillis: v.t && v.t.toMillis ? v.t.toMillis() : 0 };
    });
    return Object.values(byUid);
  }
};

window.dispatchEvent(new Event("lig-ready"));

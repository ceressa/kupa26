"use strict";
// Kupa 26 arka plan bildirim gondericisi.
// Dakikada bir ESPN'i kontrol eder, gol/baslama/bitis/hatirlatma olaylarini
// tespit eder ve ilgili kullanicilara (favori takim + tahmin yaptigi mac) FCM push gonderir.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

function ymd(d) {
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}

async function fetchMatches() {
  const now = new Date();
  const from = new Date(now.getTime() - 86400000);
  const to = new Date(now.getTime() + 86400000);
  const url = `${SCOREBOARD}?dates=${ymd(from)}-${ymd(to)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("ESPN HTTP " + r.status);
  const j = await r.json();
  const out = [];
  for (const ev of j.events || []) {
    const c = ev.competitions && ev.competitions[0];
    if (!c) continue;
    const home = c.competitors.find((x) => x.homeAway === "home") || c.competitors[0];
    const away = c.competitors.find((x) => x.homeAway === "away") || c.competitors[1];
    const st = (ev.status || c.status || {}).type || {};
    out.push({
      id: String(ev.id),
      date: ev.date,
      state: st.state || "pre",
      clock: (ev.status || c.status || {}).displayClock || "",
      homeId: String(home.team.id),
      awayId: String(away.team.id),
      homeName: home.team.displayName || home.team.name || "?",
      awayName: away.team.displayName || away.team.name || "?",
      h: home.score != null ? Number(home.score) : null,
      a: away.score != null ? Number(away.score) : null
    });
  }
  return out;
}

// turkce takim adlari (push metni icin)
const TR = {
  "Mexico": "Meksika", "Czechia": "Çekya", "South Korea": "Güney Kore", "South Africa": "Güney Afrika",
  "Canada": "Kanada", "Bosnia-Herzegovina": "Bosna-Hersek", "Switzerland": "İsviçre", "Qatar": "Katar",
  "Brazil": "Brezilya", "Scotland": "İskoçya", "Morocco": "Fas", "Türkiye": "Türkiye", "Turkey": "Türkiye",
  "Australia": "Avustralya", "United States": "ABD", "Ecuador": "Ekvador", "Germany": "Almanya",
  "Ivory Coast": "Fildişi Sahili", "Netherlands": "Hollanda", "Sweden": "İsveç", "Japan": "Japonya",
  "Tunisia": "Tunus", "Belgium": "Belçika", "Iran": "İran", "Egypt": "Mısır", "New Zealand": "Yeni Zelanda",
  "Spain": "İspanya", "Saudi Arabia": "Suudi Arabistan", "Cape Verde": "Yeşil Burun", "Norway": "Norveç",
  "France": "Fransa", "Iraq": "Irak", "Argentina": "Arjantin", "Austria": "Avusturya", "Algeria": "Cezayir",
  "Jordan": "Ürdün", "Colombia": "Kolombiya", "Portugal": "Portekiz", "Uzbekistan": "Özbekistan",
  "Congo DR": "DR Kongo", "England": "İngiltere", "Croatia": "Hırvatistan", "Ghana": "Gana"
};
const tr = (n) => TR[n] || n;

exports.watchMatches = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", timeoutSeconds: 120, memory: "256MiB", retryCount: 0 },
  async () => {
    let matches;
    try { matches = await fetchMatches(); } catch (e) { console.error("fetch fail", e); return; }
    if (!matches.length) return;

    const stateRef = db.doc("meta/scoreState");
    const snap = await stateRef.get();
    const prev = snap.exists ? (snap.data() || {}) : {};
    const prevScores = prev.scores || {};
    const reminded = prev.reminded || {};

    const now = Date.now();
    const events = [];
    const nextScores = {};

    for (const m of matches) {
      nextScores[m.id] = { h: m.h, a: m.a, st: m.state };
      const p = prevScores[m.id];

      // hatirlatma: baslamaya 20 dk kala, bir kez
      const delta = new Date(m.date).getTime() - now;
      if (m.state === "pre" && !reminded[m.id] && delta > 0 && delta <= 20 * 60 * 1000) {
        events.push({ type: "remind", m });
        reminded[m.id] = 1;
      }
      if (!p) continue;
      if (p.st === "pre" && m.state === "in") events.push({ type: "start", m });
      if (m.state !== "pre" && (Number(m.h) > Number(p.h ?? 0) || Number(m.a) > Number(p.a ?? 0))) {
        events.push({ type: "goal", m, scorer: Number(m.h) > Number(p.h ?? 0) ? m.homeName : m.awayName });
      }
      if (p.st === "in" && m.state === "post") events.push({ type: "end", m });
    }

    if (!events.length) {
      await stateRef.set({ scores: nextScores, reminded, at: FieldValue.serverTimestamp() });
      return;
    }

    // alicilari belirlemek icin kullanicilari ve tahminleri yukle
    const [usersSnap, predsSnap] = await Promise.all([
      db.collection("users").get(),
      db.collectionGroup("preds").get()
    ]);
    const predByUid = {};
    predsSnap.forEach((d) => {
      const uid = d.ref.parent.parent.id;
      (predByUid[uid] = predByUid[uid] || new Set()).add(d.id);
    });
    const users = [];
    usersSnap.forEach((d) => {
      const v = d.data() || {};
      const tokens = Array.isArray(v.fcmTokens) ? v.fcmTokens : [];
      if (!tokens.length) return;
      users.push({
        uid: d.id,
        tokens,
        favs: Array.isArray(v.favs) ? v.favs.map(String) : [],
        prefs: v.notifPrefs || { scope: "favs", goals: true, starts: true, ends: true, reminders: true },
        preds: predByUid[d.id] || new Set()
      });
    });

    const typeKey = { goal: "goals", start: "starts", end: "ends", remind: "reminders" };
    const invalid = new Set();

    for (const ev of events) {
      const { m } = ev;
      const title =
        ev.type === "goal" ? `⚽ GOL! ${tr(ev.scorer)}` :
        ev.type === "start" ? "🟢 Maç başladı" :
        ev.type === "end" ? "🏁 Maç bitti" :
        "🕒 Maç birazdan başlıyor";
      const score = m.h != null ? ` ${m.h}-${m.a}` : "";
      const body =
        ev.type === "remind"
          ? `${tr(m.homeName)} - ${tr(m.awayName)} birazdan başlıyor`
          : `${tr(m.homeName)}${score ? " " + m.h : ""} - ${score ? m.a + " " : ""}${tr(m.awayName)}`.replace(/\s+/g, " ").trim();

      // alicilar: kapsam 'all' ise herkes; 'favs' ise favori takim veya tahmin yapilan mac
      const recipients = [];
      for (const u of users) {
        const pref = u.prefs || {};
        if (pref[typeKey[ev.type]] === false) continue;
        const personal = u.favs.includes(m.homeId) || u.favs.includes(m.awayId) || u.preds.has(m.id);
        if (pref.scope === "all" || personal) recipients.push(u);
      }
      const tokens = [...new Set(recipients.flatMap((u) => u.tokens))];
      if (!tokens.length) continue;

      // FCM 500'luk gruplar
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        try {
          const res = await getMessaging().sendEachForMulticast({
            tokens: batch,
            notification: { title, body },
            webpush: {
              notification: { title, body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: ev.type + "-" + m.id + "-" + score },
              fcmOptions: { link: "./" }
            }
          });
          res.responses.forEach((r, idx) => {
            if (!r.success && r.error) {
              const code = r.error.code || "";
              if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) invalid.add(batch[idx]);
            }
          });
        } catch (e) { console.error("send fail", e); }
      }
    }

    // gecersiz token temizligi
    if (invalid.size) {
      const ops = [];
      for (const u of users) {
        const bad = u.tokens.filter((t) => invalid.has(t));
        if (bad.length) ops.push(db.doc("users/" + u.uid).update({ fcmTokens: FieldValue.arrayRemove(...bad) }));
      }
      await Promise.allSettled(ops);
    }

    await stateRef.set({ scores: nextScores, reminded, at: FieldValue.serverTimestamp() });
    console.log(`events=${events.length} users=${users.length}`);
  }
);

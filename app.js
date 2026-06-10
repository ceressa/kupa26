"use strict";

/* ============ Sabitler ============ */
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const STATS_API = "https://site.web.api.espn.com/apis/common/v3/sports/soccer/fifa.world/statistics/byathlete?region=us&lang=en&limit=100&page=1";
const DATE_CHUNKS = ["20260610-20260624", "20260625-20260708", "20260709-20260720"];

const TR_NAMES = {
  "Mexico": "Meksika", "Czechia": "Çekya", "South Korea": "Güney Kore", "South Africa": "Güney Afrika",
  "Canada": "Kanada", "Bosnia-Herzegovina": "Bosna-Hersek", "Switzerland": "İsviçre", "Qatar": "Katar",
  "Brazil": "Brezilya", "Scotland": "İskoçya", "Haiti": "Haiti", "Morocco": "Fas",
  "Paraguay": "Paraguay", "Türkiye": "Türkiye", "Turkey": "Türkiye", "Australia": "Avustralya", "United States": "ABD",
  "Ecuador": "Ekvador", "Germany": "Almanya", "Ivory Coast": "Fildişi Sahili", "Curaçao": "Curaçao",
  "Netherlands": "Hollanda", "Sweden": "İsveç", "Japan": "Japonya", "Tunisia": "Tunus",
  "Belgium": "Belçika", "Iran": "İran", "Egypt": "Mısır", "New Zealand": "Yeni Zelanda",
  "Spain": "İspanya", "Uruguay": "Uruguay", "Saudi Arabia": "Suudi Arabistan", "Cape Verde": "Yeşil Burun",
  "Norway": "Norveç", "France": "Fransa", "Senegal": "Senegal", "Iraq": "Irak",
  "Argentina": "Arjantin", "Austria": "Avusturya", "Algeria": "Cezayir", "Jordan": "Ürdün",
  "Colombia": "Kolombiya", "Portugal": "Portekiz", "Uzbekistan": "Özbekistan", "Congo DR": "DR Kongo",
  "England": "İngiltere", "Croatia": "Hırvatistan", "Panama": "Panama", "Ghana": "Gana"
};

const ROUNDS = [
  { end: "2026-06-28T06:00Z", key: "group", name: "Grup Aşaması" },
  { end: "2026-07-04T06:00Z", key: "r32", name: "Son 32 Turu" },
  { end: "2026-07-08T06:00Z", key: "r16", name: "Son 16 Turu" },
  { end: "2026-07-13T00:00Z", key: "qf", name: "Çeyrek Final" },
  { end: "2026-07-17T00:00Z", key: "sf", name: "Yarı Final" },
  { end: "2026-07-19T06:00Z", key: "third", name: "Üçüncülük Maçı" },
  { end: "2026-07-31T00:00Z", key: "final", name: "FİNAL" }
];

/* ============ Durum ============ */
const store = {
  get(k, d) { try { const v = localStorage.getItem("wc26." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("wc26." + k, JSON.stringify(v)); } catch {} }
};

const state = {
  tab: "matches",
  matches: [],
  standings: null,
  scorers: null,
  matchesAt: 0,
  standingsAt: 0,
  scorersAt: 0,
  favs: store.get("favs", ["465"]),
  filter: store.get("filter", "all"),
  preds: store.get("preds", {}),
  lig: store.get("lig", null),
  picks: store.get("picks", {}),
  reminded: store.get("reminded", {}),
  league: null,
  leagueAt: 0,
  notif: store.get("notif", { enabled: false, scope: "favs" }),
  theme: store.get("theme", "auto"),
  snapshot: store.get("snapshot", {}),
  teamsCache: store.get("teams", null)
};

const $ = (s) => document.querySelector(s);
const view = $("#view");

/* ============ Yardımcılar ============ */
function trName(team) {
  if (!team) return "?";
  const n = team.displayName || team.name || "?";
  return TR_NAMES[n] || trPlaceholder(n);
}
function trPlaceholder(n) {
  return n
    .replace(/Group ([A-L]) (Winner|winner)/, "$1 Grubu 1.si")
    .replace(/Group ([A-L]) Runner[- ]?up/i, "$1 Grubu 2.si")
    .replace(/Round of 32/gi, "Son 32").replace(/Round of 16/gi, "Son 16")
    .replace(/Quarterfinal/gi, "Çeyrek Final").replace(/Semifinal/gi, "Yarı Final")
    .replace(/\bMatch\b/gi, "Maç").replace(/\bGame\b/gi, "Maç")
    .replace(/(\d+) Winner/g, "$1 Galibi").replace(/(\d+) Loser/g, "$1 Kaybedeni")
    .replace(/Winner/g, "Galibi").replace(/Loser/g, "Kaybedeni")
    .replace(/TBD/g, "Belirlenecek");
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fmtTime(d) { return new Date(d).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); }
function fmtDayHeader(d) {
  return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}
function dayKey(d) { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
function roundOf(dateStr) {
  const t = new Date(dateStr).getTime();
  for (const r of ROUNDS) if (t < new Date(r.end).getTime()) return r;
  return ROUNDS[ROUNDS.length - 1];
}
function isTBD(team) {
  const n = (team && (team.displayName || team.name)) || "";
  return !n || /winner|loser|runner|tbd|group [a-l]/i.test(n);
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

/* Maç verisini normalize et */
function normMatch(ev) {
  const c = ev.competitions && ev.competitions[0];
  if (!c) return null;
  const home = c.competitors.find((x) => x.homeAway === "home") || c.competitors[0];
  const away = c.competitors.find((x) => x.homeAway === "away") || c.competitors[1];
  const st = ev.status || c.status || {};
  return {
    id: ev.id,
    date: ev.date,
    state: st.type ? st.type.state : "pre",          // pre | in | post
    detail: st.type ? (st.type.shortDetail || st.type.detail || "") : "",
    clock: st.displayClock || "",
    home: { id: home.team.id, name: trName(home.team), logo: home.team.logo, score: home.score, winner: !!home.winner, tbd: isTBD(home.team) },
    away: { id: away.team.id, name: trName(away.team), logo: away.team.logo, score: away.score, winner: !!away.winner, tbd: isTBD(away.team) },
    venue: c.venue ? (c.venue.fullName || "") : "",
    city: c.venue && c.venue.address ? [c.venue.address.city, c.venue.address.country].filter(Boolean).join(", ") : "",
    round: roundOf(ev.date)
  };
}

function involvesFav(m) { return state.favs.includes(String(m.home.id)) || state.favs.includes(String(m.away.id)); }

/* ============ Veri yükleme ============ */
async function loadMatches(force) {
  const now = Date.now();
  const live = state.matches.some((m) => m.state === "in");
  const ttl = live ? 30_000 : 240_000;
  if (!force && state.matches.length && now - state.matchesAt < ttl) return;
  const results = await Promise.allSettled(DATE_CHUNKS.map((d) => fetchJSON(`${API}/scoreboard?dates=${d}`)));
  const seen = new Set();
  const all = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const ev of r.value.events || []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      const m = normMatch(ev);
      if (m) all.push(m);
    }
  }
  if (all.length) {
    all.sort((a, b) => new Date(a.date) - new Date(b.date) || a.id - b.id);
    state.matches = all;
    state.matchesAt = now;
    diffAndNotify(all);
    updateLiveBadge();
  }
}

async function loadStandings(force) {
  const now = Date.now();
  if (!force && state.standings && now - state.standingsAt < 180_000) return;
  const j = await fetchJSON(`${API.replace("/site/v2/sports", "/v2/sports")}/standings?season=2026`);
  state.standings = j.children || [];
  state.standingsAt = now;
  // takım listesini ayarlar ekranı için önbelleğe al
  const teams = [];
  for (const g of state.standings) {
    const entries = (g.standings && g.standings.entries) || [];
    for (const e of entries) {
      teams.push({ id: String(e.team.id), name: trName(e.team), logo: (e.team.logos && e.team.logos[0] && e.team.logos[0].href) || "" });
    }
  }
  if (teams.length) { teams.sort((a, b) => a.name.localeCompare(b.name, "tr")); state.teamsCache = teams; store.set("teams", teams); }
}

async function loadScorers(force) {
  const now = Date.now();
  if (!force && state.scorers && now - state.scorersAt < 300_000) return;
  try {
    const j = await fetchJSON(STATS_API);
    state.scorers = parseScorers(j);
  } catch { state.scorers = []; }
  state.scorersAt = now;
}

function parseScorers(j) {
  const rows = [];
  const athletes = j.athletes || (j.statistics && j.statistics.athletes) || [];
  // kategori indeksinden gol/asist sütunlarını bul
  let names = [];
  if (Array.isArray(j.categories)) {
    for (const c of j.categories) if (Array.isArray(c.names)) names = names.concat(c.names);
  }
  for (const a of athletes) {
    const ath = a.athlete || a;
    let values = [];
    if (Array.isArray(a.categories)) for (const c of a.categories) if (Array.isArray(c.values)) values = values.concat(c.values);
    const stats = {};
    names.forEach((n, i) => { stats[n] = values[i]; });
    let goals = stats.totalGoals ?? stats.goals ?? null;
    let assists = stats.goalAssists ?? stats.assists ?? null;
    if (goals === null && Array.isArray(a.stats)) {
      for (const s of a.stats) {
        if (/^(total)?goals$/i.test(s.name || "")) goals = Number(s.value);
        if (/assists/i.test(s.name || "")) assists = Number(s.value);
      }
    }
    if (goals === null || isNaN(Number(goals))) continue;
    rows.push({
      name: ath.displayName || ath.fullName || "?",
      team: trName(ath.team || (ath.teams && ath.teams[0]) || null),
      logo: (ath.team && (ath.team.logo || (ath.team.logos && ath.team.logos[0] && ath.team.logos[0].href))) || "",
      goals: Number(goals),
      assists: assists === null || isNaN(Number(assists)) ? null : Number(assists)
    });
  }
  rows.sort((a, b) => b.goals - a.goals || (b.assists || 0) - (a.assists || 0));
  return rows.filter((r) => r.goals > 0).slice(0, 30);
}

/* ============ Bildirimler ============ */
function diffAndNotify(matches) {
  const snap = state.snapshot;
  const next = {};
  const canNotify = state.notif.enabled && typeof Notification !== "undefined" && Notification.permission === "granted";
  for (const m of matches) {
    next[m.id] = { h: m.home.score, a: m.away.score, st: m.state };
    if (!canNotify) continue;
    if (state.notif.scope === "favs" && !involvesFav(m)) continue;
    const prev = snap[m.id];
    if (!prev) continue;
    const title = `${m.home.name} ${m.home.score ?? ""} - ${m.away.score ?? ""} ${m.away.name}`.replace(/\s+/g, " ");
    if (prev.st === "pre" && m.state === "in") {
      showNotif("🟢 Maç başladı", `${m.home.name} - ${m.away.name}`, "start-" + m.id);
    }
    if (m.state !== "pre" && (Number(m.home.score) > Number(prev.h ?? 0) || Number(m.away.score) > Number(prev.a ?? 0))) {
      const scorerSide = Number(m.home.score) > Number(prev.h ?? 0) ? m.home.name : m.away.name;
      showNotif(`⚽ GOL! ${scorerSide}`, title + (m.clock ? ` (${m.clock})` : ""), "goal-" + m.id + "-" + m.home.score + m.away.score);
    }
    if (prev.st === "in" && m.state === "post") {
      showNotif("🏁 Maç bitti", title, "end-" + m.id);
    }
  }
  state.snapshot = next;
  store.set("snapshot", next);
}

function showNotif(title, body, tag) {
  const opts = { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => { try { new Notification(title, opts); } catch {} });
  } else { try { new Notification(title, opts); } catch {} }
}

function updateLiveBadge() {
  const live = state.matches.some((m) => m.state === "in");
  $("#liveBadge").classList.toggle("hidden", !live);
}

/* ============ Görünümler ============ */
function teamRowHTML(t, extraClass) {
  const cls = ["mc-team", extraClass, t.winner ? "winner" : "", t.tbd ? "tbd" : ""].filter(Boolean).join(" ");
  const img = t.logo && !t.tbd ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : "";
  return `<div class="${cls}">${img}<span class="name">${esc(t.name)}</span></div>`;
}

function matchCardHTML(m) {
  const fav = involvesFav(m);
  const live = m.state === "in";
  let mid;
  if (m.state === "pre") {
    mid = `<div class="mc-time">${fmtTime(m.date)}</div><div class="mc-status">${esc(m.round.key === "group" ? "" : m.round.name)}</div>`;
  } else {
    const statusCls = live ? "live" : "ft";
    const statusTxt = live ? (m.clock || "CANLI") : "MS";
    mid = `<div class="mc-score">${esc(m.home.score ?? "")} - ${esc(m.away.score ?? "")}</div><div class="mc-status ${statusCls}">${esc(statusTxt)}</div>`;
  }
  const p = state.preds[m.id];
  let predHTML = "";
  if (p) {
    const sc = predPoints(m, p);
    const badge = sc === null ? "" : sc === 3 ? ` <b class="pp pp3">+3</b>` : sc === 1 ? ` <b class="pp pp1">+1</b>` : ` <b class="pp pp0">0</b>`;
    predHTML = `<div class="mc-meta">🎯 Tahminin: ${p.h} - ${p.a}${badge}</div>`;
  }
  return `<div class="match-card ${fav ? "fav" : ""} ${live ? "live" : ""}" data-match="${m.id}">
    ${teamRowHTML(m.home, "home")}
    <div class="mc-mid">${mid}</div>
    ${teamRowHTML(m.away, "away")}
    ${predHTML}
  </div>`;
}

function heroHTML(m) {
  const live = m.state === "in";
  let mid, foot;
  if (m.state === "pre") {
    mid = `<div class="hero-vs">${fmtTime(m.date)}</div>`;
    foot = `<div class="hero-countdown" data-countdown="${esc(m.date)}"></div>`;
  } else {
    mid = `<div class="hero-score">${esc(m.home.score ?? "")} - ${esc(m.away.score ?? "")}</div>`;
    foot = `<div class="hero-countdown">${live ? `<b>${esc(m.clock || "CANLI")}</b>` : "Maç sonucu"}</div>`;
  }
  const t = (x) => `<div class="hero-team">${x.logo && !x.tbd ? `<img src="${esc(x.logo)}" alt="">` : ""}<div class="name">${esc(x.name)}</div></div>`;
  return `<div class="hero-card" data-match="${m.id}">
    <div class="hero-label">${live ? "🔴 Canlı: Favori maçın" : "Sıradaki favori maçın"} · ${esc(m.round.name)}</div>
    <div class="hero-teams">${t(m.home)}<div class="hero-mid">${mid}</div>${t(m.away)}</div>
    ${foot}
    ${m.venue ? `<div class="hero-countdown" style="margin-top:4px">${esc(m.venue)}${m.city ? " · " + esc(m.city) : ""}</div>` : ""}
  </div>`;
}

function renderMatches() {
  if (!state.matches.length) { view.innerHTML = loadingHTML(); return; }
  let html = "";
  const now = Date.now();
  const todayK = dayKey(now);

  // filtre çubuğu + tahmin puanı
  const t = predTotals();
  html += `<div class="matches-top">
    <div class="seg filter-seg" id="segFilter">
      <button data-filter="all" class="${state.filter === "all" ? "on" : ""}">Tümü</button>
      <button data-filter="favs" class="${state.filter === "favs" ? "on" : ""}">⭐ Favoriler</button>
      <button data-filter="today" class="${state.filter === "today" ? "on" : ""}">Bugün</button>
    </div>
    ${t.total ? `<button class="pred-chip" id="predChip">🎯 <b>${t.pts}</b> puan<small>${t.played}/${t.total} maç · ${t.exact} tam isabet</small></button>` : ""}
  </div>`;

  // favori hero: canlı favori maç ya da sıradaki favori maç
  if (state.favs.length && state.filter !== "today") {
    const favLive = state.matches.find((m) => m.state === "in" && involvesFav(m));
    const favNext = state.matches.find((m) => m.state === "pre" && involvesFav(m));
    const hero = favLive || favNext;
    if (hero) html += heroHTML(hero);
  }

  let list = state.matches;
  if (state.filter === "favs") list = list.filter(involvesFav);
  else if (state.filter === "today") list = list.filter((m) => dayKey(m.date) === todayK);
  if (!list.length) {
    view.innerHTML = html + emptyHTML("📅", state.filter === "today" ? "Bugün maç yok." : "Favori takımının maçı bulunamadı. Ayarlardan favori ekleyebilirsin.");
    return;
  }

  const live = list.filter((m) => m.state === "in");
  if (live.length) {
    html += `<div class="section-title live-title"><span class="live-dot"></span> Şu an oynanıyor</div>`;
    html += live.map(matchCardHTML).join("");
  }

  // günlere göre grupla; varsayılan kaydırma bugüne
  const byDay = new Map();
  for (const m of list) {
    const k = dayKey(m.date);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(m);
  }
  for (const [k, list] of byDay) {
    const isToday = k === todayK;
    html += `<div class="day-header" id="day-${k}">${fmtDayHeader(list[0].date)}${isToday ? " <small>· Bugün</small>" : ""}</div>`;
    html += list.map(matchCardHTML).join("");
  }
  view.innerHTML = html;
  startCountdowns();

  // ilk açılışta bugüne kaydır
  if (!renderMatches._scrolled) {
    renderMatches._scrolled = true;
    const el = document.getElementById("day-" + todayK);
    if (el && !state.matches.some((m) => m.state === "in" || involvesFav(m))) {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -70);
    }
  }
}

function startCountdowns() {
  clearInterval(startCountdowns._t);
  const tick = () => {
    document.querySelectorAll("[data-countdown]").forEach((el) => {
      const ms = new Date(el.dataset.countdown) - Date.now();
      if (ms <= 0) { el.innerHTML = "<b>Başlamak üzere!</b>"; return; }
      const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      el.innerHTML = "Başlamasına <b>" + (d ? d + "g " : "") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "</b>";
    });
  };
  tick();
  startCountdowns._t = setInterval(tick, 1000);
}

function statVal(entry, ...keys) {
  const stats = entry.stats || [];
  for (const k of keys) {
    const s = stats.find((x) => x.name === k || x.abbreviation === k || x.type === k);
    if (s) return s.displayValue ?? s.value ?? "";
  }
  return "";
}
function statNum(entry, ...keys) {
  const v = parseFloat(statVal(entry, ...keys));
  return isNaN(v) ? 0 : v;
}

/* ============ Tahmin oyunu ============ */
function predPoints(m, p) {
  if (!p || m.state !== "post") return null;
  const h = Number(m.home.score), a = Number(m.away.score);
  if (isNaN(h) || isNaN(a)) return null;
  if (p.h === h && p.a === a) return 3;
  if (Math.sign(p.h - p.a) === Math.sign(h - a)) return 1;
  return 0;
}
function predTotals() {
  let pts = 0, played = 0, exact = 0, total = 0;
  for (const m of state.matches) {
    const p = state.preds[m.id];
    if (!p) continue;
    total++;
    const sc = predPoints(m, p);
    if (sc === null) continue;
    played++;
    pts += sc;
    if (sc === 3) exact++;
  }
  return { pts, played, exact, total };
}

/* lig: bir kullanıcının bulut tahminlerinden puan hesabı.
   Maç başladıktan sonra yazılmış tahminler (sunucu damgasına göre) sayılmaz. */
function predValid(m, p) {
  return !p.tMillis || p.tMillis <= new Date(m.date).getTime();
}
function leagueScore(predsMap) {
  let pts = 0, exact = 0, played = 0, total = 0;
  for (const m of state.matches) {
    const p = predsMap[m.id];
    if (!p || !predValid(m, p)) continue;
    total++;
    const sc = predPoints(m, p);
    if (sc === null) continue;
    played++;
    pts += sc;
    if (sc === 3) exact++;
  }
  return { pts, exact, played, total };
}

async function loadLeague(force) {
  if (!window.lig || !state.lig) return;
  const now = Date.now();
  if (!force && state.league && now - state.leagueAt < 60_000) return;
  state.league = await window.lig.fetchLeague();
  state.leagueAt = now;
}

/* ============ Turnuva tahminleri (grup çıkanları + şampiyon) ============ */
function groupLetterOf(g) { return (g.name || "").replace(/^Group\s+/i, ""); }

function groupLockTime(letter) {
  const g = (state.standings || []).find((x) => groupLetterOf(x) === letter);
  if (!g) return Infinity;
  const ids = new Set(((g.standings && g.standings.entries) || []).map((e) => String(e.team.id)));
  const m = state.matches.find((x) => x.round.key === "group" && (ids.has(String(x.home.id)) || ids.has(String(x.away.id))));
  return m ? new Date(m.date).getTime() : Infinity;
}
function tournamentLockTime() {
  return state.matches.length ? new Date(state.matches[0].date).getTime() : Infinity;
}

// grup bitti mi? bittiyse [1.id, 2.id]
function groupResult(letter) {
  const g = (state.standings || []).find((x) => groupLetterOf(x) === letter);
  const entries = (g && g.standings && g.standings.entries) || [];
  if (entries.length < 2) return null;
  if (!entries.every((e) => statNum(e, "gamesPlayed", "GP") >= 3)) return null;
  return [String(entries[0].team.id), String(entries[1].team.id)];
}
function championResult() {
  const f = state.matches.find((m) => m.round.key === "final");
  if (f && f.state === "post") {
    const w = f.home.winner ? f.home : f.away.winner ? f.away : null;
    if (w && !w.tbd) return String(w.id);
  }
  return null;
}

/* Puanlama: doğru sırada çıkan takım 3p, çıktı ama sıra yanlış 1p, şampiyon 10p.
   Kilit anından sonra (sunucu damgası) yazılmış tahmin sayılmaz. */
function picksScore(picksMap) {
  let pts = 0;
  for (const [key, p] of Object.entries(picksMap || {})) {
    if (key === "champion") {
      if (p.tMillis && p.tMillis > tournamentLockTime()) continue;
      const c = championResult();
      if (c && String(p.team) === c) pts += 10;
    } else if (key.startsWith("group-")) {
      const letter = key.slice(6);
      if (p.tMillis && p.tMillis > groupLockTime(letter)) continue;
      const r = groupResult(letter);
      if (!r) continue;
      if (String(p.first) === r[0]) pts += 3; else if (String(p.first) === r[1]) pts += 1;
      if (String(p.second) === r[1]) pts += 3; else if (String(p.second) === r[0]) pts += 1;
    }
  }
  return pts;
}

function savePickLocalAndCloud(key, data) {
  state.picks[key] = { ...data };
  store.set("picks", state.picks);
  if (state.lig && window.lig) {
    window.lig.savePick(key, data).then(() => { state.leagueAt = 0; }).catch(() => {});
  }
}

function renderGroups() {
  if (!state.standings) { view.innerHTML = loadingHTML(); return; }
  let groups = [...state.standings];
  // favori takımın grubunu öne al
  if (state.favs.length) {
    groups.sort((a, b) => {
      const hasF = (g) => ((g.standings && g.standings.entries) || []).some((e) => state.favs.includes(String(e.team.id)));
      return (hasF(b) ? 1 : 0) - (hasF(a) ? 1 : 0);
    });
  }
  let html = "";
  for (const g of groups) {
    const entries = (g.standings && g.standings.entries) || [];
    const hasFav = entries.some((e) => state.favs.includes(String(e.team.id)));
    let rows = "";
    entries.forEach((e, i) => {
      const fav = state.favs.includes(String(e.team.id));
      const logo = (e.team.logos && e.team.logos[0] && e.team.logos[0].href) || "";
      const qual = i < 2 ? "qual-1" : i === 2 ? "qual-3" : "";
      rows += `<tr class="${fav ? "fav-row" : ""}" data-teampage="${e.team.id}">
        <td class="team-cell"><span class="qual-dot ${qual}"></span>${logo ? `<img src="${esc(logo)}" alt="">` : ""}${esc(trName(e.team))}</td>
        <td>${statVal(e, "gamesPlayed", "GP")}</td>
        <td>${statVal(e, "wins", "W")}</td>
        <td>${statVal(e, "ties", "D")}</td>
        <td>${statVal(e, "losses", "L")}</td>
        <td>${statVal(e, "pointDifferential", "GD")}</td>
        <td class="pts">${statVal(e, "points", "P", "PTS")}</td>
      </tr>`;
    });
    const gname = (g.name || "").replace(/^Group\s+/i, "") + " Grubu";
    html += `<div class="group-card ${hasFav ? "fav" : ""}">
      <div class="group-head">${esc(gname)}</div>
      <table class="standings">
        <thead><tr><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AV</th><th>P</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }
  // üçüncüler sıralaması: 12 grubun 3.lerinden en iyi 8'i tur atlar
  const thirds = [];
  for (const g of state.standings) {
    const entries = (g.standings && g.standings.entries) || [];
    if (entries[2]) thirds.push({ e: entries[2], group: (g.name || "").replace(/^Group\s+/i, "") });
  }
  if (thirds.length) {
    thirds.sort((a, b) =>
      statNum(b.e, "points", "P", "PTS") - statNum(a.e, "points", "P", "PTS") ||
      statNum(b.e, "pointDifferential", "GD") - statNum(a.e, "pointDifferential", "GD") ||
      statNum(b.e, "pointsFor", "GF") - statNum(a.e, "pointsFor", "GF"));
    let trows = "";
    thirds.forEach((x, i) => {
      const fav = state.favs.includes(String(x.e.team.id));
      const logo = (x.e.team.logos && x.e.team.logos[0] && x.e.team.logos[0].href) || "";
      trows += `<tr class="${fav ? "fav-row" : ""}" data-teampage="${x.e.team.id}">
        <td class="team-cell"><span class="qual-dot ${i < 8 ? "qual-1" : ""}"></span>${logo ? `<img src="${esc(logo)}" alt="">` : ""}${esc(trName(x.e.team))} <small class="grp-tag">${esc(x.group)}</small></td>
        <td>${statVal(x.e, "gamesPlayed", "GP")}</td>
        <td>${statVal(x.e, "pointDifferential", "GD")}</td>
        <td>${statVal(x.e, "pointsFor", "GF")}</td>
        <td class="pts">${statVal(x.e, "points", "P", "PTS")}</td>
      </tr>`;
    });
    html += `<div class="group-card">
      <div class="group-head">Üçüncüler Sıralaması <small class="grp-sub">en iyi 8 takım Son 32'ye kalır</small></div>
      <table class="standings">
        <thead><tr><th>Takım</th><th>O</th><th>AV</th><th>AG</th><th>P</th></tr></thead>
        <tbody>${trows}</tbody>
      </table>
    </div>`;
  }
  html += `<div class="legend"><span><span class="qual-dot qual-1"></span>İlk 2: doğrudan tur atlar</span><span><span class="qual-dot qual-3"></span>3.lerin en iyi 8'i tur atlar</span></div>`;
  view.innerHTML = html;
}

function renderBracket() {
  if (!state.matches.length) { view.innerHTML = loadingHTML(); return; }
  const ko = state.matches.filter((m) => m.round.key !== "group");
  if (!ko.length) { view.innerHTML = emptyHTML("🏆", "Eleme turu maçları henüz açıklanmadı. Grup aşaması 27 Haziran'da bitiyor."); return; }
  const order = ["r32", "r16", "qf", "sf", "third", "final"];
  const byRound = new Map();
  for (const m of ko) {
    if (!byRound.has(m.round.key)) byRound.set(m.round.key, []);
    byRound.get(m.round.key).push(m);
  }
  let cols = "";
  for (const key of order) {
    const list = byRound.get(key);
    if (!list) continue;
    const r = ROUNDS.find((x) => x.key === key);
    const cards = list.map((m) => {
      const fav = involvesFav(m);
      const live = m.state === "in";
      const row = (t) => `<div class="bm-row ${t.winner ? "winner" : ""}">
        ${t.logo && !t.tbd ? `<img src="${esc(t.logo)}" alt="">` : ""}
        <span class="name ${t.tbd ? "tbd" : ""}">${esc(t.name)}</span>
        <span class="sc">${m.state === "pre" ? "" : esc(t.score ?? "")}</span>
      </div>`;
      const foot = m.state === "in"
        ? `<span class="live">● ${esc(m.clock || "CANLI")}</span><span>${esc(m.venue)}</span>`
        : `<span>${new Date(m.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${m.state === "pre" ? fmtTime(m.date) : "MS"}</span><span>${esc(m.city.split(",")[0] || "")}</span>`;
      return `<div class="bracket-match ${fav ? "fav" : ""} ${live ? "live" : ""}" data-match="${m.id}">
        ${row(m.home)}${row(m.away)}
        <div class="bm-foot">${foot}</div>
      </div>`;
    }).join("");
    cols += `<div class="round-col"><div class="round-title ${key === "final" ? "final-title" : ""}">${esc(r.name)}</div>${cards}</div>`;
  }
  view.innerHTML = `<div class="bracket-scroll"><div class="bracket">${cols}</div></div>`;
}

function renderScorers() {
  if (state.scorers === null) { view.innerHTML = loadingHTML(); return; }
  if (!state.scorers.length) {
    view.innerHTML = emptyHTML("👟", "Henüz gol atılmadı. İlk goller gelince burada gol krallığı sıralaması görünecek.");
    return;
  }
  let html = `<div class="section-title">Gol Krallığı</div>`;
  state.scorers.forEach((s, i) => {
    html += `<div class="scorer-row">
      <div class="scorer-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
      <div class="scorer-info">
        <div class="scorer-name">${esc(s.name)}</div>
        <div class="scorer-team">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : ""}${esc(s.team)}${s.assists !== null ? ` · ${s.assists} asist` : ""}</div>
      </div>
      <div><div class="scorer-goals">${s.goals}</div><div class="scorer-sub">gol</div></div>
    </div>`;
  });
  view.innerHTML = html;
}

function loadingHTML() { return `<div class="loading"><div class="spinner"></div>Yükleniyor...</div>`; }
function emptyHTML(ico, msg) { return `<div class="empty-state"><div class="big">${ico}</div>${esc(msg)}</div>`; }

function renderLeague() {
  if (!window.lig) {
    view.innerHTML = loadingHTML();
    window.addEventListener("lig-ready", () => { if (state.tab === "league") refreshForTab(); }, { once: true });
    return;
  }
  if (!state.lig) {
    view.innerHTML = `
      <div class="join-card">
        <div class="join-emoji">🏅</div>
        <h2>Tahmin Ligi</h2>
        <p>Takma adınla katıl, tahminlerinle arkadaşlarına karşı yarış. Doğru skor 3 puan, doğru sonuç 1 puan. Başkalarının tahminleri maç başlayana kadar gizli kalır.</p>
        <input id="ligName" type="text" maxlength="20" placeholder="Takma adın (örn. Ufuk)" autocomplete="nickname">
        <button id="ligJoin" class="pred-save">Lige Katıl</button>
        <div class="pred-note" id="ligErr"></div>
      </div>`;
    return;
  }
  if (!state.league) { view.innerHTML = loadingHTML(); return; }

  const me = window.lig.myUid();
  const rows = state.league
    .map((u) => {
      const score = leagueScore(u.preds);
      const tour = picksScore(u.picks);
      return { ...u, score, tour, grand: score.pts + tour };
    })
    .sort((a, b) => b.grand - a.grand || b.score.exact - a.score.exact || b.score.total - a.score.total);

  let html = `
    <button class="picks-cta" id="openPicks">🏆 Turnuva Tahminlerin<small>Grup çıkanları ve şampiyonu seç · gruplar başlamadan kilitlenir</small></button>
    <div class="section-title">🏅 Tahmin Ligi · ${rows.length} oyuncu</div>`;
  rows.forEach((u, i) => {
    const mine = u.uid === me;
    html += `<div class="scorer-row league-row ${mine ? "me" : ""}" data-liguser="${esc(u.uid)}">
      <div class="scorer-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
      <div class="scorer-info">
        <div class="scorer-name">${esc(u.name)}${mine ? ' <span class="me-tag">sen</span>' : ""}</div>
        <div class="scorer-team">maç ${u.score.pts} · turnuva ${u.tour} · ${u.score.exact} tam isabet</div>
      </div>
      <div><div class="scorer-goals">${u.grand}</div><div class="scorer-sub">puan</div></div>
    </div>`;
  });
  html += `<div class="attribution">Adını değiştirmek için tekrar katıl: <button class="link-btn" id="ligRename">takma adı değiştir</button></div>`;
  view.innerHTML = html;
}

function render() {
  if (state.tab === "matches") renderMatches();
  else if (state.tab === "groups") renderGroups();
  else if (state.tab === "bracket") renderBracket();
  else if (state.tab === "scorers") renderScorers();
  else if (state.tab === "league") renderLeague();
}

/* ============ Maç detayı ============ */
async function openMatch(id, silent) {
  if (!silent) openSheet(loadingHTML());
  openMatch._id = id;
  let j;
  try { j = await fetchJSON(`${API}/summary?event=${id}`); }
  catch { if (!silent) $("#sheetContent").innerHTML = emptyHTML("⚠️", "Maç detayı yüklenemedi."); return; }
  if (openMatch._id !== id || $("#sheetOverlay").classList.contains("hidden")) return;

  const m = state.matches.find((x) => x.id === String(id)) || state.matches.find((x) => x.id === id);
  const comp = j.header && j.header.competitions && j.header.competitions[0];
  let html = "";

  if (comp) {
    const home = comp.competitors.find((x) => x.homeAway === "home") || comp.competitors[0];
    const away = comp.competitors.find((x) => x.homeAway === "away") || comp.competitors[1];
    const st = comp.status || {};
    const live = st.type && st.type.state === "in";
    const pre = st.type && st.type.state === "pre";
    const teamHTML = (t) => `<div class="md-team">${t.team.logos && t.team.logos[0] ? `<img src="${esc(t.team.logos[0].href)}" alt="">` : ""}<div class="name">${esc(trName(t.team))}</div></div>`;
    const mid = pre
      ? `<div class="md-score" style="font-size:22px">${fmtTime(comp.date)}</div>`
      : `<div class="md-score">${esc(home.score ?? "")} - ${esc(away.score ?? "")}</div>`;
    const statusTxt = live ? (st.displayClock || "CANLI") : pre ? new Date(comp.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }) : "Maç Sonu";
    const venue = j.gameInfo && j.gameInfo.venue;
    html += `<div class="md-header">
      <div class="md-round">${esc((m ? m.round.name : ""))}</div>
      <div class="md-teams">${teamHTML(home)}<div>${mid}</div>${teamHTML(away)}</div>
      <div class="md-status ${live ? "live" : ""}">${esc(statusTxt)}</div>
      ${venue ? `<div class="md-venue">${esc(venue.fullName || "")}${venue.address ? " · " + esc([venue.address.city, venue.address.country].filter(Boolean).join(", ")) : ""}</div>` : ""}
    </div>`;

    // tahmin: maç başlamadıysa düzenlenebilir, sonrasında sonuç gösterimi
    const myPred = state.preds[id];
    if (pre) {
      html += `<div class="md-section">
        <h3>🎯 Skor Tahminin</h3>
        <div class="pred-inputs">
          <span class="pred-team">${esc(trName(home.team))}</span>
          <input id="predH" type="number" min="0" max="20" inputmode="numeric" value="${myPred ? myPred.h : ""}" placeholder="-">
          <span class="pred-dash">:</span>
          <input id="predA" type="number" min="0" max="20" inputmode="numeric" value="${myPred ? myPred.a : ""}" placeholder="-">
          <span class="pred-team">${esc(trName(away.team))}</span>
        </div>
        <button id="predSave" class="pred-save" data-pred-match="${esc(String(id))}">${myPred ? "Tahmini Güncelle" : "Tahmini Kaydet"}</button>
        <div class="pred-note">Doğru skor 3 puan · doğru sonuç 1 puan</div>
      </div>`;
    } else if (myPred) {
      const mm = state.matches.find((x) => String(x.id) === String(id));
      const sc = mm ? predPoints(mm, myPred) : null;
      const badge = sc === null ? "" : sc === 3 ? ` · <b class="pp pp3">+3 puan (tam isabet!)</b>` : sc === 1 ? ` · <b class="pp pp1">+1 puan</b>` : ` · <b class="pp pp0">0 puan</b>`;
      html += `<div class="md-section"><h3>🎯 Tahminin</h3><div class="pred-result">${myPred.h} - ${myPred.a}${badge}</div></div>`;
    }

    // olaylar: goller ve kartlar
    const details = (comp.details || []).filter((d) => d.scoringPlay || d.redCard || d.yellowCard);
    if (details.length) {
      html += `<div class="md-section"><h3>Önemli Olaylar</h3>`;
      for (const d of details) {
        const isHome = d.team && String(d.team.id) === String(home.team.id);
        const who = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || "";
        let ico = "⚽", label = "";
        if (d.redCard) { ico = "🟥"; label = "Kırmızı kart"; }
        else if (d.yellowCard) { ico = "🟨"; label = "Sarı kart"; }
        else if (d.ownGoal) { ico = "⚽"; label = "Kendi kalesine"; }
        else if (d.penaltyKick) { ico = "⚽"; label = "Penaltı"; }
        html += `<div class="event-row ${isHome ? "" : "away"}">
          <span class="min">${esc(d.clock ? d.clock.displayValue : "")}</span>
          <span class="ico">${ico}</span>
          <span class="who">${esc(who)}${label ? `<small>${label}</small>` : ""}</span>
        </div>`;
      }
      html += `</div>`;
    }

    // istatistikler
    const teams = (j.boxscore && j.boxscore.teams) || [];
    if (teams.length === 2 && teams[0].statistics && teams[0].statistics.length) {
      const hStats = teams.find((t) => String(t.team.id) === String(home.team.id)) || teams[0];
      const aStats = teams.find((t) => String(t.team.id) === String(away.team.id)) || teams[1];
      const labels = {
        possessionPct: "Topa Sahip Olma %", totalShots: "Toplam Şut", shotsOnTarget: "İsabetli Şut",
        wonCorners: "Korner", foulsCommitted: "Faul", totalPasses: "Pas", saves: "Kurtarış", offsides: "Ofsayt"
      };
      let stats = "";
      for (const key of Object.keys(labels)) {
        const hs = (hStats.statistics || []).find((s) => s.name === key);
        const as = (aStats.statistics || []).find((s) => s.name === key);
        if (!hs && !as) continue;
        const hv = parseFloat(hs ? hs.displayValue : 0) || 0;
        const av = parseFloat(as ? as.displayValue : 0) || 0;
        const tot = hv + av || 1;
        stats += `<div class="stat-row">
          <div class="stat-nums"><span>${esc(hs ? hs.displayValue : "0")}</span><span class="lbl">${labels[key]}</span><span>${esc(as ? as.displayValue : "0")}</span></div>
          <div class="stat-bar"><div class="h" style="width:${(hv / tot) * 100}%"></div><div class="a" style="width:${(av / tot) * 100}%"></div></div>
        </div>`;
      }
      if (stats) html += `<div class="md-section"><h3>İstatistikler</h3>${stats}</div>`;
    }

    // kadrolar
    const rosters = j.rosters || [];
    if (rosters.length === 2 && rosters.some((r) => (r.roster || []).length)) {
      const colHTML = (r) => {
        const team = r.team || {};
        const starters = (r.roster || []).filter((p) => p.starter);
        const subs = (r.roster || []).filter((p) => !p.starter && (p.subbedIn || p.formationPlace === "0" ? true : false));
        const pRow = (p) => `<div class="player-row"><span class="jersey">${esc(p.jersey || "")}</span><span class="pname">${esc(p.athlete ? p.athlete.displayName : "")}${p.subbedIn ? " 🔁" : ""}</span></div>`;
        return `<div class="lineup-col">
          <h4>${team.logo ? `<img src="${esc(team.logo)}" alt="">` : ""}${esc(trName(team))} ${r.formation ? `<span class="formation">${esc(r.formation)}</span>` : ""}</h4>
          ${starters.map(pRow).join("")}
          ${subs.length ? `<div class="subs-title">Oyuna girenler</div>` + subs.map(pRow).join("") : ""}
        </div>`;
      };
      if (rosters[0].roster && rosters[0].roster.some((p) => p.starter)) {
        html += `<div class="md-section"><h3>Kadrolar</h3><div class="lineup-cols">${rosters.map(colHTML).join("")}</div></div>`;
      }
    }
  }

  if (!html) html = emptyHTML("📋", "Bu maç için detay henüz yayınlanmadı.");
  const sc = $("#sheetContent");
  const st = comp && comp.status && comp.status.type ? comp.status.type.state : "post";
  const startingSoon = st === "pre" && comp && new Date(comp.date) - Date.now() < 10 * 60 * 1000;
  const typing = sc.contains(document.activeElement) && document.activeElement.tagName === "INPUT";

  if (!(silent && typing)) {
    const scrollY = sc.scrollTop;
    sc.innerHTML = html;
    sc.scrollTop = scrollY;
    sc.onclick = (e) => {
      const save = e.target.closest("#predSave");
      if (save) {
        const h = parseInt($("#predH").value, 10), a = parseInt($("#predA").value, 10);
        if (isNaN(h) || isNaN(a) || h < 0 || a < 0 || h > 20 || a > 20) { save.textContent = "Geçerli skor gir"; return; }
        state.preds[save.dataset.predMatch] = { h, a };
        store.set("preds", state.preds);
        save.textContent = "Kaydedildi ✓";
        if (state.lig && window.lig) {
          window.lig.savePred(save.dataset.predMatch, h, a)
            .then(() => { state.leagueAt = 0; })
            .catch(() => { save.textContent = "Kaydedildi (lige gönderilemedi)"; });
        }
        if (state.tab === "matches") render();
      }
    };
  }

  // canlı maçta açık kalan detay ekranını yenile
  clearTimeout(openMatch._timer);
  if (st === "in" || startingSoon) {
    openMatch._timer = setTimeout(() => openMatch(id, true), 30_000);
  }
}

/* ============ Takım sayfası ============ */
function openTeam(teamId) {
  teamId = String(teamId);
  const tinfo = (state.teamsCache || []).find((t) => t.id === teamId);
  const matches = state.matches.filter((m) => String(m.home.id) === teamId || String(m.away.id) === teamId);

  // takımın grubu
  let groupHTML = "", groupName = "";
  for (const g of state.standings || []) {
    const entries = (g.standings && g.standings.entries) || [];
    if (!entries.some((e) => String(e.team.id) === teamId)) continue;
    groupName = (g.name || "").replace(/^Group\s+/i, "") + " Grubu";
    let rows = "";
    entries.forEach((e, i) => {
      const me = String(e.team.id) === teamId;
      const logo = (e.team.logos && e.team.logos[0] && e.team.logos[0].href) || "";
      rows += `<tr class="${me ? "fav-row" : ""}">
        <td class="team-cell"><span class="qual-dot ${i < 2 ? "qual-1" : i === 2 ? "qual-3" : ""}"></span>${logo ? `<img src="${esc(logo)}" alt="">` : ""}${esc(trName(e.team))}</td>
        <td>${statVal(e, "gamesPlayed", "GP")}</td>
        <td>${statVal(e, "wins", "W")}</td>
        <td>${statVal(e, "ties", "D")}</td>
        <td>${statVal(e, "losses", "L")}</td>
        <td>${statVal(e, "pointDifferential", "GD")}</td>
        <td class="pts">${statVal(e, "points", "P", "PTS")}</td>
      </tr>`;
    });
    groupHTML = `<div class="md-section" style="padding:0;overflow:hidden">
      <table class="standings">
        <thead><tr><th>Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AV</th><th>P</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    break;
  }

  const name = tinfo ? tinfo.name : (matches[0] ? (String(matches[0].home.id) === teamId ? matches[0].home.name : matches[0].away.name) : "Takım");
  const logo = tinfo ? tinfo.logo : "";
  const isFav = state.favs.includes(teamId);

  const html = `
    <div class="md-header">
      ${logo ? `<img src="${esc(logo)}" alt="" style="width:56px;height:56px;object-fit:contain">` : ""}
      <div style="font-size:21px;font-weight:800;margin-top:6px">${esc(name)}</div>
      ${groupName ? `<div class="md-venue">${esc(groupName)}</div>` : ""}
      <button class="pred-save" id="favToggle" data-fav-team="${esc(teamId)}" style="margin-top:10px">${isFav ? "⭐ Favorilerden çıkar" : "☆ Favorilere ekle"}</button>
    </div>
    ${groupHTML}
    <div class="section-title">Maçları</div>
    ${matches.map(matchCardHTML).join("") || emptyHTML("📅", "Maç bulunamadı.")}`;
  openSheet(html);

  $("#sheetContent").onclick = (e) => {
    const ft = e.target.closest("#favToggle");
    if (ft) {
      const id = ft.dataset.favTeam;
      if (state.favs.includes(id)) state.favs = state.favs.filter((x) => x !== id);
      else state.favs.push(id);
      store.set("favs", state.favs);
      ft.textContent = state.favs.includes(id) ? "⭐ Favorilerden çıkar" : "☆ Favorilere ekle";
      render();
      return;
    }
    const card = e.target.closest("[data-match]");
    if (card) openMatch(card.dataset.match);
  };
}

/* ============ Turnuva tahminleri ekranı ============ */
async function openPicks() {
  openSheet(loadingHTML());
  if (!state.standings) { try { await loadStandings(); } catch {} }
  if (!state.standings) { $("#sheetContent").innerHTML = emptyHTML("⚠️", "Gruplar yüklenemedi."); return; }
  renderPicksSheet();
}

function pickChipHTML(team, slot, locked, resultMark) {
  const badge = slot === 1 ? `<b class="slot-badge s1">1.</b>` : slot === 2 ? `<b class="slot-badge s2">2.</b>` : "";
  return `<button class="team-chip pick-chip ${slot ? "on" : ""} ${locked ? "locked" : ""} ${resultMark || ""}" ${locked ? "disabled" : ""} data-pick-team="${esc(team.id)}">
    ${team.logo ? `<img src="${esc(team.logo)}" alt="">` : ""}<span>${esc(team.name)}</span>${badge}
  </button>`;
}

function renderPicksSheet() {
  const now = Date.now();
  let html = `<div class="set-title">🏆 Turnuva Tahminlerin</div>
    <div class="pred-note" style="margin:0 0 14px">Doğru sırada çıkan takım 3p · çıktı ama sıra yanlış 1p · şampiyon 10p.<br>Her grubun tahmini, grubun ilk maçıyla kilitlenir.</div>`;

  // şampiyon
  const champLocked = now >= tournamentLockTime();
  const champPick = state.picks["champion"];
  const champResult = championResult();
  html += `<div class="md-section"><h3>👑 Şampiyon (10 puan)${champLocked ? " · 🔒 kilitli" : ""}</h3><div class="team-grid" data-pick-section="champion">`;
  for (const t of state.teamsCache || []) {
    const slot = champPick && String(champPick.team) === t.id ? 1 : 0;
    let mark = "";
    if (champResult && slot) mark = champResult === t.id ? "hit" : "miss";
    html += pickChipHTML(t, slot ? 1 : 0, champLocked, mark).replace('class="slot-badge s1">1.', 'class="slot-badge s1">👑');
  }
  html += `</div></div>`;

  // gruplar
  for (const g of state.standings) {
    const letter = groupLetterOf(g);
    const key = "group-" + letter;
    const entries = (g.standings && g.standings.entries) || [];
    const locked = now >= groupLockTime(letter);
    const p = state.picks[key] || {};
    const r = groupResult(letter);
    let pts = null;
    if (r && (p.first || p.second)) {
      pts = 0;
      if (String(p.first) === r[0]) pts += 3; else if (String(p.first) === r[1]) pts += 1;
      if (String(p.second) === r[1]) pts += 3; else if (String(p.second) === r[0]) pts += 1;
    }
    html += `<div class="md-section"><h3>${esc(letter)} Grubu${locked ? " · 🔒" : ""}${pts !== null ? ` · <b class="pp ${pts >= 4 ? "pp3" : pts > 0 ? "pp1" : "pp0"}">+${pts}</b>` : ""}</h3>
      <div class="team-grid pick-grid" data-pick-section="${esc(key)}">`;
    for (const e of entries) {
      const id = String(e.team.id);
      const team = { id, name: trName(e.team), logo: (e.team.logos && e.team.logos[0] && e.team.logos[0].href) || "" };
      const slot = String(p.first) === id ? 1 : String(p.second) === id ? 2 : 0;
      let mark = "";
      if (r && slot) mark = (slot === 1 && id === r[0]) || (slot === 2 && id === r[1]) ? "hit" : r.includes(id) ? "half" : "miss";
      html += pickChipHTML(team, slot, locked, mark);
    }
    html += `</div></div>`;
  }
  html += `<div class="pred-note">Seçimler anında kaydedilir${state.lig ? " ve lige gönderilir" : ""}.</div>`;

  const sc = $("#sheetContent");
  const scrollY = sc.scrollTop;
  sc.innerHTML = html;
  sc.scrollTop = scrollY;
  sc.onclick = (e) => {
    const chip = e.target.closest("[data-pick-team]");
    if (!chip || chip.disabled) return;
    const section = chip.closest("[data-pick-section]").dataset.pickSection;
    const id = chip.dataset.pickTeam;
    if (section === "champion") {
      const cur = state.picks["champion"];
      savePickLocalAndCloud("champion", cur && String(cur.team) === id ? { team: null } : { team: id });
    } else {
      const p = { ...(state.picks[section] || {}) };
      if (String(p.first) === id) { p.first = p.second || null; p.second = null; }
      else if (String(p.second) === id) { p.second = null; }
      else if (!p.first) { p.first = id; }
      else if (!p.second) { p.second = id; }
      else { p.second = id; }
      savePickLocalAndCloud(section, { first: p.first || null, second: p.second || null });
    }
    renderPicksSheet();
  };
}

/* ============ Tahmin listesi ============ */
function openPredictions() {
  const t = predTotals();
  const rows = state.matches
    .filter((m) => state.preds[m.id])
    .map((m) => {
      const p = state.preds[m.id];
      const sc = predPoints(m, p);
      const badge = sc === null ? `<span class="pp ppwait">bekliyor</span>` : sc === 3 ? `<span class="pp pp3">+3</span>` : sc === 1 ? `<span class="pp pp1">+1</span>` : `<span class="pp pp0">0</span>`;
      const actual = m.state === "pre" ? fmtTime(m.date) : `${m.home.score ?? ""} - ${m.away.score ?? ""}`;
      return `<div class="pred-row" data-match="${m.id}">
        <div class="pred-row-teams">${esc(m.home.name)} - ${esc(m.away.name)}<small>${new Date(m.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · Sonuç: ${esc(actual)}</small></div>
        <div class="pred-row-val">${p.h} - ${p.a}</div>
        ${badge}
      </div>`;
    }).join("");
  const html = `
    <div class="set-title">🎯 Tahminlerin</div>
    <div class="pred-summary">
      <div><b>${t.pts}</b><small>puan</small></div>
      <div><b>${t.exact}</b><small>tam isabet</small></div>
      <div><b>${t.played}/${t.total}</b><small>sonuçlanan</small></div>
    </div>
    ${rows || emptyHTML("🎯", "Henüz tahmin yapmadın. Başlamamış bir maçı açıp skor tahmini gir.")}`;
  openSheet(html);
  $("#sheetContent").onclick = (e) => {
    const card = e.target.closest("[data-match]");
    if (card) openMatch(card.dataset.match);
  };
}

/* ============ Ayarlar ============ */
function renderSettings() {
  const teams = state.teamsCache || [];
  const chips = teams.map((t) =>
    `<button class="team-chip ${state.favs.includes(t.id) ? "on" : ""}" data-team="${t.id}">
      ${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ""}<span>${esc(t.name)}</span>
    </button>`).join("");

  const notifSupported = "Notification" in window;
  const perm = notifSupported ? Notification.permission : "denied";

  const html = `
    <div class="set-title">Ayarlar</div>
    <div class="set-section">
      <h3>Favori Takımlar</h3>
      <div class="team-grid">${chips || '<div class="empty-state">Takım listesi için önce Gruplar sekmesini aç.</div>'}</div>
    </div>
    <div class="set-section">
      <h3>Bildirimler</h3>
      <div class="toggle-row">
        <div>Maç bildirimleri<small>Gol, maç başlangıcı ve sonucu</small></div>
        <div class="switch ${state.notif.enabled && perm === "granted" ? "on" : ""}" id="swNotif"></div>
      </div>
      <div class="seg" id="segScope">
        <button data-scope="favs" class="${state.notif.scope === "favs" ? "on" : ""}">Sadece favoriler</button>
        <button data-scope="all" class="${state.notif.scope === "all" ? "on" : ""}">Tüm maçlar</button>
      </div>
      ${perm === "denied" && notifSupported ? `<div class="notif-warn">⚠️ Bildirim izni engellenmiş. Tarayıcı/site ayarlarından izin vermen gerekiyor.</div>` : ""}
      <div class="notif-warn">📱 iPhone'da bildirim için: Safari'de <b>Paylaş → Ana Ekrana Ekle</b> ile kur, uygulamayı oradan aç. Bildirimler uygulama açıkken gelir (iOS 16.4+).</div>
    </div>
    <div class="set-section">
      <h3>Görünüm</h3>
      <div class="seg" id="segTheme">
        <button data-theme="auto" class="${state.theme === "auto" ? "on" : ""}">Otomatik</button>
        <button data-theme="dark" class="${state.theme === "dark" ? "on" : ""}">Koyu</button>
        <button data-theme="light" class="${state.theme === "light" ? "on" : ""}">Açık</button>
      </div>
    </div>
    <div class="attribution">Veri: ESPN (resmi olmayan halka açık API)<br>Kupa26 · kişisel kullanım için</div>`;
  openSheet(html);

  $("#sheetContent").onclick = async (e) => {
    const chip = e.target.closest(".team-chip");
    if (chip) {
      const id = chip.dataset.team;
      if (state.favs.includes(id)) state.favs = state.favs.filter((x) => x !== id);
      else state.favs.push(id);
      store.set("favs", state.favs);
      chip.classList.toggle("on");
      render();
      return;
    }
    if (e.target.closest("#swNotif")) {
      const sw = e.target.closest("#swNotif");
      if (!("Notification" in window)) { alert("Bu tarayıcı bildirim desteklemiyor."); return; }
      if (!state.notif.enabled || Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        state.notif.enabled = p === "granted";
        if (p === "granted") showNotif("🔔 Bildirimler açık", "Gol ve maç bildirimleri buradan gelecek.", "test");
      } else {
        state.notif.enabled = false;
      }
      store.set("notif", state.notif);
      sw.classList.toggle("on", state.notif.enabled && Notification.permission === "granted");
      return;
    }
    const scopeBtn = e.target.closest("#segScope button");
    if (scopeBtn) {
      state.notif.scope = scopeBtn.dataset.scope;
      store.set("notif", state.notif);
      document.querySelectorAll("#segScope button").forEach((b) => b.classList.toggle("on", b === scopeBtn));
      return;
    }
    const themeBtn = e.target.closest("#segTheme button");
    if (themeBtn) {
      state.theme = themeBtn.dataset.theme;
      store.set("theme", state.theme);
      applyTheme();
      document.querySelectorAll("#segTheme button").forEach((b) => b.classList.toggle("on", b === themeBtn));
    }
  };
}

function applyTheme() {
  const t = state.theme === "auto"
    ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : state.theme;
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === "light" ? "#f2f5fa" : "#0a1628";
}

/* ============ Sheet ============ */
function openSheet(html) {
  clearTimeout(openMatch._timer);
  $("#sheetContent").onclick = null;
  $("#sheetContent").innerHTML = html;
  $("#sheetOverlay").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  clearTimeout(openMatch._timer);
  openMatch._id = null;
  $("#sheetOverlay").classList.add("hidden");
  document.body.style.overflow = "";
}

/* ============ Olaylar ============ */
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    state.tab = b.dataset.tab;
    render();
    refreshForTab();
  });
});

view.addEventListener("click", (e) => {
  const fbtn = e.target.closest("#segFilter button");
  if (fbtn) {
    state.filter = fbtn.dataset.filter;
    store.set("filter", state.filter);
    renderMatches._scrolled = true;
    render();
    return;
  }
  if (e.target.closest("#predChip")) { openPredictions(); return; }
  if (e.target.closest("#ligJoin")) { joinLeague(); return; }
  if (e.target.closest("#ligRename")) { state.lig = null; render(); return; }
  if (e.target.closest("#openPicks")) { openPicks(); return; }
  const lrow = e.target.closest("[data-liguser]");
  if (lrow) { openLeagueUser(lrow.dataset.liguser); return; }
  const trow = e.target.closest("[data-teampage]");
  if (trow) { openTeam(trow.dataset.teampage); return; }
  const card = e.target.closest("[data-match]");
  if (card) openMatch(card.dataset.match);
});

async function joinWithName(name) {
  await window.lig.join(name);
  state.lig = { name };
  store.set("lig", state.lig);
  // mevcut yerel tahminleri buluta taşı (başlamamış maçlar geçerli sayılır)
  for (const [mid, p] of Object.entries(state.preds)) {
    try { await window.lig.savePred(mid, p.h, p.a); } catch {}
  }
  for (const [key, p] of Object.entries(state.picks)) {
    try { await window.lig.savePick(key, { ...p }); } catch {}
  }
}

async function joinLeague() {
  const input = $("#ligName");
  const err = $("#ligErr");
  const name = (input.value || "").trim();
  if (name.length < 2) { err.textContent = "En az 2 karakterlik bir ad gir."; return; }
  const btn = $("#ligJoin");
  btn.textContent = "Katılıyor...";
  try {
    await joinWithName(name);
    await loadLeague(true);
    render();
  } catch (ex) {
    btn.textContent = "Lige Katıl";
    err.textContent = "Bağlanılamadı, tekrar dene. (" + (ex && ex.code ? ex.code : "ağ hatası") + ")";
  }
}

/* ============ İlk açılış karşılaması ============ */
function maybeOnboard() {
  if (store.get("onboarded", false) || state.lig) return;
  const ob = document.createElement("div");
  ob.id = "onboard";
  ob.innerHTML = `
    <div class="ob-card">
      <div class="ob-ball">⚽</div>
      <h1>Kupa<b>26</b>'ya hoş geldin!</h1>
      <p class="ob-sub">2026 Dünya Kupası başlıyor. Canlı skorlar, fikstür, puan durumları ve arkadaşlarınla tahmin ligi seni bekliyor.</p>
      <ul class="ob-feats">
        <li>🎯 Maçlara skor tahmini gir, puan topla</li>
        <li>🏆 Şampiyonu ve gruplardan çıkacakları seç</li>
        <li>🏅 Liderlik tablosunda arkadaşlarınla yarış</li>
        <li>🔔 Gol ve maç bildirimleri al</li>
      </ul>
      <input id="obName" type="text" maxlength="20" placeholder="Takma adın (ligde görünecek)" autocomplete="nickname">
      <button id="obJoin" class="pred-save">Başla 🚀</button>
      <div class="pred-note" id="obErr"></div>
      <button class="link-btn ob-skip" id="obSkip">Şimdilik atla, sadece skorları izleyeceğim</button>
    </div>`;
  document.body.appendChild(ob);

  ob.addEventListener("click", async (e) => {
    if (e.target.closest("#obSkip")) {
      store.set("onboarded", true);
      ob.remove();
      return;
    }
    if (!e.target.closest("#obJoin")) return;
    const name = ($("#obName").value || "").trim();
    const err = $("#obErr");
    if (name.length < 2) { err.textContent = "En az 2 karakterlik bir ad gir."; return; }
    const btn = $("#obJoin");
    btn.textContent = "Katılıyor...";
    try {
      if (!window.lig) await new Promise((r) => window.addEventListener("lig-ready", r, { once: true }));
      await joinWithName(name);
      store.set("onboarded", true);
      ob.remove();
      loadLeague(true).then(() => { if (state.tab === "league") render(); }).catch(() => {});
      // ilk iş: turnuva tahminlerini önüne aç
      openPicks();
    } catch (ex) {
      btn.textContent = "Başla 🚀";
      err.textContent = "Bağlanılamadı, tekrar dene. (" + (ex && ex.code ? ex.code : "ağ hatası") + ")";
    }
  });
}

function openLeagueUser(uid) {
  const u = (state.league || []).find((x) => x.uid === uid);
  if (!u) return;
  const mine = uid === window.lig.myUid();
  const now = Date.now();
  const rows = state.matches
    .filter((m) => u.preds[m.id])
    .map((m) => {
      const p = u.preds[m.id];
      const started = new Date(m.date).getTime() <= now;
      const hidden = !started && !mine;
      const valid = predValid(m, p);
      const sc = valid ? predPoints(m, p) : null;
      const badge = !valid && started
        ? `<span class="pp pp0">geçersiz</span>`
        : sc === null ? `<span class="pp ppwait">${started ? "oynanıyor" : "bekliyor"}</span>`
        : sc === 3 ? `<span class="pp pp3">+3</span>` : sc === 1 ? `<span class="pp pp1">+1</span>` : `<span class="pp pp0">0</span>`;
      const actual = m.state === "pre" ? fmtTime(m.date) : `${m.home.score ?? ""} - ${m.away.score ?? ""}`;
      return `<div class="pred-row" data-match="${m.id}">
        <div class="pred-row-teams">${esc(m.home.name)} - ${esc(m.away.name)}<small>${new Date(m.date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} · ${esc(actual)}</small></div>
        <div class="pred-row-val">${hidden ? "🔒" : `${p.h} - ${p.a}`}</div>
        ${hidden ? `<span class="pp ppwait">gizli</span>` : badge}
      </div>`;
    }).join("");
  const s = leagueScore(u.preds);
  const tour = picksScore(u.picks);

  // turnuva tahminleri özeti (kilitlenmemiş seçimler başkalarına gizli)
  const teamName = (id) => {
    const t = (state.teamsCache || []).find((x) => x.id === String(id));
    return t ? t.name : "?";
  };
  let pickLines = "";
  const cp = u.picks && u.picks["champion"];
  if (cp && cp.team) {
    const show = mine || now >= tournamentLockTime();
    pickLines += `<div class="pick-line"><span>👑 Şampiyon</span><b>${show ? esc(teamName(cp.team)) : "🔒"}</b></div>`;
  }
  for (const [key, p] of Object.entries(u.picks || {})) {
    if (!key.startsWith("group-") || (!p.first && !p.second)) continue;
    const letter = key.slice(6);
    const show = mine || now >= groupLockTime(letter);
    const txt = show ? [p.first, p.second].filter(Boolean).map(teamName).map(esc).join(", ") : "🔒";
    pickLines += `<div class="pick-line"><span>${esc(letter)} Grubu</span><b>${txt}</b></div>`;
  }

  openSheet(`
    <div class="set-title">🏅 ${esc(u.name)}${mine ? ' <span class="me-tag">sen</span>' : ""}</div>
    <div class="pred-summary">
      <div><b>${s.pts + tour}</b><small>toplam puan</small></div>
      <div><b>${tour}</b><small>turnuva</small></div>
      <div><b>${s.exact}</b><small>tam isabet</small></div>
    </div>
    ${pickLines ? `<div class="md-section"><h3>🏆 Turnuva Tahminleri</h3>${pickLines}</div>` : ""}
    ${rows || emptyHTML("🎯", "Henüz maç tahmini yok.")}
    ${mine ? "" : `<div class="pred-note">🔒 Tahminler maç/turnuva başlayana kadar gizlidir.</div>`}`);
  $("#sheetContent").onclick = (e) => {
    const card = e.target.closest("[data-match]");
    if (card) openMatch(card.dataset.match);
  };
}

$("#sheetOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeSheet(); });
$("#btnSettings").addEventListener("click", async () => {
  if (!state.teamsCache) { try { await loadStandings(); } catch {} }
  renderSettings();
});
$("#btnRefresh").addEventListener("click", async () => {
  const btn = $("#btnRefresh");
  btn.classList.add("spinning");
  try { await refreshForTab(true); } finally { btn.classList.remove("spinning"); }
});

async function refreshForTab(force) {
  try {
    if (state.tab === "matches" || state.tab === "bracket") { await loadMatches(force); }
    else if (state.tab === "groups") { await loadStandings(force); }
    else if (state.tab === "scorers") { await loadScorers(force); }
    else if (state.tab === "league") { await loadMatches(); await loadLeague(force); }
    render();
  } catch (err) {
    if (!state.matches.length && state.tab !== "groups") view.innerHTML = emptyHTML("📡", "Veri alınamadı. İnternet bağlantını kontrol edip yenile.");
  }
}

/* ============ Döngü ============ */
function checkReminders() {
  if (!state.notif.enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = Date.now();
  let dirty = false;
  for (const m of state.matches) {
    if (m.state !== "pre" || state.reminded[m.id]) continue;
    if (state.notif.scope === "favs" && !involvesFav(m)) continue;
    const delta = new Date(m.date).getTime() - now;
    if (delta > 0 && delta <= 20 * 60 * 1000) {
      showNotif("🕒 Maç birazdan başlıyor", `${m.home.name} - ${m.away.name} · ${fmtTime(m.date)}`, "remind-" + m.id);
      state.reminded[m.id] = 1;
      dirty = true;
    }
  }
  if (dirty) store.set("reminded", state.reminded);
}

async function poll() {
  const anyLive = state.matches.some((m) => m.state === "in");
  const soon = state.matches.some((m) => m.state === "pre" && new Date(m.date) - Date.now() < 15 * 60 * 1000 && new Date(m.date) - Date.now() > -10 * 60 * 1000);
  const needFast = anyLive || soon;
  const interval = needFast ? 35_000 : 300_000;
  if (Date.now() - state.matchesAt >= interval) {
    try {
      await loadMatches(true);
      if (state.tab === "matches" || state.tab === "bracket") render();
    } catch {}
  }
  checkReminders();
  // canlı maç varken puan durumu ve golcüler de arka planda taze kalsın (TTL'ler aşırı isteği engeller)
  if (anyLive) {
    loadStandings().then(() => { if (state.tab === "groups") render(); }).catch(() => {});
    loadScorers().then(() => { if (state.tab === "scorers") render(); }).catch(() => {});
  }
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshForTab(); });

/* ============ Başlat ============ */
applyTheme();
matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

(async () => {
  view.innerHTML = loadingHTML();
  await refreshForTab(true);
  loadStandings().catch(() => {});
  setInterval(poll, 10_000);
  maybeOnboard();
})();

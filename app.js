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
  return `<div class="match-card ${fav ? "fav" : ""} ${live ? "live" : ""}" data-match="${m.id}">
    ${teamRowHTML(m.home, "home")}
    <div class="mc-mid">${mid}</div>
    ${teamRowHTML(m.away, "away")}
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

  // favori hero: canlı favori maç ya da sıradaki favori maç
  if (state.favs.length) {
    const favLive = state.matches.find((m) => m.state === "in" && involvesFav(m));
    const favNext = state.matches.find((m) => m.state === "pre" && involvesFav(m));
    const hero = favLive || favNext;
    if (hero) html += heroHTML(hero);
  }

  const live = state.matches.filter((m) => m.state === "in");
  if (live.length) {
    html += `<div class="section-title live-title"><span class="live-dot"></span> Şu an oynanıyor</div>`;
    html += live.map(matchCardHTML).join("");
  }

  // günlere göre grupla; varsayılan kaydırma bugüne
  const byDay = new Map();
  for (const m of state.matches) {
    const k = dayKey(m.date);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(m);
  }
  const todayK = dayKey(now);
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
      rows += `<tr class="${fav ? "fav-row" : ""}">
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

function render() {
  if (state.tab === "matches") renderMatches();
  else if (state.tab === "groups") renderGroups();
  else if (state.tab === "bracket") renderBracket();
  else if (state.tab === "scorers") renderScorers();
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
  const scrollY = sc.scrollTop;
  sc.innerHTML = html;
  sc.scrollTop = scrollY;

  // canlı maçta açık kalan detay ekranını yenile
  clearTimeout(openMatch._timer);
  const st = comp && comp.status && comp.status.type ? comp.status.type.state : "post";
  const startingSoon = st === "pre" && comp && new Date(comp.date) - Date.now() < 10 * 60 * 1000;
  if (st === "in" || startingSoon) {
    openMatch._timer = setTimeout(() => openMatch(id, true), 30_000);
  }
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
  const card = e.target.closest("[data-match]");
  if (card) openMatch(card.dataset.match);
});

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
    render();
  } catch (err) {
    if (!state.matches.length && state.tab !== "groups") view.innerHTML = emptyHTML("📡", "Veri alınamadı. İnternet bağlantını kontrol edip yenile.");
  }
}

/* ============ Döngü ============ */
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
})();

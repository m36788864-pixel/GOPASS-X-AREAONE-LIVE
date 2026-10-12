/* =========================================================
   GOPASS - Frontend
   ตอนนี้ข้อมูลงานคอนเสิร์ตทั้งหมดมาจาก Backend จริง (Express API)
   ไม่ใช่ localStorage อีกต่อไป -> แอดมินเพิ่ม/แก้/ลบงานแล้ว
   ทุกคนที่เข้าเว็บ (คนละเครื่อง คนละเบราว์เซอร์) จะเห็นข้อมูลเดียวกัน
   ========================================================= */

const API_BASE = "/api";

/* =========================================================
   ลิงก์เชื่อมเว็บดูไลฟ์ AREAONE-LIVE
   ลำดับการหา URL:
     1. window.GOPASS_LIVE_URL (ตั้ง override ก่อนโหลด app.js)
     2. เปิดเป็นไฟล์ (file://)  => เปิด live/index.html ในโฟลเดอร์เดียวกัน
     3. เปิดบน localhost        => http://127.0.0.1:3000/ (รัน START-ALL.bat)
     4. เปิดบนโดเมนจริง         => /live/ (ต้องมี reverse proxy; ถ้าแยกโดเมน
                                   ให้ตั้ง window.GOPASS_LIVE_URL เป็น URL เต็ม)
   ตั้ง "off" เพื่อซ่อนปุ่มดูไลฟ์
   ========================================================= */
function resolveLiveUrl() {
  const o = (typeof window !== "undefined" && window.GOPASS_LIVE_URL != null)
    ? String(window.GOPASS_LIVE_URL).trim() : "";
  if (o === "off") return "";
  if (o !== "") return o;
  if (typeof location === "undefined") return "/live/";
  if (location.protocol === "file:") return "live/index.html";
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return "http://127.0.0.1:3000/";
  return "/live/";
}
const GOPASS_LIVE_URL = resolveLiveUrl();
function injectSiteLinks() {
  if (!GOPASS_LIVE_URL) return;
  const nav = document.querySelector(".site-header .nav nav");
  if (nav && !nav.querySelector("[data-live-link]")) {
    const a = document.createElement("a");
    a.href = GOPASS_LIVE_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("data-live-link", "");
    a.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> ดูไลฟ์';
    nav.appendChild(a);
  }
  const tab = document.querySelector(".tabbar");
  if (tab && !tab.querySelector("[data-live-link]")) {
    const a = document.createElement("a");
    a.href = GOPASS_LIVE_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("data-live-link", "");
    a.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i><span>ดูไลฟ์</span>';
    tab.insertBefore(a, tab.lastElementChild || null);
  }
  const side = document.querySelector(".sidebar");
  if (side && !side.querySelector("[data-live-link]")) {
    const bottom = side.querySelector(".side-bottom");
    const a = document.createElement("a");
    a.href = GOPASS_LIVE_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("data-live-link", "");
    a.innerHTML = '<i class="fa-solid fa-tower-broadcast"></i> ดูไลฟ์';
    if (bottom) side.insertBefore(a, bottom); else side.appendChild(a);
  }
}
document.addEventListener("DOMContentLoaded", injectSiteLinks);

/* ---------- ตัวช่วยทั่วไป ---------- */
function money(n) { return Number(n || 0).toLocaleString("th-TH") + " บาท"; }
function dateTH(v) {
  if (!v) return "-";
  return new Date(v + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function poster(e, cls = "") {
  return e.image
    ? `<img class="${cls}" src="${esc(e.image)}" alt="${esc(e.name)}">`
    : `<div class="poster-fallback ${cls}">${esc(e.name)}</div>`;
}

/* ---------- Toast แจ้งเตือนสวย ๆ แทน alert() ---------- */
function toast(message, type = "success") {
  let host = document.getElementById("toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icon = type === "error" ? "fa-circle-exclamation" : type === "info" ? "fa-circle-info" : "fa-circle-check";
  el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 3200);
}

/* ---------- Loader ----------
   A veil that tweens into blur with the red pegtop flame on top. It is
   raised on every internal page swap and while an API request is in flight.
   The mark is built once and kept in the document; each peg namespaces its
   gradient/filter ids so the three copies never collide. */
const PEG_TOP_PATH = "M63,37c-6.7-4-4-27-13-27s-6.3,23-13,27-27,4-27,13,20.3,9,27,13,4,27,13,27,6.3-23,13-27,27-4,27-13-20.3-9-27-13Z";

function pegTopSVG(ns) {
  return `<svg class="peg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <filter id="${ns}-shine"><feGaussianBlur stdDeviation="3"></feGaussianBlur></filter>
      <mask id="${ns}-mask"><path d="${PEG_TOP_PATH}" fill="white"></path></mask>
      <radialGradient id="${ns}-g1" cx="50" cy="66" fx="50" fy="66" r="30" gradientTransform="translate(0 35) scale(1 0.5)" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="black" stop-opacity="0.3"></stop>
        <stop offset="50%" stop-color="black" stop-opacity="0.1"></stop>
        <stop offset="100%" stop-color="black" stop-opacity="0"></stop>
      </radialGradient>
      <radialGradient id="${ns}-g2" cx="55" cy="20" fx="55" fy="20" r="30" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="white" stop-opacity="0.3"></stop>
        <stop offset="50%" stop-color="white" stop-opacity="0.1"></stop>
        <stop offset="100%" stop-color="white" stop-opacity="0"></stop>
      </radialGradient>
      <radialGradient id="${ns}-g3" cx="85" cy="50" fx="85" fy="50" href="#${ns}-g2"></radialGradient>
      <radialGradient id="${ns}-g4" cx="50" cy="58" fx="50" fy="58" r="60" gradientTransform="translate(0 47) scale(1 0.2)" href="#${ns}-g3"></radialGradient>
      <linearGradient id="${ns}-g5" x1="50" y1="90" x2="50" y2="10" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="black" stop-opacity="0.2"></stop>
        <stop offset="40%" stop-color="black" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <g>
      <path d="${PEG_TOP_PATH}" fill="currentColor"></path>
      <path d="${PEG_TOP_PATH}" fill="url(#${ns}-g1)"></path>
      <path d="${PEG_TOP_PATH}" fill="none" stroke="white" stroke-opacity="0.3" stroke-width="3" filter="url(#${ns}-shine)" mask="url(#${ns}-mask)"></path>
      <path d="${PEG_TOP_PATH}" fill="url(#${ns}-g2)"></path>
      <path d="${PEG_TOP_PATH}" fill="url(#${ns}-g3)"></path>
      <path d="${PEG_TOP_PATH}" fill="url(#${ns}-g4)"></path>
      <path d="${PEG_TOP_PATH}" fill="url(#${ns}-g5)"></path>
    </g>
  </svg>`;
}

let loaderEl = null;
let loaderOpen = 0;

function ensureLoader() {
  if (loaderEl) return loaderEl;
  loaderEl = document.createElement("div");
  loaderEl.id = "pageLoader";
  loaderEl.className = "page-loader";
  loaderEl.setAttribute("role", "status");
  loaderEl.setAttribute("aria-live", "polite");
  loaderEl.setAttribute("aria-label", "กำลังโหลด");
  loaderEl.innerHTML =
    '<div class="loader">' +
    pegTopSVG("peg-one").replace('class="peg"', 'class="peg-one"') +
    pegTopSVG("peg-two").replace('class="peg"', 'class="peg-two"') +
    pegTopSVG("peg-three").replace('class="peg"', 'class="peg-three"') +
    "</div>";
  document.body.appendChild(loaderEl);
  return loaderEl;
}

/* Reference counted, so overlapping requests only drop the veil once the
   last one settles. */
function showLoader() {
  loaderOpen += 1;
  ensureLoader().classList.add("is-active");
}
function hideLoader() {
  loaderOpen = Math.max(0, loaderOpen - 1);
  if (!loaderOpen && loaderEl) loaderEl.classList.remove("is-active");
}

/* Swap the document behind the veil. The short wait lets the blur actually
   read instead of flashing; reduced motion goes straight there. */
function loadPage(url) {
  showLoader();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.location.href = url;
    return;
  }
  setTimeout(() => { window.location.href = url; }, 280);
}
window.gopassLoader = { show: showLoader, hide: hideLoader, load: loadPage };

/* ---------- LENIS SMOOTH SCROLL ----------
   Momentum scrolling is a progressive enhancement: if the vendored bundle is
   missing the page still scrolls natively, and reduced-motion users keep the
   browser default. Lenis drives the real scroll position, so native scroll
   events, sticky positioning and view() timelines all keep working. */
function initSmoothScroll() {
  if (!window.Lenis) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const lenis = new window.Lenis({
    duration: 1.05,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.9,
    touchMultiplier: 1.5,
    autoRaf: false,
  });
  window.lenis = lenis;

  let rafId = 0;
  const frame = (time) => { lenis.raf(time); rafId = requestAnimationFrame(frame); };
  rafId = requestAnimationFrame(frame);
  /* no point easing a scroll nobody is watching */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
    else if (!rafId) rafId = requestAnimationFrame(frame);
  });

  /* In-page anchors are handed to Lenis so they ride the same easing.
     Cross-page hashes stay with the browser: loadPage owns those. */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const id = a.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.getElementById(decodeURIComponent(id.slice(1)));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -headerOffset() });
    /* keep the address bar in step with what a native anchor would do */
    if (history.pushState) history.pushState(null, "", id);
  });
}

/* The glass header is sticky, so anything we scroll to has to clear it. */
function headerOffset() {
  const h = document.querySelector(".site-header");
  return h ? Math.round(h.getBoundingClientRect().height) + 12 : 0;
}
  window.lenisScrollTo = (target, options = {}) => {
  if (window.lenis) window.lenis.scrollTo(target, { offset: -headerOffset(), ...options });
  else if (typeof target === "string") {
    const el = document.querySelector(target);
    if (el) el.scrollIntoView();
  }
};

/* Nested scrollers keep their own native wheel behaviour instead of being
   dragged along by the page easing: the sticky admin sidebar, the modals and
   the wide tables. Admin tables are re-rendered constantly, so the attribute
   is stamped whenever markup lands in the DOM. */
const NESTED_SCROLL = ".sidebar, .modal, .modal-box, .table-scroll, .sales-table-wrap, .buyer-table-wrap, .report-table-wrap";
function markNestedScroll(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches(NESTED_SCROLL)) root.setAttribute("data-lenis-prevent", "");
  root.querySelectorAll(NESTED_SCROLL).forEach((el) => el.setAttribute("data-lenis-prevent", ""));
}
function watchNestedScroll() {
  if (!document.body) return;
  markNestedScroll(document.body);
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach(markNestedScroll));
  }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchNestedScroll);
else watchNestedScroll();


/* ---------- เรียก API ---------- */
async function apiFetch(path, options = {}) {
  showLoader();
  try {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: { ...(options.headers || {}) },
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const message = (data && data.message) || `เกิดข้อผิดพลาด (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    hideLoader();
  }
}

async function fetchEvents() { return apiFetch("/events"); }
async function fetchEvent(id) { return apiFetch(`/events/${encodeURIComponent(id)}`); }

/* ---------- การ์ดงาน ---------- */
function card(e) {
  return `<article class="event-card"><div class="poster">${poster(e)}<span class="badge">${esc(e.status)}</span></div><div class="card-body"><h3>${esc(e.name)}</h3><p><i class="fa-regular fa-calendar"></i>${dateTH(e.date)} · ${esc(e.time)} น.</p><p><i class="fa-solid fa-location-dot"></i>${esc(e.venue)}</p><div class="price">เริ่มต้น ${money(e.regular)}</div><a class="btn red full" href="event.html?id=${encodeURIComponent(e.id)}">ดูรายละเอียด <i class="fa-solid fa-arrow-right"></i></a></div></article>`;
}

function skeletonCards(n = 4) {
  return Array.from({ length: n }).map(() => `<div class="event-card skeleton"><div class="poster"></div><div class="card-body"><div class="sk-line w60"></div><div class="sk-line w40"></div><div class="sk-line w80"></div></div></div>`).join("");
}

/* ---------- หน้าแรก ---------- */
async function renderHome() {
  const el = document.getElementById("homeEvents");
  if (!el) return;
  el.innerHTML = skeletonCards(4);
  try {
    const list = (await fetchEvents()).filter(e => e.status === "เปิดขาย");
    el.innerHTML = list.length ? list.map(card).join("") : `<div class="empty"><i class="fa-regular fa-calendar-xmark"></i>ยังไม่มีงานที่เปิดขาย</div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty error"><i class="fa-solid fa-triangle-exclamation"></i>โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

/* ---------- หน้ารายการทั้งหมด (มีค้นหา) ---------- */
async function renderEvents() {
  const el = document.getElementById("eventList"), input = document.getElementById("search");
  if (!el) return;
  el.innerHTML = skeletonCards(6);
  let all = [];
  try {
    all = await fetchEvents();
  } catch (err) {
    el.innerHTML = `<div class="empty error"><i class="fa-solid fa-triangle-exclamation"></i>โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</div>`;
    return;
  }
  function draw() {
    const q = (input?.value || "").toLowerCase();
    const list = all.filter(e => (e.name + " " + e.venue).toLowerCase().includes(q));
    el.innerHTML = list.length ? list.map(card).join("") : `<div class="empty"><i class="fa-solid fa-magnifying-glass"></i>ไม่พบคอนเสิร์ต</div>`;
  }
  input?.addEventListener("input", draw);
  draw();
}

/* ---------- ปฏิทินรายเดือน ----------
   Event dates are plain "YYYY-MM-DD" strings, so they are compared as strings
   and never round-tripped through Date. new Date("2026-10-25") is parsed as
   UTC midnight, which lands on the previous day for any negative offset and
   makes the grid disagree with the API by a day. */
const MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const WEEK_TH = ["อา", "จ", "อ", "พ", "ศ", "ส", "อา"];
const THAI_MONTHS = 543;

function ymdKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function thaiYear(y) { return y + THAI_MONTHS; }
/* Sunday-first, matching Date#getDay, which is what the grid math uses. */
function weekIndex(d) { return d.getDay(); }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

function groupEventsByDay(list) {
  const map = new Map();
  for (const e of list) {
    if (!e || typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  }
  return map;
}

function eventStatusKey(e) {
  if (e.status === "เปิดขาย") return "open";
  if (e.status === "เร็ว ๆ นี้") return "soon";
  return "closed";
}

async function renderCalendar() {
  const grid = document.getElementById("calGrid");
  if (!grid) return;
  const label = document.getElementById("calLabel");
  const panel = document.getElementById("calDayPanel");
  const live = document.getElementById("calLive");

  grid.innerHTML = `<div class="cal-loading"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดปฏิทิน...</div>`;

  let all = [];
  try {
    all = await fetchEvents();
  } catch (err) {
    grid.innerHTML = `<p class="cal-error"><i class="fa-solid fa-triangle-exclamation"></i> โหลดปฏิทินไม่สำเร็จ: ${esc(err.message)}</p>`;
    return;
  }

  const byDay = groupEventsByDay(all);
  const today = new Date();
  const todayKey = ymdKey(today.getFullYear(), today.getMonth(), today.getDate());

  const params = new URLSearchParams(location.search);
  const parseYearMonth = (raw, fallbackYear, fallbackMonth) => {
    const m = /^(\d{4})-(\d{2})$/.exec(raw || "");
    if (!m) return { y: fallbackYear, m: fallbackMonth };
    const y = Number(m[1]), mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11 || y < 2000 || y > 2100) return { y: fallbackYear, m: fallbackMonth };
    return { y, m: mo };
  };
  let { y, m } = parseYearMonth(params.get("month"), today.getFullYear(), today.getMonth());
  let selected = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") || "") ? params.get("day") : todayKey;

  /* A deep link to a day in another month should open that month, not the
     month the link happened to be built in. */
  if (selected.slice(0, 7) !== ymdKey(y, m, 1).slice(0, 7)) {
    ({ y, m } = parseYearMonth(selected.slice(0, 7), y, m));
  }

  function selectDay(key, opts = {}) {
    selected = key;
    if (!opts.silent) {
      const u = new URL(location.href);
      u.searchParams.set("month", `${y}-${String(m + 1).padStart(2, "0")}`);
      u.searchParams.set("day", key);
      history.replaceState(null, "", u);
    }
    drawGrid();
    drawPanel();
  }

  function drawPanel() {
    if (!panel) return;
    const list = byDay.get(selected) || [];
    const [sy, sm, sd] = selected.split("-").map(Number);
    const d = new Date(sy, sm - 1, sd);
    const title = d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const head = `<div class="cal-drawer-head">
        <h3>${esc(title)}</h3>
        <span>${list.length ? `${list.length} งาน` : "ไม่มีงาน"}</span>
      </div>`;

    if (!list.length) {
      panel.innerHTML = head + `<div class="cal-none">
          <i class="fa-regular fa-calendar"></i>
          <span>วันนี้ยังไม่มีงาน</span>
          <a class="btn ghost sm" href="/events.html">ดูคอนเสิร์ตทั้งหมด</a>
        </div>`;
      return;
    }

    panel.innerHTML = head + `<div class="cal-rows">` + list.map(e => {
      const key = eventStatusKey(e);
      const price = Math.min(...ticketTypesOf(e).map(t => Number(t.price || 0)));
      const href = `event.html?id=${encodeURIComponent(e.id)}`;
      return `<div class="cal-row cal-row--${key}">
          <span class="cal-row-bar"></span>
          <span class="cal-row-time">${esc(e.time || "")}</span>
          <span class="cal-row-name">
            <a href="${href}">${esc(e.name)}</a>
            <span>${esc(e.venue)}${price ? ` · เริ่มต้น ${money(price)}` : ""}</span>
          </span>
          <span class="cal-row-acts">
            ${e.status === "เปิดขาย"
              ? `<a class="btn red sm" href="queue.html?id=${encodeURIComponent(e.id)}"><i class="fa-solid fa-ticket"></i>กดบัตร</a>`
              : `<span class="cal-tag cal-tag--${key}">${esc(e.status)}</span>
                 <a class="btn ghost sm" href="${href}">รายละเอียด</a>`}
          </span>
        </div>`;
    }).join("") + `</div>`;
  }

  function drawGrid() {
    const first = new Date(y, m, 1);
    const lead = weekIndex(first);
    const total = daysInMonth(y, m);
    const cells = [];

    for (let i = 0; i < lead; i++) {
      const d = new Date(y, m, -(lead - 1 - i));
      cells.push(`<div class="cal-cell cal-cell--out" aria-hidden="true">
          <span class="cal-num">${d.getDate()}</span></div>`);
    }

    for (let day = 1; day <= total; day++) {
      const key = ymdKey(y, m, day);
      const list = byDay.get(key) || [];
      const isToday = key === todayKey;
      const isSel = key === selected;
      const items = list.slice(0, 2).map(e =>
        `<span class="cal-item cal-item--${eventStatusKey(e)}"><b>${esc(e.time || "")}</b><span>${esc(e.name)}</span></span>`
      ).join("");
      const more = list.length > 2 ? `<span class="cal-more">+${list.length - 2}</span>` : "";
      const label = `${day} ${MONTH_TH[m]} ${thaiYear(y)}${list.length ? ` มี ${list.length} งาน` : " ไม่มีงาน"}`;
      cells.push(`<button type="button" class="cal-cell${isSel ? " is-sel" : ""}${isToday ? " is-today" : ""}"
          data-key="${key}" aria-label="${esc(label)}"${isSel ? ' aria-current="date"' : ""}>
          <span class="cal-num">${day}</span>
          ${list.length ? `<span class="cal-items">${items}${more}</span>` : ""}
        </button>`);
    }

    const used = lead + total;
    const trail = (7 - (used % 7)) % 7;
    for (let i = 1; i <= trail; i++) {
      cells.push(`<div class="cal-cell cal-cell--out" aria-hidden="true">
          <span class="cal-num">${i}</span></div>`);
    }

    if (label) {
      label.textContent = `${MONTH_TH[m]} ${thaiYear(y)}`;
    }
    grid.innerHTML = WEEK_TH.map(d => `<div class="cal-wd" aria-hidden="true">${d}</div>`).join("") + cells.join("");

    if (live) {
      const list = byDay.get(selected) || [];
      live.textContent = `เดือน${MONTH_TH[m]} ${thaiYear(y)} วันที่ ${selected} มี ${list.length} งาน`;
    }
  }

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-cell[data-key]");
    if (cell) selectDay(cell.dataset.key);
  });

  /* Arrow keys move by day/week, PageUp/PageDown by month: a month grid is
     unusable with only a pointer when you are looking for one date. */
  grid.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let ny = y, nm = m, nd = null;
    if (step) {
      const [cy, cm, cd] = selected.split("-").map(Number);
      const d = new Date(cy, cm - 1, cd + step);
      nd = d.getDate(); ny = d.getFullYear(); nm = d.getMonth();
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      nm = m + (e.key === "PageUp" ? -1 : 1);
      if (nm < 0) { nm = 11; ny--; } else if (nm > 11) { nm = 0; ny++; }
      /* keep the same day-of-month; Math.min below clamps short months */
      nd = Number(selected.split("-")[2]);
    } else if (e.key === "Home" || e.key === "End") {
      const t = e.key === "Home" ? 1 : daysInMonth(y, m);
      nd = t;
    } else return;

    e.preventDefault();
    if (ny !== y || nm !== m) { y = ny; m = nm; }
    if (nd !== null) selected = ymdKey(y, m, Math.min(nd, daysInMonth(y, m)));
    selectDay(selected);
    grid.querySelector(`.cal-cell[data-key="${selected}"]`)?.focus();
  });

  const shift = (delta) => {
    let nm = m + delta;
    if (nm < 0) { nm = 11; y--; } else if (nm > 11) { nm = 0; y++; }
    m = nm;
    const clamped = Math.min(Number(selected.split("-")[2]), daysInMonth(y, m));
    selected = ymdKey(y, m, clamped);
    selectDay(selected);
  };

  document.getElementById("calPrev")?.addEventListener("click", () => shift(-1));
  document.getElementById("calNext")?.addEventListener("click", () => shift(1));
  document.getElementById("calToday")?.addEventListener("click", () => {
    const t = new Date();
    y = t.getFullYear(); m = t.getMonth();
    selectDay(todayKey);
  });

  drawGrid();
  drawPanel();
}

/* ---------- หน้ารายละเอียดงาน ---------- */
function currentEventId() { return new URLSearchParams(location.search).get("id"); }

function ticketTypesOf(e) {
  return Array.isArray(e.ticketTypes) && e.ticketTypes.length ? e.ticketTypes : [
    { id: "regular", name: "บัตรธรรมดา", description: "สิทธิ์เข้างานตามมาตรฐาน", price: Number(e.regular || 0) },
    { id: "vip", name: "บัตร VIP", description: "สิทธิ์พิเศษสำหรับผู้ถือบัตร VIP", price: Number(e.vip || 0) }
  ];
}

async function renderDetail() {
  const el = document.getElementById("detail");
  if (!el) return;
  el.innerHTML = `<div class="loading-block"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...</div>`;
  try {
    const e = await fetchEvent(currentEventId());
    if (!e) throw new Error("ไม่พบงาน");
    window.currentEvent = e;
    const types = ticketTypesOf(e);
    const minPrice = Math.min(...types.map(t => Number(t.price || 0)));
    el.innerHTML = `<div class="detail"><div class="detail-poster">${poster(e)}</div><div><span class="kicker">${esc(e.status)}</span><h1>${esc(e.name)}</h1><div class="info-line"><i class="fa-regular fa-calendar"></i>${dateTH(e.date)}</div><div class="info-line"><i class="fa-regular fa-clock"></i>${esc(e.time)} น.</div><div class="info-line"><i class="fa-solid fa-location-dot"></i>${esc(e.venue)}</div><h2 class="mt">รายละเอียดงาน</h2><p>${e.ticketMode==="seatmap"?"เลือกที่นั่งจากผังที่นั่ง และกรอกข้อมูลผู้ซื้อเพื่อรับรายการยืนยันจาก GOPASS":"เลือกประเภทบัตร จำนวน และกรอกข้อมูลผู้ซื้อเพื่อรับรายการยืนยันจาก GOPASS"}</p><div class="ticket-types">${types.map(t=>`<div><b>${esc(t.name)}</b><span>${esc(t.description)}</span><strong>${Number(t.price)===0?"ฟรี":money(t.price)}</strong></div>`).join("")}</div>${e.status === "เปิดขาย" ? `<a class="btn red full" href="queue.html?id=${encodeURIComponent(e.id)}">${e.ticketMode==="seatmap"?"เลือกที่นั่ง":"กดบัตร"} <i class="fa-solid ${e.ticketMode==="seatmap"?"fa-chair":"fa-ticket"}"></i></a>` : `<button class="btn disabled full" disabled>${esc(e.status)}</button>`}<small class="limit-note">จำกัดสูงสุด ${Number(e.limitPerOrder || 10)} ใบ / คำสั่งซื้อ</small></div></div>`;
  } catch (err) {
    el.innerHTML = `<div class="empty error"><i class="fa-solid fa-triangle-exclamation"></i>${esc(err.message)}</div>`;
  }
}

/* ---------- หน้าเลือกบัตร ---------- */
async function renderSeat() {
  const el = document.getElementById("seatPage");
  if (!el) return;
  el.innerHTML = `<div class="loading-block"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...</div>`;
  let e;
  try { e = await fetchEvent(currentEventId()); } catch (err) { el.innerHTML = `<div class="empty error">${esc(err.message)}</div>`; return; }
  if (!e) { el.innerHTML = `<div class="empty">ไม่พบงาน</div>`; return; }
  if (e.ticketMode === "seatmap" && window.SeatMap) { await window.SeatMap.renderPicker(el, e); return; }

  const types = ticketTypesOf(e);
  const storedType = sessionStorage.getItem("ticketType") || ""; const savedType = types.some(t => t.id === storedType) ? storedType : (types[0]?.id || "");
  const limit = Math.max(1, Number(e.limitPerOrder || 10));
  const savedQty = Math.max(1, Math.min(limit, Number(sessionStorage.getItem("ticketQty") || 1)));
  const eventImage = e.image ? `<img src="${esc(e.image)}" alt="${esc(e.name)}">` : `<div class="ticket-event-image-fallback"><i class="fa-solid fa-music"></i></div>`;

  el.innerHTML = `
    <div class="ticket-platform">
      <div class="ticket-stepper"><div class="ticket-step active"><span>01</span><div><b>เลือกบัตร</b><small>ประเภทและจำนวน</small></div></div><div class="ticket-step-line"></div><div class="ticket-step"><span>02</span><div><b>ข้อมูลผู้ซื้อ</b><small>ตรวจสอบรายการ</small></div></div><div class="ticket-step-line"></div><div class="ticket-step"><span>03</span><div><b>เสร็จสิ้น</b><small>รับรายการของคุณ</small></div></div></div>
      <section class="ticket-event-summary"><div class="ticket-event-thumb">${eventImage}</div><div class="ticket-event-copy"><span class="ticket-eyebrow">GOPASS</span><h1>${esc(e.name)}</h1><div class="ticket-event-meta"><span><i class="fa-regular fa-calendar"></i>${dateTH(e.date)}</span><span><i class="fa-regular fa-clock"></i>${esc(e.time)} น.</span><span><i class="fa-solid fa-location-dot"></i>${esc(e.venue)}</span></div></div><div class="ticket-hold"><i class="fa-solid fa-shield-halved"></i><span>สิทธิ์ของคุณถูกสำรองไว้</span><b id="timer">10:00</b></div></section>
      <div class="ticket-select-layout">
        <section class="ticket-main-panel"><div class="panel-heading"><div><span class="ticket-eyebrow">TICKET TYPE</span><h2>เลือกประเภทบัตร</h2><p>เลือกได้ 1 ประเภทต่อคำสั่งซื้อ และสูงสุด ${limit} ใบ</p></div><span class="secure-badge"><i class="fa-solid fa-lock"></i> Secure Checkout</span></div>
          <div class="ticket-choice-grid">${types.map((t,i)=>`
            <button type="button" class="ticket-choice ${i===0?"regular":""} ${savedType===t.id?"selected":""}" onclick="pickTicket('${esc(t.id)}', ${Number(t.price)||0})">
              <span class="choice-check"><i class="fa-solid fa-check"></i></span><div class="choice-top"><div class="choice-icon"><i class="fa-solid fa-ticket"></i></div><span class="choice-tag">${Number(t.price)===0?"FREE":"TICKET"}</span></div>
              <div class="choice-copy"><h3>${esc(t.name)}</h3><p>${esc(t.description || "สิทธิ์เข้างานตามประเภทที่เลือก")}</p></div>
              <div class="choice-footer"><div><small>ราคา / ใบ</small><strong>${Number(t.price)===0?"ฟรี":money(t.price)}</strong></div><span class="choice-radio"></span></div>
            </button>`).join("")}</div>
          <div class="ticket-policy"><i class="fa-solid fa-circle-info"></i><span>ตรวจสอบประเภทบัตรและจำนวนให้ถูกต้องก่อนยืนยัน ระบบจะบันทึกเลขคิวให้คำสั่งซื้อโดยอัตโนมัติ</span></div>
        </section>
        <aside class="ticket-side-panel"><div class="side-heading"><span class="ticket-eyebrow">YOUR ORDER</span><h2>สรุปรายการ</h2></div><div class="order-line"><span>ประเภทบัตร</span><b id="summaryType">ยังไม่ได้เลือก</b></div><div class="order-line"><span>ราคาต่อใบ</span><b id="summaryPrice">-</b></div><div class="order-qty"><div><span>จำนวนบัตร</span><small>สูงสุด ${limit} ใบ</small></div><div class="qty-control"><button type="button" onclick="changeQty(-1)"><i class="fa-solid fa-minus"></i></button><strong id="qtyValue">${savedQty}</strong><button type="button" onclick="changeQty(1)"><i class="fa-solid fa-plus"></i></button></div></div><div class="order-total"><span>ยอดรวม</span><strong id="total">0 บาท</strong></div><button class="btn red full checkout-btn" type="button" onclick="checkout(event)"><span>ดำเนินการต่อ</span><i class="fa-solid fa-arrow-right"></i></button><p class="checkout-note"><i class="fa-solid fa-lock"></i> ข้อมูลถูกบันทึกบนเซิร์ฟเวอร์เพื่อให้แอดมินตรวจสอบได้</p></aside>
      </div>
    </div>`;

  window.currentEvent = e; window.ticketTypes = types; window.ticketLimit = limit;
  window.selectedType = savedType; window.selectedPrice = Number(types.find(t=>t.id===savedType)?.price || 0); window.ticketQty = savedQty;
  updateTicketSelection();

  let sec = 600;
  const timerId = setInterval(() => { sec--; const t=document.getElementById("timer"); if(t)t.textContent=`${String(Math.max(0,Math.floor(sec/60))).padStart(2,"0")}:${String(Math.max(0,sec%60)).padStart(2,"0")}`; if(sec<=0)clearInterval(timerId); },1000);
}

function pickTicket(type, price) {
  window.selectedType = type; window.selectedPrice = Number(price || 0); sessionStorage.setItem("ticketType", type);
  updateTicketSelection();
}
function changeQty(delta) {
  const limit = Number(window.ticketLimit || 10);
  window.ticketQty = Math.max(1, Math.min(limit, Number(window.ticketQty || 1) + delta));
  sessionStorage.setItem("ticketQty", window.ticketQty);
  updateTicketSelection();
}
function updateTicketSelection() {
  document.querySelectorAll(".ticket-choice").forEach(card=>card.classList.remove("selected"));
  const idx = (window.ticketTypes || []).findIndex(t=>t.id===window.selectedType);
  const cards = document.querySelectorAll(".ticket-choice"); if(idx>=0 && cards[idx]) cards[idx].classList.add("selected");
  const q=Number(window.ticketQty||1), t=(window.ticketTypes||[]).find(x=>x.id===window.selectedType);
  const typeEl=document.getElementById("summaryType"), priceEl=document.getElementById("summaryPrice"), totalEl=document.getElementById("total"), qtyEl=document.getElementById("qtyValue");
  if(qtyEl)qtyEl.textContent=q;
  if(typeEl)typeEl.textContent=t?.name||"ยังไม่ได้เลือก";
  if(priceEl)priceEl.textContent=t?(Number(t.price)===0?"ฟรี":money(t.price)):"-";
  if(totalEl)totalEl.textContent=money((Number(t?.price)||0)*q);
}

async function checkout(ev) {
  if (!window.selectedType) { toast("กรุณาเลือกประเภทบัตร", "error"); return; }
  const btn=ev?.target?.closest?.("button"), q=Number(window.ticketQty||1);
  try {
    if(btn){btn.disabled=true;btn.innerHTML=`<i class="fa-solid fa-spinner fa-spin"></i> กำลังสร้างคำสั่งซื้อ...`;}
    const order=await apiFetch("/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:window.currentEvent.id,ticketType:window.selectedType,qty:q,price:window.selectedPrice,queueToken:sessionStorage.getItem("gopass_queue_token")||""})});
    sessionStorage.setItem("ticketQty",q); sessionStorage.setItem("ticketPrice",window.selectedPrice);
    sessionStorage.setItem("ticketType",window.selectedType);
    sessionStorage.removeItem("gopass_queue_token");
    sessionStorage.removeItem("gopass_queue_code");
    sessionStorage.setItem("gopass_checkout",JSON.stringify({eventId:window.currentEvent.id,ticketType:window.selectedType,qty:q,price:window.selectedPrice,orderId:order.id,queueCode:order.queueCode,ticketNo:order.ticketNo}));
    loadPage(`buyer.html?id=${encodeURIComponent(window.currentEvent.id)}&order=${encodeURIComponent(order.id)}`);
  } catch(err){toast(err.message,"error");if(btn){btn.disabled=false;btn.innerHTML=`<span>ดำเนินการต่อ</span><i class="fa-solid fa-arrow-right"></i>`;}}
}

/* =========================================================
   ADMIN
   ========================================================= */
const ADMIN_TOKEN_KEY = "gopass_admin_token";
const ADMIN_USER_KEY = "gopass_admin_user";
function adminToken(){return localStorage.getItem(ADMIN_TOKEN_KEY);}
function adminUsername(){return localStorage.getItem(ADMIN_USER_KEY)||"";}
function isAdminLoggedIn(){return !!adminToken();}
function adminLogoutLocal(){localStorage.removeItem(ADMIN_TOKEN_KEY);localStorage.removeItem(ADMIN_USER_KEY);}
async function adminApiFetch(path,options={}){
  try{return await apiFetch(path,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${adminToken()}`}});}
  catch(err){if(err.status===401){adminLogoutLocal();toast("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่","error");setTimeout(()=>loadPage("login.html"),700);}throw err;}
}
function adminGuard(){if(!isAdminLoggedIn()){loadPage("login.html");return false;}const n=document.getElementById("adminUsername");if(n)n.textContent=adminUsername();return true;}
async function adminLogout(){try{await adminApiFetch("/admin/logout",{method:"POST"});}catch{}adminLogoutLocal();loadPage("login.html");}

function initAdminLogin(){
  if(isAdminLoggedIn()){loadPage("events.html");return;}
  const form=document.getElementById("adminLoginForm");if(!form)return;
  form.addEventListener("submit",async ev=>{ev.preventDefault();const b=form.querySelector("button[type=submit]"),label=b.innerHTML;b.disabled=true;b.innerHTML=`<i class="fa-solid fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...`;
    try{const d=await apiFetch("/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:form.username.value.trim(),password:form.password.value})});localStorage.setItem(ADMIN_TOKEN_KEY,d.token);localStorage.setItem(ADMIN_USER_KEY,d.username);loadPage("dashboard.html");}catch(e){toast(e.message,"error");b.disabled=false;b.innerHTML=label;}
  });
}

function initAdmin(){
  if(!adminGuard())return;
  const rows=document.getElementById("rows"),form=document.getElementById("form"),file=document.getElementById("imageFile"),preview=document.getElementById("preview"),modal=document.getElementById("modal"),typeList=document.getElementById("ticketTypeList");
  if(!rows||!form)return;
  window.__gopassLiveShows = window.__gopassLiveShows || [];
  (async () => { try { const ls = await adminApiFetch("/live-shows"); window.__gopassLiveShows = (ls && ls.shows) || []; window.__gopassLiveConfigured = !!(ls && ls.configured); } catch (e) { window.__gopassLiveConfigured = false; } })();
  let editing=null,currentImage="",pendingFile=null,cachedList=[];
  let seatEditor=null;
  const currentMode=()=>form.querySelector('input[name="ticketMode"]:checked')?.value||"standing";
  function setMode(mode,map){
    const r=form.querySelector(`input[name="ticketMode"][value="${mode}"]`);if(r)r.checked=true;
    const isSeat=mode==="seatmap";
    document.getElementById("seatmapSection")?.classList.toggle("hide",!isSeat);
    document.getElementById("standingSection")?.classList.toggle("hide",isSeat);
    document.querySelector("#modal .modal-box")?.classList.toggle("modal-wide",isSeat);
    if(isSeat&&window.SeatMapEditor){const host=document.getElementById("seatEditor");if(!seatEditor||map){host.innerHTML="";seatEditor=window.SeatMapEditor.create(host,map||null,{toast});}}
    else if(isSeat){const host=document.getElementById("seatEditor");if(host)host.innerHTML='<div class="empty error"><i class="fa-solid fa-triangle-exclamation"></i> โหลดตัวออกแบบผังที่นั่งไม่สำเร็จ กรุณากดรีเฟรชหน้า (Ctrl+F5) แล้วลองใหม่</div>';}
  }
  form.addEventListener("change",ev=>{if(ev.target.name==="ticketMode")setMode(ev.target.value);});
  /* ประเภทบัตร: บัตรธรรมดา / บัตรLIVE / เขียนเอง */
  const KIND_FIXED = { regular: "บัตรธรรมดา", live: "บัตร LIVE", custom: "" };
  function liveShowOptions(selected) {
    const list = window.__gopassLiveShows || [];
    const opts = [`<option value="ALL"${(!selected || selected === "ALL") ? " selected" : ""}>ทุกรอบการแสดง (ALL)</option>`];
    list.forEach(s => {
      const id = String(s.id || "");
      if (!id) return;
      const label = (s.name || id) + (s.date ? " · " + s.date : "") + (s.active ? "" : " (ปิด)");
      opts.push(`<option value="${esc(id)}"${id === selected ? " selected" : ""}>${esc(label)}</option>`);
    });
    return opts.join("");
  }
  const typeRow = (t = {}) => {
    const kind = ["regular", "live", "custom"].includes(t.kind) ? t.kind : "regular";
    const name = (t.name || "").trim();
    const fixed = kind === "custom" ? "" : (name || KIND_FIXED[kind]);
    const customName = kind === "custom" ? name : "";
    const showId = (t.liveShowId || "ALL") + "";
    const note = window.__gopassLiveConfigured === false
      ? "ยังไม่ได้เชื่อมเว็บไลฟ์ — โค้ดจะถูกสร้างในเครื่อง โปรดตั้งค่า LIVE_API_URL / LIVE_API_SECRET"
      : "ผู้ซื้อจะได้รับโค้ด 1 ใบต่อ 1 บัตร และส่งเข้า Discord DM ให้ด้วย";
    return `<div class="ticket-type-row" data-kind="${kind}">
      <select class="type-kind" aria-label="รูปแบบประเภทบัตร">
        <option value="regular"${kind === "regular" ? " selected" : ""}>บัตรธรรมดา</option>
        <option value="live"${kind === "live" ? " selected" : ""}>บัตรLIVE</option>
        <option value="custom"${kind === "custom" ? " selected" : ""}>เขียนเอง</option>
      </select>
      <input class="type-name" placeholder="ชื่อประเภทบัตร" value="${esc(customName)}">
      <span class="type-name-fixed">${esc(fixed)}</span>
      <input class="type-desc" placeholder="คำอธิบายสั้น ๆ" value="${esc(t.description || "")}">
      <div class="type-price-wrap"><input class="type-price" type="number" min="0" step="1" placeholder="ราคา" value="${Number(t.price) || 0}" required><span>บาท</span></div>
      <button type="button" class="icon-btn danger remove-type" aria-label="ลบประเภท"><i class="fa-solid fa-trash"></i></button>
      <div class="type-live-extra">
        <span class="live-extra-label"><i class="fa-solid fa-tower-broadcast"></i> รอบไลฟ์ (AREAONE-LIVE)</span>
        <select class="type-live-show" aria-label="รอบไลฟ์">${liveShowOptions(showId)}</select>
        <small class="live-extra-note">${esc(note)}</small>
      </div>
    </div>`;
  };
  function renderTypes(types) { typeList.innerHTML = (types?.length ? types : [{ kind: "regular", name: "บัตรธรรมดา", description: "สิทธิ์เข้างานตามมาตรฐาน", price: 0 }]).map(typeRow).join(""); }
  function readTypes() {
    return [...typeList.querySelectorAll(".ticket-type-row")].map((r, i) => {
      const kind = r.querySelector(".type-kind").value;
      let name = (r.querySelector(".type-name").value || "").trim();
      if (kind !== "custom") name = KIND_FIXED[kind] || name;
      return { id: `type-${i + 1}`, kind, name, description: r.querySelector(".type-desc").value.trim(), price: Number(r.querySelector(".type-price").value), liveShowId: kind === "live" ? (r.querySelector(".type-live-show")?.value || "ALL") : "" };
    });
  }
  typeList.addEventListener("change", e => {
    const sel = e.target.closest(".type-kind");
    if (!sel) return;
    const row = sel.closest(".ticket-type-row");
    row.dataset.kind = sel.value;
    row.querySelector(".type-name-fixed").textContent = KIND_FIXED[sel.value] || "";
    if (sel.value === "custom") row.querySelector(".type-name").focus();
  });
  typeList.addEventListener("click",e=>{const btn=e.target.closest(".remove-type");if(btn){if(typeList.children.length<=1)return toast("ต้องมีประเภทบัตรอย่างน้อย 1 ประเภท","error");btn.parentElement.remove();}});
  document.getElementById("addTicketType")?.addEventListener("click",()=>typeList.insertAdjacentHTML("beforeend",typeRow()));
  async function draw(){rows.innerHTML=`<tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>`;try{cachedList=await adminApiFetch("/events");rows.innerHTML=cachedList.length?cachedList.map(e=>`<tr><td>${e.image?`<img class="thumb" src="${esc(e.image)}">`:"-"}</td><td><b>${esc(e.name)}</b><small>${dateTH(e.date)} · ${esc(e.time)} · ${esc(e.venue)}</small></td><td>${e.ticketMode==="seatmap"?`<span class="mode-badge"><i class="fa-solid fa-chair"></i> ผังที่นั่ง</span><br>${(window.seatCountOf?seatCountOf(e.seatMap):0).toLocaleString("th-TH")} ที่ · ${(e.ticketTypes||[]).length} โซน`:`<span class="mode-badge standing"><i class="fa-solid fa-people-group"></i> บัตรยืน</span><br>${(e.ticketTypes||[]).length} ประเภท`}<br>สูงสุด ${e.limitPerOrder||10} ใบ</td><td>${(e.ticketTypes||[]).map(t=>`${esc(t.name)} · ${Number(t.price)===0?"ฟรี":money(t.price)}`).join("<br>")}</td><td><span class="status status-${e.status==="เปิดขาย"?"open":e.status==="เร็ว ๆ นี้"?"soon":"closed"}">${esc(e.status)}</span></td><td><button class="icon-btn" onclick="editAdmin('${e.id}')"><i class="fa-solid fa-pen"></i></button><button class="icon-btn danger" onclick="deleteAdmin('${e.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`).join(""):`<tr><td colspan="6" class="table-loading">ยังไม่มีงานในระบบ</td></tr>`;}catch(e){rows.innerHTML=`<tr><td colspan="6" class="table-loading error">${esc(e.message)}</td></tr>`;}}
  window.openForm=()=>{editing=null;currentImage="";pendingFile=null;form.reset();renderTypes([{kind:"regular",name:"บัตรธรรมดา",description:"สิทธิ์เข้างานตามมาตรฐาน",price:1500}]);form.limitPerOrder.value=10;seatEditor=null;document.getElementById("seatEditor").innerHTML="";setMode("standing");document.getElementById("formTitle").textContent="เพิ่มคอนเสิร์ต";preview.classList.add("hide");modal.classList.remove("hide");};
  window.closeForm=()=>modal.classList.add("hide");
  window.deleteAdmin=async id=>{if(!confirm("ลบงานนี้หรือไม่? การลบไม่สามารถย้อนกลับได้"))return;try{await adminApiFetch(`/events/${encodeURIComponent(id)}`,{method:"DELETE"});toast("ลบงานเรียบร้อย");draw();}catch(e){toast(e.message,"error");}};
  window.editAdmin=id=>{const e=cachedList.find(x=>x.id===id);if(!e)return;editing=id;currentImage=e.image||"";pendingFile=null;form.name.value=e.name;form.date.value=e.date;form.time.value=e.time;form.venue.value=e.venue;form.limitPerOrder.value=e.limitPerOrder||10;form.status.value=e.status;renderTypes(e.ticketMode==="seatmap"?[]:(e.ticketTypes||[]));seatEditor=null;setMode(e.ticketMode==="seatmap"?"seatmap":"standing",e.ticketMode==="seatmap"?e.seatMap:null);if(currentImage){preview.src=currentImage;preview.classList.remove("hide");}else preview.classList.add("hide");document.getElementById("formTitle").textContent="แก้ไขคอนเสิร์ต";modal.classList.remove("hide");};
  file?.addEventListener("change",()=>{const f=file.files[0];if(!f)return;pendingFile=f;const r=new FileReader();r.onload=()=>{preview.src=r.result;preview.classList.remove("hide");};r.readAsDataURL(f);});
  form.addEventListener("submit",async ev=>{ev.preventDefault();const b=form.querySelector("button[type=submit]"),label=b.innerHTML;b.disabled=true;try{let imageUrl=currentImage;if(pendingFile){b.innerHTML=`<i class="fa-solid fa-spinner fa-spin"></i> กำลังอัปโหลด...`;const fd=new FormData();fd.append("poster",pendingFile);imageUrl=(await adminApiFetch("/upload",{method:"POST",body:fd})).url;}const mode=currentMode();let types,seatMap=null;if(mode==="seatmap"){const err=seatEditor?seatEditor.validate():"กรุณาออกแบบผังที่นั่ง";if(err)throw new Error(err);seatMap=seatEditor.getMap();types=seatMap.zones.map((z,i)=>({id:"z"+(i+1),name:z.name,description:"โซนที่นั่ง "+z.name,price:Number(z.price)}));}else{types=readTypes();if(!types.length||types.some(t=>!t.name||!Number.isFinite(t.price)||t.price<0))throw new Error("กรุณากรอกประเภทบัตรและราคาให้ครบ");}const payload={ticketMode:mode,name:form.name.value.trim(),date:form.date.value,time:form.time.value,venue:form.venue.value.trim(),regular:types[0].price,vip:types[1]?.price||0,status:form.status.value,image:imageUrl||"",limitPerOrder:Number(form.limitPerOrder.value)||10,ticketTypes:types};if(mode==="seatmap")payload.seatMap=seatMap;b.innerHTML=`<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...`;if(editing)await adminApiFetch(`/events/${encodeURIComponent(editing)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});else await adminApiFetch("/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});toast(editing?"บันทึกการแก้ไขแล้ว":"เพิ่มคอนเสิร์ตแล้ว");closeForm();draw();}catch(e){toast(e.message,"error");}finally{b.disabled=false;b.innerHTML=label;}});
  draw();
}

async function initDashboard(){
  if(!adminGuard())return;
  const statCards=document.getElementById("statCards"),table=document.getElementById("perEventTable"),recent=document.getElementById("recentOrders");
  try{const s=await adminApiFetch("/admin/stats");statCards.innerHTML=`<div class="stat-card"><i class="fa-solid fa-calendar-days"></i><div><small>งานทั้งหมด</small><b>${s.totalEvents}</b></div></div><div class="stat-card"><i class="fa-solid fa-bolt"></i><div><small>กำลังเปิดขาย</small><b>${s.onSale}</b></div></div><div class="stat-card"><i class="fa-solid fa-ticket"></i><div><small>บัตรที่กด</small><b>${s.totalTickets.toLocaleString("th-TH")}</b></div></div><div class="stat-card highlight"><i class="fa-solid fa-sack-dollar"></i><div><small>ยอดรวม</small><b>${money(s.totalRevenue)}</b></div></div>`;table.innerHTML=s.perEvent.map(e=>`<tr><td>${e.image?`<img class="thumb" src="${esc(e.image)}">`:"-"}</td><td><b>${esc(e.name)}</b></td><td>${e.orders} คำสั่งซื้อ<br>${e.ticketsSold} ใบ</td><td>${money(e.revenue)}</td></tr>`).join("")||`<tr><td colspan="4">ยังไม่มีข้อมูล</td></tr>`;recent.innerHTML=s.recentOrders.map(o=>`<li><span><b>${esc(o.queueCode||"-")}</b> ${esc(o.eventName)}</span><span>${esc(o.ticketName||o.ticketType)} × ${o.qty}</span></li>`).join("")||`<li>ยังไม่มีคำสั่งซื้อ</li>`;}catch(e){statCards.innerHTML=`<div class="empty error">${esc(e.message)}</div>`;}
}

async function initOrders(){
  if(!adminGuard())return;const tbody=document.getElementById("orderRows");try{const list=await adminApiFetch("/admin/orders");tbody.innerHTML=list.map(o=>{const b=o.buyer||{};return `<tr><td><strong>${esc(o.ticketNo||o.queueCode||"-")}</strong><small>${esc(o.queueCode||"-")} · ${new Date(o.createdAt).toLocaleString("th-TH")}</small></td><td><b>${esc(b.name||"-")}</b><small>${esc(b.phone||"-")} · ${esc(b.email||"-")}</small><small>Discord: ${esc(b.discord||"-")} · Roblox: ${esc(b.roblox||"-")}</small></td><td>${esc(o.eventName)}</td><td>${esc(o.ticketName||o.ticketType)}<small>${o.qty} ใบ${o.seatLabels?` · ที่นั่ง ${esc(o.seatLabels)}`:""}</small></td><td>${Number(o.total)===0?"ฟรี":money(o.total)}</td></tr>`}).join("")||`<tr><td colspan="5">ยังไม่มีรายการ</td></tr>`;}catch(e){tbody.innerHTML=`<tr><td colspan="5" class="table-loading error">${esc(e.message)}</td></tr>`;}
}
async function initCustomers(){
  if(!adminGuard())return;const tbody=document.getElementById("customerRows");try{const list=await adminApiFetch("/admin/customers");tbody.innerHTML=list.map(c=>`<tr><td><b>${esc(c.name||"-")}</b><small>${esc(c.phone||"-")}</small></td><td>${esc(c.email||"-")}</td><td>${esc(c.discord||"-")}</td><td>${esc(c.roblox||"-")}</td><td>${c.orders}</td><td>${c.tickets}</td><td>${money(c.total)}</td></tr>`).join("")||`<tr><td colspan="7">ยังไม่มีข้อมูลลูกค้า</td></tr>`;}catch(e){tbody.innerHTML=`<tr><td colspan="7" class="table-loading error">${esc(e.message)}</td></tr>`;}
}

async function initSettings(){
  if(!adminGuard())return;
  const f=document.getElementById("settingsForm");if(!f)return;
  const badge=document.getElementById("mntBadge");
  const isoToThaiLocal=iso=>{const d=new Date(iso);if(isNaN(d))return"";const t=new Date(d.getTime()+7*3600*1000);return t.toISOString().slice(0,16);};
  const thaiLocalToIso=v=>v?(v.length===16?v+":00+07:00":v):"";
  const renderBadge=m=>{
    if(!badge)return;
    const until=Date.parse(m.until);
    const on=!!m.enabled&&(!isFinite(until)||Date.now()<until);
    badge.className="mnt-badge "+(on?"on":"off");
    let txt=on?"กำลังปิดปรับปรุง":"เปิดใช้งานอยู่";
    if(on){const d=isoToThaiLocal(m.until);if(d){const p=d.split("T");txt+=" · เปิด "+p[0].split("-").reverse().join("/")+" "+p[1]+" น.";}}
    badge.innerHTML=`<i class="fa-solid fa-circle"></i> ${esc(txt)}`;
  };
  try{
    const s=await adminApiFetch("/admin/settings");const m=(s&&s.maintenance)||{};
    f.enabled.checked=!!m.enabled;
    f.until.value=isoToThaiLocal(m.until);
    f.title.value=m.title||"";
    f.message.value=m.message||"";
    f.note.value=m.note||"";
    f.showCountdown.checked=m.showCountdown!==false;
    renderBadge(m);
  }catch(e){toast(e.message,"error");}
  f.addEventListener("submit",async ev=>{
    ev.preventDefault();
    const btn=f.querySelector("button[type=submit]"),label=btn.innerHTML;btn.disabled=true;btn.innerHTML=`<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...`;
    try{
      const payload={maintenance:{enabled:f.enabled.checked,until:thaiLocalToIso(f.until.value),title:f.title.value.trim(),message:f.message.value.trim(),note:f.note.value.trim(),showCountdown:f.showCountdown.checked}};
      const saved=await adminApiFetch("/admin/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      toast("บันทึกการตั้งค่าแล้ว");renderBadge((saved&&saved.maintenance)||payload.maintenance);
    }catch(e){toast(e.message,"error");}
    finally{btn.disabled=false;btn.innerHTML=label;}
  });
}

/* =========================================================
   CHROME — marquee doubling + scroll reveal
   IntersectionObserver only, never a scroll listener.
   ========================================================= */
function initMarquee() {
  document.querySelectorAll(".marquee-track").forEach(track => {
    if (track.dataset.looped === "1") return;
    track.dataset.looped = "1";
    track.innerHTML += track.innerHTML;   // two identical runs => -50% loops seamlessly
  });
}

function initReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  const show = (el) => el.classList.add("is-in");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)) {
    items.forEach(show);
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      show(entry.target);
      obs.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  items.forEach(el => io.observe(el));

  /* A jump can carry a block right across the viewport between two frames,
     so the observer never catches it and it would sit at opacity 0 forever.
     Sweep once the scroll settles and settle anything already at or above the
     fold. One-way only, so it can never replay an entrance either. */
  let timer = 0;
  addEventListener("scroll", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll(".reveal:not(.is-in)").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          show(el);
          io.unobserve(el);
        }
      });
    }, 140);
  }, { passive: true });
}

/* Cursor spotlight on event cards. Delegated so cards rendered later by
   renderHome/renderEvents are covered. A pointermove listener, not a
   scroll listener; skipped entirely for touch and reduced motion. */
function initSpotlight() {
  if (document.body.dataset.spotlight === "1") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (matchMedia("(pointer: coarse)").matches) return;
  document.body.dataset.spotlight = "1";
  document.addEventListener("pointermove", (e) => {
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest(".event-card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(2) + "%");
    card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(2) + "%");
  });
}

/* The bottom tab bar is a set of real page links, so the active pill would
   normally teleport on reload. Static placement is handled in CSS (:has +
   --tab-i); this slides the pill to the tapped tab first, then navigates, so
   the highlight travels instead of warping. Pointer-modifier clicks and
   reduced-motion users keep the default instant navigation. */
function initTabbar() {
  const bar = document.querySelector(".tabbar");
  if (!bar) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const links = Array.from(bar.querySelectorAll("a"));
  const here = links.findIndex((a) => a.classList.contains("active"));
  links.forEach((a, i) => {
    a.addEventListener("click", (e) => {
      if (i === here) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      bar.style.setProperty("--tab-i", String(i));
      /* the veil starts blurring in alongside the pill travel */
      showLoader();
      setTimeout(() => { window.location.href = a.href; }, 300);
    });
  });
}

/* Every other internal link swap runs behind the same veil. Modifier clicks,
   new-tab targets, downloads, in-page anchors, off-site and same-URL links are
   left alone, and anything already handled (the tab bar pill) arrives with
   defaultPrevented set. */
function initLoaderNav() {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    const raw = a.getAttribute("href");
    if (!raw || raw.startsWith("#") || /^(javascript|mailto|tel):/i.test(raw)) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    e.preventDefault();
    loadPage(url.href);
  });
}

/* ---------- ผู้ใช้ที่ล็อกอินผ่าน Discord ---------- */
/* ปุ่ม "เข้าสู่ระบบ" ในหัวเว็บจะกลายเป็นชิปรูป + ชื่อ ทันทีที่มี session cookie
   ของ Discord อยู่ ไม่ต้องแก้ markup ซ้ำทุกหน้า และไม่เปิด loader รบกวนสายตา */
async function initUserChip() {
  const header = document.querySelector(".site-header");
  const btn = document.querySelector(".login-btn");
  if (!header && !btn) return;

  // The chip lives in the header next to the nav, so it shows up on every page
  // that has a header - not just the ones that happened to ship a login button.
  const mount = btn || header.querySelector(".nav");

  let data = null;
  try {
    const res = await fetch(API_BASE + "/auth/me", { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    data = await res.json();
  } catch { return; }
  const user = data && data.user;

  const nextParam = encodeURIComponent(location.pathname + location.search);

  if (!user || !user.id) {
    // Signed out: pages with a header but no login button still need a way in.
    if (!btn && mount && !header.querySelector(".login-btn")) {
      const link = document.createElement("a");
      link.className = "login-btn";
      link.href = `/login.html?next=${nextParam}`;
      link.innerHTML = `<i class="fa-brands fa-discord"></i>${document.documentElement.lang === "th" ? "เข้าสู่ระบบ" : "Sign in"}`;
      mount.appendChild(link);
    } else if (btn) {
      // จำหน้าที่กำลังดูอยู่ ไว้เด้งกลับมาหลังล็อกอิน
      btn.setAttribute("href", `/login.html?next=${nextParam}`);
    }
    return;
  }

  const chipLabel = document.documentElement.lang === "th" ? "บัตรของฉัน" : "My tickets";
  const chip = document.createElement("div");
  chip.className = "user-chip";
  chip.innerHTML =
    `<a class="user-chip-link" href="/mytickets.html" title="${chipLabel}">` +
    `<img class="user-chip-avatar" alt="" width="28" height="28" src="${esc(user.avatarUrl)}">` +
    `<span class="user-chip-name">${esc(user.displayName || user.username)}</span>` +
    `</a>` +
    `<button type="button" class="user-chip-out" title="ออกจากระบบ">` +
    `<i class="fa-solid fa-right-from-bracket"></i></button>`;
  if (btn) btn.replaceWith(chip);
  else mount.appendChild(chip);

  chip.querySelector(".user-chip-out").addEventListener("click", async (e) => {
    e.preventDefault();
    const out = chip.querySelector(".user-chip-out");
    out.disabled = true;
    try { await fetch(API_BASE + "/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    showLoader();
    location.href = "/login.html";
  });
}

/* Each piece is isolated: one throwing initializer must not stop the rest
   from wiring up (a dead user chip is a much smaller problem than a page
   with no smooth scroll, no tab bar and no login state at all). */
function bootChrome() {
  const parts = [
    ["marquee", initMarquee],
    ["reveal", initReveal],
    ["spotlight", initSpotlight],
    ["tabbar", initTabbar],
    ["loaderNav", initLoaderNav],
    ["smoothScroll", initSmoothScroll],
    ["userChip", initUserChip],
  ];
  for (const [name, fn] of parts) {
    try { fn(); } catch (e) { console.error("GOPASS init failed: " + name, e); }
  }
}
document.addEventListener("DOMContentLoaded", bootChrome);


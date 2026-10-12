/* =========================================================
   GOPASS · Seat Map (ผังที่นั่ง)
   - SeatMapEditor.create(el, map, {toast})  → หน้า admin ออกแบบผัง
   - SeatMap.renderPicker(el, event)          → หน้าลูกค้าเลือกที่นั่ง

   รูปแบบข้อมูล seatMap
   {
     rows, cols,
     rowLabels: ["A","B",...],
     cells:     ["0011100", ...]   // '0' = ไม่มีที่นั่ง, '1'..'9','a'..'z' = zone ลำดับที่ (base36)
     zones:     [{id:"z1", name, color:"#facc15", price}],
     stageLabel, stagePos: "top"|"bottom", labelSide: "left"|"right"|"both"
   }
   seat id = rowLabel + เลขคอลัมน์   เช่น A1, B12
   ========================================================= */
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => Number(n) === 0 ? "ฟรี" : Number(n).toLocaleString("th-TH") + " บาท";
  const COLORS = ["#facc15", "#f97316", "#22c55e", "#38bdf8", "#a78bfa", "#f472b6", "#14b8a6", "#eab308", "#ef4444", "#94a3b8", "#84cc16", "#06b6d4"];
  const MAX_ZONES = 12;

  const alphaLabel = i => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const cleanLabel = v => String(v || "").replace(/[^A-Za-z0-9\u0E00-\u0E7F]/g, "").slice(0, 4);
  const makeGrid = (rows, cols, v = 0) => Array.from({ length: rows }, () => Array(cols).fill(v));

  function seatCountOf(map) {
    if (!map || !Array.isArray(map.cells)) return 0;
    return map.cells.reduce((n, row) => n + [...String(row)].filter(ch => ch !== "0").length, 0);
  }
  window.seatCountOf = seatCountOf;

  /* ---------- กรอบเวทีแบบกำหนดเอง (ใช้ร่วมกันทั้งหน้า admin และหน้าลูกค้า) ----------
     แปลงค่า stageW/H/X/Y (อาจเป็น null = อัตโนมัติ) ให้เป็นช่องกริดจริง 1-based-safe
     คืน { x, y, w, h } โดย x/y เป็น index เริ่มต้น (0-based), w/h เป็นจำนวนช่อง/แถว */
  function stageBox(sm) {
    const cols = Math.max(1, Number(sm.cols) | 0), rows = Math.max(1, Number(sm.rows) | 0);
    const num = (v, min, max, fallback) => {
      const n = Number(v);
      const ok = v !== null && v !== "" && Number.isFinite(n);
      return Math.max(min, Math.min(max, ok ? Math.round(n) : fallback));
    };
    let w = num(sm.stageW, 1, cols, Math.max(1, Math.round(cols * 0.6)));
    let h = num(sm.stageH, 1, rows, 1);
    let x = num(sm.stageX, 0, Math.max(0, cols - w), Math.floor((cols - w) / 2));
    let y = num(sm.stageY, 0, Math.max(0, rows - h), 0);
    return { x, y, w, h };
  }

  /* ---------- แม่แบบผัง (คืน grid ของเลข zone: 0 = ว่าง, 1 = โซนแรก) ---------- */
  const PRESETS = {
    rect: { name: "สี่เหลี่ยมเต็ม", build: (r, c) => makeGrid(r, c, 1) },
    tshape: {
      name: "ทรงตัว T (แบบในภาพ)",
      build: (r, c) => {
        const g = makeGrid(r, c, 0), top = Math.max(1, Math.ceil(r * 0.55));
        const from = Math.floor(c * 0.2), to = Math.max(from + 1, Math.floor(c * 0.8));
        for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) g[i][j] = (i < top || (j >= from && j < to)) ? 1 : 0;
        return g;
      }
    },
    fan: {
      name: "พัด (แถวหลังกว้างกว่า)",
      build: (r, c) => {
        const g = makeGrid(r, c, 0);
        for (let i = 0; i < r; i++) {
          const w = Math.max(2, Math.round(c * (0.45 + 0.55 * (r === 1 ? 1 : i / (r - 1)))));
          const s = Math.floor((c - w) / 2);
          for (let j = s; j < s + w; j++) g[i][j] = 1;
        }
        return g;
      }
    },
    aisle: {
      name: "เว้นทางเดิน 2 ช่อง",
      build: (r, c) => {
        const g = makeGrid(r, c, 1), a = Math.floor(c / 3), b = Math.floor((2 * c) / 3);
        if (c >= 7) for (let i = 0; i < r; i++) { g[i][a] = 0; g[i][b] = 0; }
        return g;
      }
    },
  };

  /* =========================================================
     EDITOR (admin)
     ========================================================= */
  function createEditor(root, initial, opts = {}) {
    const notify = opts.toast || ((m) => alert(m));
    const uid = "sme" + Math.random().toString(36).slice(2, 7);
    const history = [];
    let tool = "paint";   // paint | erase | pan
    let brush = 0;        // index ของโซนที่ใช้ทาสี
    let painting = false, paintVal = 0, dirty = false;

    const defaultState = () => ({
      rows: 10, cols: 20,
      grid: makeGrid(10, 20, 1),
      rowLabels: Array.from({ length: 10 }, (_, i) => alphaLabel(i)),
      zones: [{ name: "Standard", color: COLORS[0], price: 1500 }],
      stageLabel: "STAGE", stagePos: "top", labelSide: "both",
      stageW: null, stageH: null, stageX: null, stageY: null, stageAlign: "center",
      bgImage: "", bgOpacity: 0.55,
    });
    const fromMap = m => {
      if (!m || !Array.isArray(m.cells)) return defaultState();
      return {
        rows: m.rows, cols: m.cols,
        grid: m.cells.map(row => [...String(row)].map(ch => ch === "0" ? 0 : parseInt(ch, 36))),
        rowLabels: [...m.rowLabels],
        zones: m.zones.map(z => ({ name: z.name, color: z.color, price: Number(z.price) })),
        stageLabel: m.stageLabel || "STAGE", stagePos: m.stagePos || "top", labelSide: m.labelSide || "both",
        stageW: (typeof m.stageW === "number" ? m.stageW : null), stageH: (typeof m.stageH === "number" ? m.stageH : null), stageX: (typeof m.stageX === "number" ? m.stageX : null), stageY: (typeof m.stageY === "number" ? m.stageY : null), stageAlign: m.stageAlign || "center",
        bgImage: typeof m.bgImage === "string" ? m.bgImage : "", bgOpacity: (typeof m.bgOpacity === "number" ? Math.max(0, Math.min(1, m.bgOpacity)) : 0.55),
      };
    };
    let st = fromMap(initial);

    const snapshot = () => {
      history.push(JSON.stringify({ rows: st.rows, cols: st.cols, grid: st.grid, rowLabels: st.rowLabels, zones: st.zones }));
      if (history.length > 40) history.shift();
    };

    root.innerHTML = `
      <div class="sme" id="${uid}">
        <div class="sme-bar">
          <label>แถว<input type="number" min="1" max="60" data-f="rows"></label>
          <label>คอลัมน์<input type="number" min="1" max="80" data-f="cols"></label>
          <label class="sme-grow">แม่แบบ
            <select data-f="preset">
              <option value="">— เลือกแม่แบบ (แทนที่ผังปัจจุบัน) —</option>
              ${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.name)}</option>`).join("")}
            </select>
          </label>
          <label>ชื่อแถว
            <select data-f="labels">
              <option value="">— ตั้งอัตโนมัติ —</option>
              <option value="asc">A, B, C …</option>
              <option value="desc">… C, B, A</option>
              <option value="num">1, 2, 3 …</option>
            </select>
          </label>
        </div>

        <div class="sme-zones-head"><b>โซนที่นั่ง &amp; ราคา</b><button type="button" class="btn light sme-mini" data-act="addZone"><i class="fa-solid fa-plus"></i> เพิ่มโซน</button></div>
        <div class="sme-zones" data-zones></div>

        <div class="sme-tools" role="toolbar" aria-label="เครื่องมือ">
          <button type="button" class="sme-tool" data-tool="paint"><i class="fa-solid fa-paintbrush"></i> ทาสี / เพิ่มที่นั่ง</button>
          <button type="button" class="sme-tool" data-tool="erase"><i class="fa-solid fa-eraser"></i> ลบที่นั่ง</button>
          <button type="button" class="sme-tool" data-tool="block"><i class="fa-solid fa-ban"></i> ว่าง (Obstacle)</button>
          <button type="button" class="sme-tool" data-tool="pan"><i class="fa-solid fa-hand"></i> เลื่อนดู</button>
          <span class="sme-sep"></span>
          <button type="button" class="sme-tool plain" data-act="undo"><i class="fa-solid fa-rotate-left"></i> ย้อนกลับ</button>
          <button type="button" class="sme-tool plain" data-act="clear"><i class="fa-solid fa-trash"></i> ล้างผัง</button>
        </div>
        <p class="sme-hint">คลิก/ลากบนช่องเพื่อทาสีตามโซนที่เลือก · ใช้เครื่องมือ "ว่าง (Obstacle)" ปิดช่องที่ไม่ขาย (เวที/ทางเดิน/เสา) · กด Shift ค้างเพื่อลบ · คลิกเลขคอลัมน์ (บน) หรือปุ่มท้ายแถวเพื่อเติม/ล้างทั้งคอลัมน์/แถว · พิมพ์แก้ชื่อแถวได้ที่ช่องซ้ายสุด · เลือก "กำหนดเอง" เพื่อวางเวทีตรงไหนก็ได้ในผัง</p>

        <div class="sme-stage-opts">
          <label>ป้ายเวที<input data-f="stageLabel" maxlength="60" placeholder="STAGE"></label>
          <label>ตำแหน่งเวที (Custom)<select data-f="stagePos"><option value="top">ด้านบนของผัง</option><option value="bottom">ด้านล่างของผัง</option><option value="custom">กำหนดเอง / Custom (วางเวทีตรงไหนก็ได้)</option></select></label>
          <label class="sm-hide-when-topbot">กว้างเวที (ช่อง)<input type="number" min="1" max="80" data-f="stageW" placeholder="auto"></label>
          <label class="sm-hide-when-topbot">สูงเวที (แถว)<input type="number" min="1" max="60" data-f="stageH" placeholder="1"></label>
          <label class="sm-hide-when-topbot">คอลัมน์เริ่ม<input type="number" min="0" max="79" data-f="stageX" placeholder="auto"></label>
          <label class="sm-hide-when-topbot">แถวเริ่ม<input type="number" min="0" max="59" data-f="stageY" placeholder="0"></label>
          <label class="sm-hide-when-topbot">จัดเวที<select data-f="stageAlign"><option value="center">กลาง</option><option value="left">ชิดซ้าย</option><option value="right">ชิดขวา</option></select></label>
          <label>แสดงชื่อแถว<select data-f="labelSide"><option value="both">ซ้ายและขวา</option><option value="left">ซ้าย</option><option value="right">ขวา</option></select></label>
        </div>

        <div class="sme-bg-opts">
          <div class="sme-bg-head"><b><i class="fa-regular fa-image"></i> รูปพื้นหลังผัง (ทำรูป แล้ววาดที่นั่งทับ)</b><span class="sme-bg-status" data-bg-status></span></div>
          <div class="sme-bg-row">
            <label class="sme-bg-file">อัปรูปจากเครื่อง
              <input type="file" accept="image/png,image/jpeg,image/webp" data-f="bgFile">
            </label>
            <label class="sme-grow">หรือวางลิงก์รูป
              <input data-f="bgImage" placeholder="/uploads/floorplan.png หรือ https://...">
            </label>
            <label class="sme-bg-op">ความชัดของรูป
              <input type="range" min="0" max="100" step="5" data-f="bgOpacity">
            </label>
            <button type="button" class="sme-tool plain" data-act="bgClear"><i class="fa-solid fa-image"></i> ลบรูปพื้นหลัง</button>
          </div>
          <small class="sme-bg-note">อัปรูปแปลน/ผังงาน venue แล้วใช้เครื่องมือด้านล่างวาดที่นั่งทับให้ตรงกับรูป · ปรับ "ความชัดของรูป" ให้จางลงเพื่อเห็นที่นั่งชัด</small>
        </div>

        <div class="sme-canvas">
          <div class="sme-stage sme-stage-top" data-stage-top></div>
          <div class="sme-scroll"><div class="sme-grid" data-grid></div></div>
          <div class="sme-stage sme-stage-bottom" data-stage-bottom></div>
        </div>
        <div class="sme-summary" data-summary></div>
      </div>`;

    const $ = sel => root.querySelector(sel);
    const gridEl = $("[data-grid]"), zonesEl = $("[data-zones]"), sumEl = $("[data-summary]");

    /* ----- zones ----- */
    function renderZones() {
      zonesEl.innerHTML = st.zones.map((z, i) => `
        <div class="sme-zone ${i === brush ? "active" : ""}" data-i="${i}">
          <label class="sme-pick" title="ใช้โซนนี้ทาสี"><input type="radio" name="${uid}-brush" ${i === brush ? "checked" : ""}><span></span></label>
          <input type="color" class="sme-zc" value="${esc(z.color)}" aria-label="สีโซน">
          <input class="sme-zn" value="${esc(z.name)}" maxlength="40" placeholder="ชื่อโซน" aria-label="ชื่อโซน">
          <div class="sme-zp-wrap"><input type="number" class="sme-zp" min="0" step="1" value="${Number(z.price) || 0}" aria-label="ราคา"><span>บาท</span></div>
          <small class="sme-zcount" data-zcount="${i}"></small>
          <button type="button" class="icon-btn danger" data-act="delZone" aria-label="ลบโซน"><i class="fa-solid fa-trash"></i></button>
        </div>`).join("");
      applyZoneVars();
    }
    function applyZoneVars() { st.zones.forEach((z, i) => gridEl.style.setProperty(`--zc${i + 1}`, z.color)); }

    /* ----- grid ----- */
    function renderGrid() {
      const { rows, cols, grid, rowLabels } = st;
      gridEl.style.gridTemplateColumns = `34px repeat(${cols}, 22px) 26px`;
      let h = `<span></span>`;
      for (let c = 0; c < cols; c++) h += `<button type="button" class="sme-ch" data-col="${c}" title="เติม/ล้างคอลัมน์ ${c + 1}">${c + 1}</button>`;
      h += `<span></span>`;
      for (let r = 0; r < rows; r++) {
        h += `<input class="sme-rl" data-row="${r}" value="${esc(rowLabels[r])}" maxlength="4" aria-label="ชื่อแถว ${r + 1}">`;
        for (let c = 0; c < cols; c++) {
          const v = grid[r][c];
          h += `<i class="sme-c ${v ? "on" : ""}" data-r="${r}" data-c="${c}" ${v ? `style="background:var(--zc${v})"` : ""}></i>`;
        }
        h += `<button type="button" class="sme-rf" data-rowfill="${r}" title="เติม/ล้างทั้งแถว"><i class="fa-solid fa-arrows-left-right"></i></button>`;
      }
      gridEl.innerHTML = h;
      mountBg();
      renderStage();
      updateSummary();
    }
    /* ----- รูปพื้นหลังผัง: วางเป็นเลเยอร์ absolute ทับพื้นที่ที่นั่ง (วัดจากเซลล์จริง) ----- */
    function mountBg() {
      const old = gridEl.querySelector(".sme-bg");
      if (old) old.remove();
      const img = document.createElement("img");
      img.className = "sme-bg";
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      gridEl.appendChild(img);
      applyBg();
      layoutBg();
    }
    function layoutBg() {
      const img = gridEl.querySelector(".sme-bg");
      if (!img) return;
      const cells = gridEl.querySelectorAll(".sme-c");
      if (!cells.length) { img.style.width = "0px"; img.style.height = "0px"; return; }
      const g = gridEl.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cells.forEach(c => {
        const b = c.getBoundingClientRect();
        if (b.left < minX) minX = b.left;
        if (b.top < minY) minY = b.top;
        if (b.right > maxX) maxX = b.right;
        if (b.bottom > maxY) maxY = b.bottom;
      });
      img.style.left = (minX - g.left) + "px";
      img.style.top = (minY - g.top) + "px";
      img.style.width = (maxX - minX) + "px";
      img.style.height = (maxY - minY) + "px";
    }
    function applyBg() {
      const img = gridEl.querySelector(".sme-bg");
      const field = $('[data-f="bgImage"]');
      const range = $('[data-f="bgOpacity"]');
      const status = $("[data-bg-status]");
      if (field && document.activeElement !== field) field.value = st.bgImage || "";
      if (range) range.value = String(Math.round((st.bgOpacity ?? 0.55) * 100));
      if (!img) return;
      if (st.bgImage) { img.src = st.bgImage; img.style.display = ""; img.style.opacity = String(st.bgOpacity ?? 0.55); }
      else { img.removeAttribute("src"); img.style.display = "none"; }
      if (status) status.textContent = st.bgImage ? "กำลังใช้รูปพื้นหลังอยู่" : "ยังไม่ได้ใส่รูปพื้นหลัง";
    }
    function renderStage() {
      const label = esc(st.stageLabel || "STAGE");
      const topEl = $("[data-stage-top]"), botEl = $("[data-stage-bottom]");
      topEl.innerHTML = st.stagePos === "top" ? label : "";
      botEl.innerHTML = st.stagePos === "bottom" ? label : "";
      topEl.classList.toggle("hide", st.stagePos !== "top");
      botEl.classList.toggle("hide", st.stagePos !== "bottom");
      syncStageFields();
      // เวทีแบบกำหนดเอง: วางทับบนกริดตามช่อง/แถวที่ตั้งไว้
      const prev = gridEl.querySelector(".sme-stage-inline");
      if (prev) prev.remove();
      if (st.stagePos === "custom") {
        const b = stageBox({ rows: st.rows, cols: st.cols, stageW: st.stageW, stageH: st.stageH, stageX: st.stageX, stageY: st.stageY, stageAlign: st.stageAlign });
        const ov = document.createElement("div");
        ov.className = "sme-stage-inline";
        ov.textContent = st.stageLabel || "STAGE";
        // แถวหัวเลขคอลัมน์คือกริดแถวที่ 1 และคอลัมน์ชื่อแถวคือกริดคอลัมน์ที่ 1
        ov.style.gridColumn = `${2 + b.x} / span ${b.w}`;
        ov.style.gridRow = `${2 + b.y} / span ${b.h}`;
        gridEl.appendChild(ov);
      }
    }
    function updateSummary() {
      const counts = st.zones.map(() => 0);
      st.grid.forEach(row => row.forEach(v => { if (v > 0 && counts[v - 1] !== undefined) counts[v - 1]++; }));
      const total = counts.reduce((a, b) => a + b, 0);
      const revenue = counts.reduce((a, n, i) => a + n * (Number(st.zones[i].price) || 0), 0);
      counts.forEach((n, i) => { const el = root.querySelector(`[data-zcount="${i}"]`); if (el) el.textContent = `${n.toLocaleString("th-TH")} ที่`; });
      sumEl.innerHTML = `<span><i class="fa-solid fa-chair"></i> ที่นั่งทั้งหมด <b>${total.toLocaleString("th-TH")}</b> ที่</span>
        <span><i class="fa-solid fa-layer-group"></i> <b>${st.zones.length}</b> โซน</span>
        <span><i class="fa-solid fa-sack-dollar"></i> รายได้สูงสุดถ้าขายหมด <b>${revenue.toLocaleString("th-TH")}</b> บาท</span>`;
    }
    function setCell(r, c, v) {
      if (st.grid[r]?.[c] === undefined || st.grid[r][c] === v) return;
      st.grid[r][c] = v; dirty = true;
      const el = gridEl.querySelector(`.sme-c[data-r="${r}"][data-c="${c}"]`);
      if (!el) return;
      el.classList.toggle("on", v > 0);
      el.style.background = v > 0 ? `var(--zc${v})` : "";
    }
    function resize(rows, cols) {
      rows = Math.max(1, Math.min(60, rows | 0)); cols = Math.max(1, Math.min(80, cols | 0));
      if (rows === st.rows && cols === st.cols) return;
      snapshot();
      const g = makeGrid(rows, cols, 0);
      for (let r = 0; r < Math.min(rows, st.rows); r++) for (let c = 0; c < Math.min(cols, st.cols); c++) g[r][c] = st.grid[r][c];
      const labels = Array.from({ length: rows }, (_, i) => st.rowLabels[i] ?? alphaLabel(i));
      st.rows = rows; st.cols = cols; st.grid = g; st.rowLabels = uniqueLabels(labels);
      syncFields(); renderGrid();
    }
    function uniqueLabels(labels) {
      const seen = new Set();
      return labels.map((l, i) => { let x = cleanLabel(l) || alphaLabel(i); while (seen.has(x.toLowerCase())) x = cleanLabel(x + "x") || alphaLabel(i + 26); seen.add(x.toLowerCase()); return x; });
    }
    function fillLine(cells, target) {
      snapshot();
      const all = cells.every(([r, c]) => st.grid[r][c] === target);
      cells.forEach(([r, c]) => setCell(r, c, all ? 0 : target));
      updateSummary();
    }

    /* ----- fields sync ----- */
    function syncFields() {
      $('[data-f="rows"]').value = st.rows; $('[data-f="cols"]').value = st.cols;
      $('[data-f="stageLabel"]').value = st.stageLabel; $('[data-f="stagePos"]').value = st.stagePos; $('[data-f="labelSide"]').value = st.labelSide;
      if ($('[data-f="stageW"]')) $('[data-f="stageW"]').value = st.stageW ?? "";
      if ($('[data-f="stageH"]')) $('[data-f="stageH"]').value = st.stageH ?? "";
      if ($('[data-f="stageX"]')) $('[data-f="stageX"]').value = st.stageX ?? "";
      if ($('[data-f="stageY"]')) $('[data-f="stageY"]').value = st.stageY ?? "";
      if ($('[data-f="stageAlign"]')) $('[data-f="stageAlign"]').value = st.stageAlign || "center";
      syncStageFields();
    }
    function syncStageFields() {
      root.querySelectorAll(".sm-hide-when-topbot").forEach(el => el.style.display = (st.stagePos === "custom") ? "" : "none");
    }
    function syncTools() {
      root.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
      gridEl.classList.toggle("pan", tool === "pan");
    }

    /* ----- รูปพื้นหลัง ----- */
    function normalizeBgUrl(v) {
      const s = String(v || "").trim();
      if (!s) return "";
      if (/^(https?:\/\/|\/|\.\/)/i.test(s)) return s;
      notify("ลิงก์รูปต้องเริ่มด้วย https:// หรือ /", "error");
      return st.bgImage || "";
    }
    async function uploadBg(file) {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return notify("ไฟล์รูปใหญ่เกิน 5MB", "error");
      const status = $("[data-bg-status]");
      if (status) status.textContent = "กำลังอัปโหลดรูป...";
      try {
        const fd = new FormData(); fd.append("poster", file);
        let token = ""; try { token = localStorage.getItem("gopass_admin_token") || ""; } catch { }
        const res = await fetch("/api/upload", { method: "POST", headers: token ? { Authorization: "Bearer " + token } : {}, body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.url) throw new Error(d.message || "อัปโหลดรูปไม่สำเร็จ");
        st.bgImage = d.url; applyBg();
        notify("อัปโหลดรูปพื้นหลังแล้ว");
      } catch (err) { notify(err.message, "error"); applyBg(); }
    }

    /* ----- events ----- */
    root.addEventListener("change", ev => {
      const f = ev.target.dataset?.f;
      if (f === "rows" || f === "cols") resize(+$('[data-f="rows"]').value, +$('[data-f="cols"]').value);
      else if (f === "preset" && ev.target.value) {
        snapshot();
        const p = PRESETS[ev.target.value];
        const raw = p.build(st.rows, st.cols);
        st.grid = raw.map(row => row.map(v => v > 0 ? Math.min(1, st.zones.length) : 0));
        ev.target.value = ""; renderGrid();
      } else if (f === "labels" && ev.target.value) {
        snapshot();
        const mode = ev.target.value;
        st.rowLabels = Array.from({ length: st.rows }, (_, i) => mode === "num" ? String(i + 1) : alphaLabel(mode === "desc" ? st.rows - 1 - i : i));
        ev.target.value = ""; renderGrid();
      } else if (f === "stageLabel") { st.stageLabel = ev.target.value; renderStage(); }
      else if (f === "stagePos") { st.stagePos = ev.target.value; renderStage(); syncStageFields(); }
      else if (f === "stageW" || f === "stageH" || f === "stageX" || f === "stageY") {
        const raw = String(ev.target.value).trim();
        st[f] = raw === "" ? null : (Number.isInteger(Number(raw)) ? Number(raw) : null);
        renderStage();
      }
      else if (f === "stageAlign") {
        const box = stageBox({ rows: st.rows, cols: st.cols, stageW: st.stageW, stageH: st.stageH, stageX: null });
        st.stageX = ev.target.value === "left" ? 0 : ev.target.value === "right" ? Math.max(0, st.cols - box.w) : Math.max(0, Math.floor((st.cols - box.w) / 2));
        st.stageAlign = ev.target.value === "left" ? "left" : ev.target.value === "right" ? "right" : "center";
        syncFields(); renderStage();
      }
      else if (f === "labelSide") { st.labelSide = ev.target.value; }
      else if (f === "bgImage") { st.bgImage = normalizeBgUrl(ev.target.value); applyBg(); }
      else if (f === "bgOpacity") { st.bgOpacity = Math.max(0, Math.min(1, (Number(ev.target.value) || 0) / 100)); applyBg(); }
      else if (f === "bgFile") { uploadBg(ev.target.files && ev.target.files[0]); ev.target.value = ""; }
      else if (ev.target.classList.contains("sme-rl")) {
        const r = +ev.target.dataset.row; const v = cleanLabel(ev.target.value);
        const dup = st.rowLabels.some((l, i) => i !== r && l.toLowerCase() === v.toLowerCase());
        if (!v || dup) { notify(!v ? "ชื่อแถวต้องไม่ว่าง" : `ชื่อแถว "${v}" ซ้ำกับแถวอื่น`, "error"); ev.target.value = st.rowLabels[r]; return; }
        st.rowLabels[r] = v; ev.target.value = v;
      }
      else if (ev.target.classList.contains("sme-zc")) { const i = +ev.target.closest(".sme-zone").dataset.i; st.zones[i].color = ev.target.value; applyZoneVars(); }
      else if (ev.target.classList.contains("sme-zn")) { const i = +ev.target.closest(".sme-zone").dataset.i; st.zones[i].name = ev.target.value.trim(); }
      else if (ev.target.classList.contains("sme-zp")) { const i = +ev.target.closest(".sme-zone").dataset.i; st.zones[i].price = Math.max(0, Number(ev.target.value) || 0); ev.target.value = st.zones[i].price; updateSummary(); }
      else if (ev.target.type === "radio" && ev.target.closest(".sme-zone")) { brush = +ev.target.closest(".sme-zone").dataset.i; tool = "paint"; zonesEl.querySelectorAll(".sme-zone").forEach((z, i) => z.classList.toggle("active", i === brush)); syncTools(); }
    });
    root.addEventListener("input", ev => {
      if (ev.target.classList.contains("sme-zc")) { const i = +ev.target.closest(".sme-zone").dataset.i; st.zones[i].color = ev.target.value; applyZoneVars(); }
      else if (ev.target.dataset?.f === "bgOpacity") { st.bgOpacity = Math.max(0, Math.min(1, (Number(ev.target.value) || 0) / 100)); applyBg(); }
    });

    root.addEventListener("click", ev => {
      const t = ev.target.closest("[data-tool],[data-act],[data-col],[data-rowfill]");
      if (!t || !root.contains(t)) return;
      if (t.dataset.tool) { tool = t.dataset.tool; syncTools(); return; }
      if (t.dataset.col !== undefined) { const c = +t.dataset.col; fillLine(Array.from({ length: st.rows }, (_, r) => [r, c]), tool === "erase" ? 0 : brush + 1); return; }
      if (t.dataset.rowfill !== undefined) { const r = +t.dataset.rowfill; fillLine(Array.from({ length: st.cols }, (_, c) => [r, c]), tool === "erase" ? 0 : brush + 1); return; }
      const act = t.dataset.act;
      if (act === "addZone") {
        if (st.zones.length >= MAX_ZONES) return notify(`เพิ่มได้สูงสุด ${MAX_ZONES} โซน`, "error");
        st.zones.push({ name: `โซน ${st.zones.length + 1}`, color: COLORS[st.zones.length % COLORS.length], price: 0 });
        brush = st.zones.length - 1; tool = "paint"; renderZones(); updateSummary(); syncTools();
      } else if (act === "delZone") {
        if (st.zones.length <= 1) return notify("ต้องมีอย่างน้อย 1 โซน", "error");
        const d = +t.closest(".sme-zone").dataset.i;
        snapshot();
        st.zones.splice(d, 1);
        st.grid = st.grid.map(row => row.map(v => v === 0 ? 0 : (v - 1 === d ? 1 : (v - 1 > d ? v - 1 : v))));
        if (brush >= st.zones.length) brush = st.zones.length - 1;
        renderZones(); renderGrid();
      } else if (act === "undo") {
        const prev = history.pop(); if (!prev) return notify("ไม่มีขั้นตอนให้ย้อนกลับ", "error");
        Object.assign(st, JSON.parse(prev));
        if (brush >= st.zones.length) brush = 0;
        syncFields(); renderZones(); renderGrid();
      } else if (act === "clear") {
        if (!confirm("ล้างที่นั่งทั้งหมดในผังนี้หรือไม่?")) return;
        snapshot(); st.grid = makeGrid(st.rows, st.cols, 0); renderGrid();
      } else if (act === "bgClear") {
        st.bgImage = ""; applyBg();
      }
    });

    /* ----- ลากทาสี (เมาส์ + ทัช) ----- */
    const cellAt = (x, y) => { const el = document.elementFromPoint(x, y)?.closest?.(".sme-c"); return el && gridEl.contains(el) ? el : null; };
    const paintEl = el => setCell(+el.dataset.r, +el.dataset.c, paintVal);
    gridEl.addEventListener("pointerdown", ev => {
      if (tool === "pan") return;
      const el = ev.target.closest(".sme-c"); if (!el) return;
      ev.preventDefault();
      snapshot(); dirty = false; painting = true;
      paintVal = (tool === "erase" || ev.shiftKey) ? 0 : brush + 1;
      if (tool === "block") paintVal = 0;
      paintEl(el);
      try { gridEl.setPointerCapture(ev.pointerId); } catch { }
    });
    gridEl.addEventListener("pointermove", ev => { if (!painting) return; const el = cellAt(ev.clientX, ev.clientY); if (el) paintEl(el); });
    const stop = () => { if (!painting) return; painting = false; if (!dirty) history.pop(); updateSummary(); };
    gridEl.addEventListener("pointerup", stop);
    gridEl.addEventListener("pointercancel", stop);

    /* ----- API ----- */
    function getMap() {
      return {
        rows: st.rows, cols: st.cols,
        rowLabels: [...st.rowLabels],
        cells: st.grid.map(row => row.map(v => v === 0 ? "0" : v.toString(36)).join("")),
        zones: st.zones.map((z, i) => ({ id: "z" + (i + 1), name: z.name, color: z.color, price: Number(z.price) || 0 })),
        stageLabel: (st.stageLabel || "STAGE").trim() || "STAGE", stagePos: st.stagePos, labelSide: st.labelSide,
        stageW: st.stageW, stageH: st.stageH, stageX: st.stageX, stageY: st.stageY, stageAlign: st.stageAlign,
        bgImage: st.bgImage || "", bgOpacity: (typeof st.bgOpacity === "number" ? st.bgOpacity : 0.55),
      };
    }
    function validate() {
      if (!seatCountOf(getMap())) return "ผังต้องมีที่นั่งอย่างน้อย 1 ที่";
      if (st.zones.some(z => !String(z.name).trim())) return "กรุณาตั้งชื่อโซนให้ครบ";
      const used = new Set(); st.grid.forEach(r => r.forEach(v => v > 0 && used.add(v)));
      const empty = st.zones.findIndex((_, i) => !used.has(i + 1));
      if (empty >= 0) return `โซน "${st.zones[empty].name}" ยังไม่มีที่นั่ง — ทาสีที่นั่งในผัง หรือลบโซนนี้`;
      if (new Set(st.rowLabels.map(l => l.toLowerCase())).size !== st.rows) return "ชื่อแถวซ้ำกัน";
      return "";
    }

    syncFields(); renderZones(); renderGrid(); syncTools();
    requestAnimationFrame(layoutBg);
    window.addEventListener("resize", () => { if (root.isConnected) layoutBg(); });
    return { getMap, validate, getSeatCount: () => seatCountOf(getMap()) };
  }
  window.SeatMapEditor = { create: createEditor };

  /* =========================================================
     PICKER (ลูกค้า)
     ========================================================= */
  async function renderPicker(el, e) {
    const sm = e.seatMap;
    if (!sm) { el.innerHTML = `<div class="empty error">งานนี้ยังไม่มีผังที่นั่ง</div>`; return; }
    const limit = Math.max(1, Number(e.limitPerOrder || 10));
    const sel = new Map();               // seatId -> seat
    let sold = new Set(), held = new Set();

    /* seat lookup */
    const seats = {};
    sm.cells.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === "0") return;
      const z = sm.zones[parseInt(ch, 36) - 1]; if (!z) return;
      const id = sm.rowLabels[r] + (c + 1);
      seats[id] = { id, row: sm.rowLabels[r], col: c + 1, zone: z.id, zoneName: z.name, color: z.color, price: Number(z.price) };
    }));
    const total = Object.keys(seats).length;
    const left = sm.labelSide === "left" || sm.labelSide === "both";
    const right = sm.labelSide === "right" || sm.labelSide === "both";

    const eventImage = e.image ? `<img src="${esc(e.image)}" alt="${esc(e.name)}">` : `<div class="ticket-event-image-fallback"><i class="fa-solid fa-music"></i></div>`;
    const stage = `<div class="seat-stage">${esc(sm.stageLabel || "STAGE")}</div>`;

    let grid = "";
    // รูปพื้นหลังผัง (ถ้าแอดมินอัปไว้): วางเป็นเลเยอร์ absolute ใต้ที่นั่ง (วัดพื้นที่จากที่นั่งจริง)
    const bgLayer = sm.bgImage
      ? `<img class="seat-bg" alt="" aria-hidden="true" src="${esc(sm.bgImage)}" style="opacity:${(typeof sm.bgOpacity === "number" ? sm.bgOpacity : 0.55)}">`
      : "";
    sm.cells.forEach((row, r) => {
      if (left) grid += `<span class="seat-rl">${esc(sm.rowLabels[r])}</span>`;
      [...row].forEach((ch, c) => {
        if (ch === "0") { grid += `<span class="seat-gap"></span>`; return; }
        const s = seats[sm.rowLabels[r] + (c + 1)];
        grid += `<button type="button" class="seat" data-id="${esc(s.id)}" style="--zc:${esc(s.color)}" aria-pressed="false" aria-label="ที่นั่ง ${esc(s.id)} โซน ${esc(s.zoneName)} ${esc(fmt(s.price))}" title="${esc(s.id)} · ${esc(s.zoneName)} · ${esc(fmt(s.price))}"></button>`;
      });
      if (right) grid += `<span class="seat-rl">${esc(sm.rowLabels[r])}</span>`;
    });
    const tpl = `${left ? "28px " : ""}repeat(${sm.cols}, var(--seat))${right ? " 28px" : ""}`;
    // เวทีแบบกำหนดเอง: วางเป็นช่องกริดทับตำแหน่งที่แอดมินตั้งไว้ (ไม่บังการคลิกที่นั่ง)
    let inlineStage = "";
    if (sm.stagePos === "custom") {
      const b = stageBox(sm);
      const colStart = (left ? 2 : 1) + b.x;
      inlineStage = `<div class="seat-stage-inline" style="grid-column:${colStart} / span ${b.w};grid-row:${1 + b.y} / span ${b.h}">${esc(sm.stageLabel || "STAGE")}</div>`;
    }

    el.innerHTML = `
    <div class="ticket-platform">
      <div class="ticket-stepper"><div class="ticket-step active"><span>01</span><div><b>เลือกบัตร</b><small>เลือกที่นั่ง</small></div></div><div class="ticket-step-line"></div><div class="ticket-step"><span>02</span><div><b>ข้อมูลผู้ซื้อ</b><small>ตรวจสอบรายการ</small></div></div><div class="ticket-step-line"></div><div class="ticket-step"><span>03</span><div><b>เสร็จสิ้น</b><small>รับรายการของคุณ</small></div></div></div>
      <section class="ticket-event-summary"><div class="ticket-event-thumb">${eventImage}</div><div class="ticket-event-copy"><span class="ticket-eyebrow">GOPASS</span><h1>${esc(e.name)}</h1><div class="ticket-event-meta"><span><i class="fa-regular fa-calendar"></i>${dateTH(e.date)}</span><span><i class="fa-regular fa-clock"></i>${esc(e.time)} น.</span><span><i class="fa-solid fa-location-dot"></i>${esc(e.venue)}</span></div></div><div class="ticket-hold"><i class="fa-solid fa-shield-halved"></i><span>สิทธิ์ของคุณถูกสำรองไว้</span><b id="timer">10:00</b></div></section>
      <div class="ticket-select-layout">
        <section class="ticket-main-panel seatmap-panel">
          <div class="panel-heading"><div><span class="ticket-eyebrow">SEAT MAP</span><h2>เลือกที่นั่ง</h2><p>แตะที่นั่งเพื่อเลือก · เลือกได้สูงสุด ${limit} ที่ต่อคำสั่งซื้อ</p></div>
            <div class="seat-zoom" role="group" aria-label="ซูมผัง"><button type="button" data-zoom="-1" aria-label="ซูมออก"><i class="fa-solid fa-magnifying-glass-minus"></i></button><button type="button" data-zoom="fit" aria-label="พอดีหน้าจอ"><i class="fa-solid fa-expand"></i></button><button type="button" data-zoom="1" aria-label="ซูมเข้า"><i class="fa-solid fa-magnifying-glass-plus"></i></button></div></div>
          <div class="seat-legend">
            ${sm.zones.map(z => `<span class="seat-legend-item"><i style="--zc:${esc(z.color)}"></i><b>${esc(z.name)}</b> ${esc(fmt(z.price))}</span>`).join("")}
            <span class="seat-legend-item"><i class="lg-selected"></i>ที่เลือก</span>
            <span class="seat-legend-item"><i class="lg-held"></i>กำลังถูกจอง</span>
            <span class="seat-legend-item"><i class="lg-sold"></i>ไม่ว่าง</span>
          </div>
          <div class="seat-viewport" id="seatViewport">
            <div class="seat-canvas" id="seatCanvas">
              ${sm.stagePos === "top" ? stage : ""}
              <div class="seat-grid" id="seatGrid" role="group" aria-label="ผังที่นั่ง" style="grid-template-columns:${tpl}">${bgLayer}${grid}${inlineStage}</div>
              ${sm.stagePos === "bottom" ? stage : ""}
            </div>
          </div>
          <div class="seat-availability" id="seatAvail"></div>
        </section>
        <aside class="ticket-side-panel"><div class="side-heading"><span class="ticket-eyebrow">YOUR ORDER</span><h2>ที่นั่งที่เลือก</h2></div>
          <div class="order-line"><span>เลือกแล้ว</span><b id="selCount">0 / ${limit} ที่</b></div>
          <ul class="seat-picked" id="seatPicked"></ul>
          <div class="order-total"><span>ยอดรวม</span><strong id="total">0 บาท</strong></div>
          <button class="btn red full checkout-btn" type="button" id="seatCheckout" disabled><span>ดำเนินการต่อ</span><i class="fa-solid fa-arrow-right"></i></button>
          <p class="checkout-note"><i class="fa-solid fa-lock"></i> ที่นั่งจะถูกสำรองให้คุณ 10 นาที ระหว่างกรอกข้อมูล</p>
        </aside>
      </div>
    </div>`;

    const $ = id => el.querySelector(id);
    const gridEl = $("#seatGrid"), viewport = $("#seatViewport");
    const btn = {}; gridEl.querySelectorAll(".seat").forEach(b => btn[b.dataset.id] = b);

    function paint() {
      for (const id in btn) {
        const b = btn[id], isSold = sold.has(id), isHeld = !isSold && held.has(id), isSel = sel.has(id);
        b.classList.toggle("is-sold", isSold);
        b.classList.toggle("is-held", isHeld);
        b.classList.toggle("is-selected", isSel && !isSold && !isHeld);
        b.disabled = isSold || isHeld;
        b.setAttribute("aria-pressed", isSel ? "true" : "false");
      }
      const list = [...sel.values()];
      const sum = list.reduce((a, s) => a + s.price, 0);
      $("#selCount").textContent = `${list.length} / ${limit} ที่`;
      $("#total").textContent = list.length ? fmt(sum) : "0 บาท";
      $("#seatPicked").innerHTML = list.length
        ? list.map(s => `<li><span class="sp-dot" style="--zc:${esc(s.color)}"></span><b>${esc(s.id)}</b><span class="sp-zone">${esc(s.zoneName)}</span><em>${esc(fmt(s.price))}</em><button type="button" data-remove="${esc(s.id)}" aria-label="เอาที่นั่ง ${esc(s.id)} ออก"><i class="fa-solid fa-xmark"></i></button></li>`).join("")
        : `<li class="seat-empty">ยังไม่ได้เลือกที่นั่ง</li>`;
      $("#seatCheckout").disabled = !list.length;
      const free = total - sold.size - [...held].filter(x => !sold.has(x)).length;
      $("#seatAvail").innerHTML = `<span>ว่าง <b>${free.toLocaleString("th-TH")}</b> จาก ${total.toLocaleString("th-TH")} ที่</span>`;
    }

    gridEl.addEventListener("click", ev => {
      const b = ev.target.closest(".seat"); if (!b || b.disabled) return;
      const id = b.dataset.id;
      if (sel.has(id)) sel.delete(id);
      else {
        if (sel.size >= limit) { toast(`เลือกที่นั่งได้สูงสุด ${limit} ที่ต่อคำสั่งซื้อ`, "error"); return; }
        sel.set(id, seats[id]);
      }
      paint();
    });
    $("#seatPicked").addEventListener("click", ev => { const r = ev.target.closest("[data-remove]"); if (r) { sel.delete(r.dataset.remove); paint(); } });

    /* ----- zoom ----- */
    let seatPx = 26;
    const bgEl = gridEl.querySelector(".seat-bg");
    function layoutBgLayer() {
      if (!bgEl) return;
      const cells = gridEl.querySelectorAll(".seat");
      if (!cells.length) return;
      const g = gridEl.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cells.forEach(c => { const b = c.getBoundingClientRect(); if (b.left < minX) minX = b.left; if (b.top < minY) minY = b.top; if (b.right > maxX) maxX = b.right; if (b.bottom > maxY) maxY = b.bottom; });
      bgEl.style.left = (minX - g.left) + "px"; bgEl.style.top = (minY - g.top) + "px";
      bgEl.style.width = (maxX - minX) + "px"; bgEl.style.height = (maxY - minY) + "px";
    }
    const setSeat = px => { seatPx = Math.max(12, Math.min(44, Math.round(px))); $("#seatCanvas").style.setProperty("--seat", seatPx + "px"); layoutBgLayer(); };
    const fit = () => {
      const labels = (left ? 28 : 0) + (right ? 28 : 0) + 24;
      const w = viewport.clientWidth - labels - (sm.cols - 1) * 4;
      setSeat(Math.max(16, Math.min(34, w / sm.cols)));
    };
    el.querySelector(".seat-zoom").addEventListener("click", ev => {
      const z = ev.target.closest("[data-zoom]")?.dataset.zoom; if (!z) return;
      if (z === "fit") fit(); else setSeat(seatPx + Number(z) * 4);
    });
    fit();
    requestAnimationFrame(layoutBgLayer);
    window.addEventListener("resize", () => { if (document.body.contains(el)) { fit(); layoutBgLayer(); } });

    /* ----- availability (polling) ----- */
    async function refresh(silent = true) {
      try {
        const d = await fetch(`/api/events/${encodeURIComponent(e.id)}/seats`, { cache: "no-store" }).then(r => r.json());
        sold = new Set(d.sold || []); held = new Set(d.held || []);
        const lost = [...sel.keys()].filter(id => sold.has(id) || held.has(id));
        lost.forEach(id => sel.delete(id));
        if (lost.length) toast(`ที่นั่ง ${lost.join(", ")} ถูกจองไปแล้ว`, "error");
        paint();
      } catch (err) { if (!silent) toast("โหลดสถานะที่นั่งไม่สำเร็จ", "error"); }
    }
    await refresh(false);
    const poll = setInterval(() => { if (!document.body.contains(el)) return clearInterval(poll); refresh(); }, 8000);

    /* ----- hold timer ----- */
    let sec = 600;
    const timerId = setInterval(() => {
      sec--;
      const t = document.getElementById("timer");
      if (t) t.textContent = `${String(Math.max(0, Math.floor(sec / 60))).padStart(2, "0")}:${String(Math.max(0, sec % 60)).padStart(2, "0")}`;
      if (sec <= 0) { clearInterval(timerId); sel.clear(); paint(); toast("หมดเวลาสำรองสิทธิ์ กรุณาเลือกที่นั่งใหม่", "error"); }
    }, 1000);

    /* ----- checkout ----- */
    $("#seatCheckout").addEventListener("click", async ev => {
      if (!sel.size) { toast("กรุณาเลือกที่นั่ง", "error"); return; }
      const b = ev.currentTarget, label = b.innerHTML;
      b.disabled = true; b.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> กำลังสร้างคำสั่งซื้อ...`;
      try {
        const order = await apiFetch("/orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: e.id, seats: [...sel.keys()], queueToken: sessionStorage.getItem("gopass_queue_token") || "" })
        });
        sessionStorage.setItem("gopass_checkout", JSON.stringify({
          eventId: e.id, ticketType: "seatmap", qty: order.qty, price: order.unitPrice, total: order.total,
          seats: order.seats, seatLabels: order.seatLabels, ticketName: order.ticketName,
          orderId: order.id, queueCode: order.queueCode, ticketNo: order.ticketNo
        }));
        sessionStorage.removeItem("gopass_queue_token"); sessionStorage.removeItem("gopass_queue_code");
        clearInterval(timerId); clearInterval(poll);
        loadPage(`buyer.html?id=${encodeURIComponent(e.id)}&order=${encodeURIComponent(order.id)}`);
      } catch (err) {
        toast(err.message, "error");
        if (err.data?.seats) err.data.seats.forEach(id => sel.delete(id));
        await refresh(); b.innerHTML = label; b.disabled = !sel.size;
      }
    });
    paint();
  }
  window.SeatMap = { renderPicker, seatCountOf };
})();

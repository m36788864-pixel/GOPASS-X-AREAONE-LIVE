/* =========================================================
   GOPASS · หน้ากาก "ปิดปรับปรุง" (Maintenance gate)
   - โหลดสคริปต์นี้เฉพาะ "หน้าเว็บลูกค้า" เท่านั้น
   - หน้า /admin/* ไม่โหลด จึงเข้าใช้งานได้ตามปกติ (แอดมินทำงานได้)
   - บังคับใช้กับ "ทุกคน" รวมถึงแอดมินที่ล็อกอินอยู่ (หน้าเว็บลูกค้าถูกปิด)
     ถ้าต้องการเข้าเว็บลูกค้าดูชั่วคราว: เปิดลิงก์ด้วย ?maintenance=off
   - สถานะ/ข้อความ/วันเวลาเปิด อ่านจาก /api/settings (ตั้งค่าได้ที่หน้าแอดมิน → ตั้งค่า)
   - ถ้าตั้งค่าเป็นปิด หรือเลยเวลาเปิดแล้ว ระบบจะปล่อยผ่านอัตโนมัติ
   ========================================================= */
(function () {
  var root = document.documentElement;

  try {
    /* ปิดชั่วคราวสำหรับการทดสอบ: เพิ่ม ?maintenance=off ท้ายลิงก์ */
    if (/(^|[?&])maintenance=off(=|&|$)/.test(location.search)) return;
    /* เพิ่งเช็คผ่านไม่นานในแท็บนี้ -> ไม่ต้องเช็คซ้ำ (กันหน้าจอกะพริบ) */
    var okAt = sessionStorage.getItem("gopass_mnt_ok");
    if (okAt && Date.now() - Number(okAt) < 120000) return;
  } catch (e) { /* localStorage ปิด -> ถือว่าเป็นผู้ใช้ทั่วไป */ }

  var done = false;
  function reveal() { if (done) return; done = true; root.style.visibility = ""; }
  function goToMaintenance() { if (done) return; done = true; location.replace("/maintenance.html"); }

  /* ซ่อนหน้าไว้ชั่วคราวระหว่างรอเช็คสถานะ เพื่อไม่ให้เห็นหน้าเว็บแวบขึ้นมาก่อน */
  root.style.visibility = "hidden";
  var timer = setTimeout(reveal, 4000);

  fetch("/api/settings", { cache: "no-store", credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var m = d && d.maintenance;
      if (m && m.enabled) {
        var until = Date.parse(m.until);
        if (!isFinite(until) || Date.now() < until) { clearTimeout(timer); goToMaintenance(); return; }
      }
      try { sessionStorage.setItem("gopass_mnt_ok", String(Date.now())); } catch (e) { }
      clearTimeout(timer);
      reveal();
    })
    .catch(function () { clearTimeout(timer); reveal(); });
})();

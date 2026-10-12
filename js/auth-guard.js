/* =========================================================
   GOPASS - Booking login guard
   ด่านกันคนที่ยังไม่ล็อกอินไม่ให้เข้ากระบวนการ "กดบัตร"
   ถ้ายังไม่มี session จะพาไปหน้า login และจำหน้าที่ตั้งใจจะไป (?next=)
   แล้วเด้งกลับมาที่เดิมหลังล็อกอินสำเร็จ
   ========================================================= */
(function () {
  function loginUrl(next) {
    return "/login.html?next=" + encodeURIComponent(next || "/");
  }

  /* คืนค่า user ถ้าล็อกอินอยู่ ถ้ายังไม่ล็อกอินจะ redirect ไปหน้า login แล้วคืน null */
  window.gopassRequireLogin = async function (next) {
    const target = next || (location.pathname + location.search);
    try {
      const res = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.user && data.user.id) return data.user;
      }
    } catch {
      /* ออฟไลน์/Network error -> ถือว่ายังไม่ล็อกอิน */
    }
    location.replace(loginUrl(target));
    return null;
  };

  /* ดึงข้อมูลผู้ใช้ปัจจุบันโดยไม่บังคับ redirect (สำหรับพื้นที่สาธารณะ) */
  window.gopassCurrentUser = async function () {
    try {
      const res = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      return (data && data.user) || null;
    } catch {
      return null;
    }
  };
})();

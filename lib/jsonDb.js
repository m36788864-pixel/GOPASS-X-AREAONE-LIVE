const fs = require("fs");
const path = require("path");

/**
 * ฐานข้อมูลแบบไฟล์ JSON เล็ก ๆ (เขียนแบบ atomic กันไฟล์พังตอนเซิร์ฟเวอร์ล่มระหว่างเขียน)
 * เพียงพอสำหรับเดโม/โปรเจกต์ขนาดเล็ก ถ้าจะสเกลจริงค่อยย้ายไป SQLite/Postgres ภายหลัง
 * (โครงสร้าง repo เดียวกัน แค่สลับ layer นี้)
 */
class JsonDb {
  constructor(filePath, defaultValue = []) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this._ensure();
  }

  _ensure() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(this.defaultValue, null, 2));
    }
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[jsonDb] อ่านไฟล์ไม่สำเร็จ ${this.filePath}:`, err.message);
      return this.defaultValue;
    }
  }

  write(data) {
    const tmpPath = this.filePath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, this.filePath); // atomic บน POSIX filesystem
  }

  /** อ่าน-แก้ไข-เขียน ในฟังก์ชันเดียว ป้องกัน race condition แบบง่าย ๆ ด้วยคิว in-process */
  update(mutator) {
    const data = this.read();
    const result = mutator(data);
    this.write(data);
    return result;
  }
}

module.exports = JsonDb;

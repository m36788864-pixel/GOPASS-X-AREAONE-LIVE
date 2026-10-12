# GOPASS × AREAONE-LIVE (รวมในโฟลเดอร์เดียว)

รวม **2 เว็บระบบ** ให้อยู่ด้วยกันในโฟลเดอร์เดียว พร้อมฟีเจอร์ขาย **"บัตร LIVE"**:
เมื่อผู้ซื้อกดบัตร LIVE สำเร็จ ระบบจะออก **โค้ดดูไลฟ์อัตโนมัติ 1 โค้ด/1 บัตร**
(รูปแบบ `AOL-XXXX-XXXX-XXXX`) แสดงบนหน้าใบเสร็จ/ประวัติการกดบัตร
และส่งเข้า **Discord DM** ให้ผู้ซื้อด้วยบอท

| เว็บ | เทคโนโลยี | อยู่ที่ |
| --- | --- | --- |
| GOPASS (กดบัตร/เช็คอิน/แอดมิน) | PHP + JSON files | รากของโฟลเดอร์นี้ (public_html) |
| AREAONE-LIVE (ดูไลฟ์/โค้ด/แชต) | Node.js + Express + PostgreSQL | `live/` |

---

## โครงสร้างโฟลเดอร์

```
GOPASS-X-AREAONE-LIVE/
├── index.html, events.html, buyer.html, receipt.html,
│   mytickets.html, admin/, api/ (PHP), js/, css/, images/
│   ├── config.php              ← ตั้งค่าการเชื่อมกับเว็บไลฟ์ (สร้างจาก config.php.example)
│   ├── data/                   ← ข้อมูลงาน/ออเดอร์/เซสชัน (สร้างอัตโนมัติ)
│   └── router.php / .htaccess  ← ตัวรัน PHP (local / Apache)
├── live/                       ← เว็บดูไลฟ์ AREAONE-LIVE (Node)
│   ├── server/                 ← Express API (มี /api/integration/* สำหรับออกโค้ด)
│   ├── public/                 ← หน้าเว็บดูไลฟ์ (index.html, admin.html)
│   ├── db/schema.sql           ← สร้างฐานข้อมูล Postgres
│   └── .env                    ← ตั้งค่า INTEGRATION_SECRET ฯลฯ
└── docs/                       ← เอกสารอ้างอิงเดิมของแต่ละเว็บ
```

### ทั้งสองเว็บลิงก์หากันอย่างไร

- **GOPASS → ไลฟ์**: เมนู "ดูไลฟ์" ใน header/tabbar (มือถือ) และ sidebar แอดมิน
  ชี้ไปที่ `GOPASS_LIVE_URL` ใน `js/app.js` (ค่าเริ่มต้น `/live/`)
- **ไลฟ์ → GOPASS**: เมนู "กดบัตร" ในหน้าเว็บดูไลฟ์ ชี้ไปที่ `TDL_TICKET_URL`
  ใน `live/public/index.html` (ค่าเริ่มต้น `/` = เว็บกดบัตรอยู่ root เดียวกัน)
- แอดมิน GOPASS มีหน้าเลือก **รอบไลฟ์** (GET `/api/admin/live-shows`)
  ตอนสร้างงานแบบบัตร LIVE

---

## วิธีตั้งค่า (สำคัญ)

### 1) ฝั่ง GOPASS (PHP) — `config.php`

คัดลอก `config.php.example` → `config.php` แล้วตั้งค่า:

```php
// ---- เชื่อมกับเว็บดูไลฟ์ AREAONE-LIVE (ออกโค้ดบัตร LIVE อัตโนมัติ) ----
'live_api_url'    => 'https://live.example.com',  // URL เว็บไลฟ์ (ถึงจากเครื่อง PHP ได้)
'live_api_secret' => 'สุ่มสตริงยาว ๆ ตรงกับ INTEGRATION_SECRET ของเว็บไลฟ์',
'live_site_url'   => 'https://live.example.com',   // ลิงก์หน้าที่ผู้ซื้อกดไปกรอกโค้ด
'live_code_prefix'=> 'AOL',

// บอท Discord สำหรับส่งโค้ดเข้าดูไลฟ์ทาง DM (ใช้แอปเดียวกับ Discord Login ได้)
'discord_bot_token' => 'MTIz...',
```

> ตั้งค่าแบบ env ก็ได้ (มีสิทธิ์เหนือกว่า config.php):
> `LIVE_API_URL`, `LIVE_API_SECRET`, `LIVE_SITE_URL`, `LIVE_CODE_PREFIX`, `DISCORD_BOT_TOKEN`

**หมายเหตุโค้ดดูไลฟ์**: ถ้าไม่ได้ตั้ง `LIVE_API_URL`/`LIVE_API_SECRET`
ระบบจะ **สร้างโค้ดในเครื่อง (fallback)** ให้แทน — ยังได้โค้ด `AOL-...` ครบจำนวน
แต่โค้ดชุดนั้น **อยู่ในฐานข้อมูลของเว็บไลฟ์** จะกรอกเข้าเว็บไลฟ์ไม่ได้จริง
(สำหรับทดสอบเท่านั้น) ควรตั้งทั้งสองค่าเสมอเพื่อให้โค้ดถูกสร้าง+บันทึกที่เว็บไลฟ์

### 2) ฝั่ง AREAONE-LIVE (Node) — `live/.env`

คัดลอก `live/.env.example` → `live/.env` แล้วตั้งค่า:

```
DATABASE_URL=postgresql://tdl:password@localhost:5432/tdl_live
INTEGRATION_SECRET=<สุ่มสตริงยาว ๆ — ต้องตรงกับ LIVE_API_SECRET ใน config.php ของ GOPASS>
```

แล้วสร้างฐานข้อมูลจาก `live/db/schema.sql` และรัน:

```bash
cd live
npm install
npm start        # ฟังที่พอร์ต 3000 (PORT ใน .env)
```

### 3) Discord DM (ส่งโค้ดเข้าห้องส่วนตัวผู้ซื้อ)

- บอทต้อง **อยู่ในเซิร์ฟเวอร์เดียวกับผู้ซื้อ** ไม่งั้น Discord ไม่ยอมให้ส่ง DM
- ผู้ซื้อต้อง**ล็อกอิน Discord ผ่านเว็บกดบัตร** (ระบบ OAuth เดิม) ก่อนสั่งซื้อ
  เพื่อให้ระบบรู้ `userId` — ออเดอร์ที่ไม่มี userId จะได้ผล `liveDm: no_discord_id`
  และโค้ดยังแสดงที่หน้าใบเสร็จตามปกติ
- ถ้าไม่ได้ตั้ง `DISCORD_BOT_TOKEN` ระบบจะข้ามการส่ง DM (ได้ผล `missing_bot_token`)
  ผู้ซื้อยังเห็นโค้ดที่หน้าใบเสร็จ/ประวัติการกดบัตรเสมอ

---

## วิธีขายบัตร LIVE (ขั้นตอนแอดมิน)

1. เข้าแอดมิน GOPASS → งาน/อีเวนต์ → **สร้างงาน** → โหมด "บัตรยืน"
2. เพิ่มประเภทบัตร → เลือกได้ **3 แบบเท่านั้น**: `บัตรธรรมดา` / `บัตรLIVE` / `เขียนเอง`
   - เลือก **บัตรLIVE** → ระบบให้เลือกรอบไลฟ์ (โหลดจากเว็บไลฟ์) + ตั้งราคา
3. เปิดขายงาน → ผู้ซื้อกดบัตร LIVE → กรอกข้อมูลผู้ซื้อ → **กดยืนยัน**
4. ระบบอัตโนมัติ: ออกโค้ด `AOL-XXXX-XXXX-XXXX` ตามจำนวนบัตร
   (ผ่าน `/api/integration/codes` ของเว็บไลฟ์) → เก็บในออเดอร์ → ส่ง Discord DM
5. ผู้ซื้อดูโค้ดได้ที่หน้า **ใบเสร็จ** และ **ประวัติการกดบัตร (mytickets)**
   พร้อมปุ่มลิงก์ไปหน้าเว็บดูไลฟ์
6. ผู้ซื้อกรอกโค้ดที่เว็บดูไลฟ์ (เลือกรอบให้ตรง — ค่า `ALL` = ทุกรอบ)

---

## รันแบบ local (ทดสอบครบชุด — แนะนำ)

ใช้ **`START-ALL.bat`** (ดับเบิลคลิกจากรากโฟลเดอร์) จะเปิดทั้งสองเซิร์ฟเวอร์:

| ระบบ | URL | ต้องมี |
| --- | --- | --- |
| GOPASS (กดบัตร) | http://127.0.0.1:8080/ | PHP 8.1+ |
| AREAONE-LIVE (ดูไลฟ์) | http://127.0.0.1:3000/ | Node.js + **Postgres** (ตั้ง `DATABASE_URL` ใน `live/.env`) |

หรือรันเอง:

```bash
# GOPASS (จากรากโฟลเดอร์)
php -S 127.0.0.1:8080 router.php     # หรือ START-GOPASS-PHP.bat

# AREAONE-LIVE (อีกหน้าต่าง)
cd live
copy .env.example .env               # แล้วใส่ DATABASE_URL จริง
npm install && npm start             # http://127.0.0.1:3000
```

### ลิงก์ "ดูไลฟ์" / "กดบัตร" เดา URL ให้อัตโนมัติ

- **เปิดเป็นไฟล์ (`file://`)** → ดูไลฟ์เปิด `live/index.html` ในโฟลเดอร์เดียวกัน / กดบัตรเปิด `../index.html`
- **รันที่ localhost** → ดูไลฟ์ชี้ `http://127.0.0.1:3000/` / กดบัตรชี้ `http://127.0.0.1:8080/`
- **ขึ้นโดเมนจริง** → ดูไลฟ์ชี้ `/live/` (ต้องมี reverse proxy ไปยังพอร์ต Node) / กดบัตรชี้ `/`

Override ได้เสมอ: ฝั่งกดบัตรตั้ง `window.GOPASS_LIVE_URL` ก่อนโหลด `app.js` (หรือแก้ `js/app.js`) ฝั่งไลฟ์ตั้ง `TDL_TICKET_URL` ใน `live/public/index.html` (เช่น แยกโดเมนกันจริง ๆ). ตั้ง `"off"` เพื่อซ่อนปุ่ม.

---

## หมายเหตุการ deploy

- **cPanel/Apache**: อัปโหลดทั้งโฟลเดอร์ไปที่ `public_html`
  `.htaccess` ส่ง `/api/*` ไปที่ `api/index.php` ให้อัตโนมัติ
  ฝั่งไลฟ์รัน Node บนพอร์ตของตัวเอง แล้วตั้ง `live_api_url`/`live_site_url` ให้ตรง
  (หรือทำ reverse proxy `/live/` → พอร์ต Node ถ้าอยากให้อยู่ path เดียวกัน)
- **Render/Docker**: โฟลเดอร์ `live/` มี `Dockerfile`/`docker-compose.yml` ในตัว
  ส่วน GOPASS เป็น PHP ธรรมดา รันได้กับ PHP 8.1+
- ไฟล์ลับ (`config.php`, `.env*`, `data/*`) ถูกบล็อกโดยตรงจาก web อยู่แล้ว
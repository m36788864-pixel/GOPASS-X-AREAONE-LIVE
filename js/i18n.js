
(() => {
  const STORAGE_KEY = "gopass-language";
  let lang = localStorage.getItem(STORAGE_KEY) || "th";
  let applying = false;

  const dict = {
    /* ---------- global / navigation ---------- */
    "หน้าแรก": "Home",
    "คอนเสิร์ต": "Concerts",
    "ปฏิทิน": "Calendar",
    "บัญชี": "Account",
    "เข้าสู่ระบบ": "Login",
    "ออกจากระบบ": "Logout",
    "กดบัตรคอนเสิร์ต": "Get Concert Tickets",
    "ง่าย • เร็ว • พร้อมลุย": "Easy • Fast • Ready",
    "ดูคอนเสิร์ต": "Browse Concerts",
    "งานที่กำลังเปิดขาย": "Events Now On Sale",
    "ดูทั้งหมด": "View All",
    "ข่าวสาร / อัปเดต": "News / Updates",
    "ช่องทางการติดต่อ": "Contact Us",
    "ติดตามข่าวสารและสอบถามข้อมูลเพิ่มเติม": "Follow our news and contact us for more information.",
    "กลับหน้าแรก": "Back to Home",
    "กลับหน้าเว็บหลัก": "Back to Main Site",
    "ค้นหาชื่องาน...": "Search event name...",

    /* ---------- event listing / detail ---------- */
    "คอนเสิร์ตทั้งหมด": "All Concerts",
    "คอนเสิร์ตทั้งหมด | GOPASS": "All Concerts | GOPASS",
    "งานที่เพิ่มจาก Admin จะแสดงตรงนี้อัตโนมัติ": "Events added by Admin will appear here automatically.",
    "ข้ามไปยังรายชื่อคอนเสิร์ต": "Skip to concert list",
    "รายละเอียดงาน": "Event Details",
    "รายละเอียดงาน | GOPASS": "Event Details | GOPASS",
    "ข้ามไปยังรายละเอียดงาน": "Skip to event details",
    "เลือกบัตร": "Choose Tickets",
    "เลือกบัตร | GOPASS": "Choose Tickets | GOPASS",
    "ข้ามไปยังตัวเลือกบัตร": "Skip to ticket options",
    "งาน": "Event",
    "วันที่": "Date",
    "เวลา": "Time",
    "สถานที่": "Venue",
    "ประเภท": "Type",
    "สถานะ": "Status",
    "จำนวน": "Quantity",
    "ราคา": "Price",
    "ฟรี": "Free",
    "ยกเลิก": "Cancel",
    "เสร็จสิ้น": "Done",
    "ยืนยัน": "Confirm",
    "ถัดไป": "Next",
    "ย้อนกลับ": "Back",
    "ชำระเงิน": "Payment",
    "บัตร": "Ticket",
    "กดบัตร": "Get Tickets",
    "เข้างาน": "Enter Event",

    /* ---------- ticket types ---------- */
    "ประเภทบัตร": "Ticket Type",
    "บัตรธรรมดา": "Regular Ticket",
    "บัตร VIP": "VIP Ticket",
    "สิทธิ์เข้างานตามมาตรฐาน": "Standard event admission",
    "สิทธิ์พิเศษสำหรับผู้ถือบัตร VIP": "Special benefits for VIP ticket holders",
    "เพิ่มบัตร": "Add Ticket",
    "เพิ่มประเภท": "Add Type",
    "ชื่อ": "Name",
    "คำอธิบาย": "Description",
    "จำกัดต่อคำสั่งซื้อ": "Limit per Order",
    "บันทึก": "Save",
    "แก้ไข": "Edit",
    "ลบ": "Delete",
    "จัดการ": "Manage",
    "ราคา 0 บาทถือเป็นบัตรฟรี": "A price of 0 makes it a free ticket",

    /* ---------- loading / errors ---------- */
    "กำลังโหลด": "Loading",
    "กำลังโหลด...": "Loading...",
    "กำลังเชื่อมต่อระบบคิว...": "Connecting to the queue system...",
    "กำลังโหลดสรุปยอดขาย...": "Loading sales summary...",
    "กำลังโหลดข้อมูลของงาน...": "Loading event data...",
    "รอข้อมูล": "Waiting for data",
    "โหลดข้อมูลไม่สำเร็จ": "Failed to load data",
    "ยังไม่มีงานที่เปิดขาย": "No events are currently on sale",

    /* ---------- home ---------- */
    "เลือกงานที่ต้องการ ดูรายละเอียด และเข้าสู่ระบบกดบัตรได้ในไม่กี่ขั้นตอน": "Choose an event, view the details, and sign in to get your tickets in just a few steps.",
    "ไม่ต้องต่อคิวยาว": "No long queues",
    "ระบบกดบัตรอัตโนมัติ ไม่ต้องรอคิวยาว และทุกใบผูกกับคิวของคุณเอง": "Automatic ticketing with no queueing, and every ticket is linked to your own queue number.",
    "รับหมายเลขบัตรทันที": "Instant ticket numbers",
    "ระบบจับคิวให้อัตโนมัติตั้งแต่กดบัตร ไม่ต้องรอหน้าเว็บ": "The queue is assigned automatically as soon as you request a ticket.",
    "ได้หมายเลขบัตรทันที": "Get your ticket number right away",
    "แสดงเลขบัตรและเลขคิวของคุณทันทีที่กดสำเร็จ": "Your ticket number and queue number appear the moment your request succeeds.",
    "ทีมงานเห็นรายการครบทุกใบ": "Staff see every ticket in the list",
    "แอดมินตรวจสอบผู้ซื้อและยอดรวมได้จากหน้าเดียว": "Admins can review buyers and totals on a single screen.",
    "เช็คอินที่จุดเข้างานได้เลย": "Check in at the gate instantly",
    "สแกนหมายเลขบัตรที่จุดรับเข็ม แล้วเข้างานได้ทันที": "Scan the ticket number at the counter and walk straight in.",
    "ทำไมคนยังเลือกกดบัตรผ่าน GOPASS": "Why people still choose GOPASS",
    "จากเลือกงานถึงเข้างาน ในสามคำสั่ง": "From picking an event to entering, in three actions",
    "ดูวัน เวลา สถานที่ และราคาบัตรของทุกงานที่เปิดขาย": "See the date, time, venue, and ticket price of every event on sale.",
    "เลือกประเภทบัตรและจำนวน ระบบจะกดบัตรและจองคิวให้อัตโนมัติ": "Pick a ticket type and quantity, and the system requests the ticket and reserves your queue automatically.",
    "รับเลขบัตรและเลขคิวไปยืนยันที่จุดเข้างานได้เลย": "Bring your ticket and queue numbers to the gate for verification.",

    /* ---------- queue ---------- */
    "รอคิว | GOPASS": "Queue | GOPASS",
    "กำลังจัดคิวให้คุณ": "Assigning your queue",
    "ระบบออกหมายเลขคิวจริงให้แล้ว กรุณารอจนถึงขั้นตอนเลือกบัตร": "Your real queue number has been issued. Please wait for the ticket selection step.",
    "คิวก่อนหน้า": "Ahead of you",
    "คิว": "Queue",
    "เลขคิว": "Queue Number",
    "กรุณาเลือกงานก่อน": "Please select an event first",

    /* ---------- buyer form ---------- */
    "ข้อมูลผู้ซื้อ | GOPASS": "Buyer Information | GOPASS",
    "ข้ามไปยังฟอร์มข้อมูลผู้ซื้อ": "Skip to the buyer form",
    "ข้อมูลผู้ซื้อ": "Buyer Information",
    "ข้อมูลนี้จะถูกบันทึกในคำสั่งซื้อเพื่อให้ทีมงานตรวจสอบได้": "This data is saved with the order so the team can verify it.",
    "ชื่อ-นามสกุล": "Full Name",
    "ชื่อสำหรับออกข้อมูลการสั่งซื้อ": "Name used on the order",
    "เบอร์โทรศัพท์": "Phone Number",
    "ใช้สำหรับติดต่อเกี่ยวกับคำสั่งซื้อ": "Used to contact you about the order",
    "อีเมล": "Email",
    "ใช้สำหรับอ้างอิงรายการสั่งซื้อ": "Used as a reference for the order",
    "ภาษาอังกฤษ / ตัวเลข / . _ - เท่านั้น": "English / numbers / . _ - only",
    "ภาษาอังกฤษ / ตัวเลข / _ เท่านั้น": "English / numbers / _ only",
    "ระบบจะไม่รับอักขระภาษาไทยใน Discord และ Roblox เพื่อป้องกันข้อมูลผิดรูปแบบ": "Thai characters are not accepted in Discord and Roblox to keep the data valid.",
    "ยืนยันข้อมูลและไปใบเสร็จ": "Confirm and go to receipt",
    "กลับไปแก้ไขจำนวนบัตร": "Back to edit ticket quantity",
    "สรุปรายการ": "Order Summary",
    "ชื่อผู้ซื้อ": "Buyer",
    "ผู้ซื้อ": "Buyer",
    "ยอดรวม": "Total",

    /* ---------- receipt ---------- */
    "ใบเสร็จ | GOPASS": "Receipt | GOPASS",
    "ทำรายการสำเร็จ": "Order complete",
    "ระบบบันทึกข้อมูลการสั่งซื้อของคุณแล้ว": "Your order has been recorded.",
    "เลขที่รายการ": "Order Number",
    "บันทึกใบเสร็จ JPG": "Save receipt as JPG",
    "GOPASS · กรุณาเก็บใบเสร็จนี้ไว้สำหรับตรวจสอบรายการ": "GOPASS · Keep this receipt for your records",
    "ใบเสร็จ": "Receipt",

    /* ---------- my tickets (ประวัติการกดบัตร) ---------- */
    "บัตรของฉัน": "My Tickets",
    "บัตรของฉัน | GOPASS": "My Tickets | GOPASS",
    "ประวัติการกดบัตรทั้งหมดของคุณจะแสดงที่นี่": "Your full ticket history will appear here.",
    "รายการทั้งหมด": "All orders",
    "ยืนยันแล้ว": "Confirmed",
    "รอกรอกข้อมูล": "Awaiting details",
    "บัตรทั้งหมด": "Tickets",
    "ดูใบเสร็จ": "View receipt",
    "กรอกข้อมูลต่อ": "Complete details",
    "คุณยังไม่มีประวัติการกดบัตร": "You have no ticket history yet",
    "ไปกดบัตรกันเลย": "Browse concerts",
    "โหลดประวัติการกดบัตรไม่สำเร็จ": "Could not load your ticket history",

    /* ---------- auth ---------- */
    "เข้าสู่ระบบ | GOPASS": "Login | GOPASS",
    "เข้าสู่ระบบด้วย Discord เพื่อกดบัตร": "Sign in with Discord to get tickets",
    "ตอนนี้เป็น Demo Login เพื่อให้ทดสอบหน้าเว็บได้ทันที": "This is a demo login so you can test the site right away.",
    "สมัครสมาชิก | GOPASS": "Register | GOPASS",
    "ระบบนี้ใช้ Discord Login เป็นหลัก": "This system primarily uses Discord Login.",
    "ไปหน้า Login": "Go to Login",
    "สมัครสมาชิก": "Register",
    "ชื่อผู้ใช้": "Username",
    "รหัสผ่าน": "Password",
    "ผู้ดูแลระบบ": "Administrator",

    /* ---------- admin: shell ---------- */
    "แดชบอร์ด": "Dashboard",
    "แดชบอร์ด | GOPASS ADMIN": "Dashboard | GOPASS ADMIN",
    "ยอดขาย": "Sales",
    "ยอดขาย | GOPASS ADMIN": "Sales | GOPASS ADMIN",
    "คำสั่งซื้อ": "Orders",
    "คำสั่งซื้อทั้งหมด": "All Orders",
    "คำสั่งซื้อทั้งหมด | GOPASS ADMIN": "All Orders | GOPASS ADMIN",
    "ลูกค้า": "Customers",
    "ลูกค้า | GOPASS ADMIN": "Customers | GOPASS ADMIN",
    "เช็คอิน": "Check-in",
    "เช็คอิน | GOPASS ADMIN": "Check-in | GOPASS ADMIN",
    "รายงาน | GOPASS ADMIN": "Report | GOPASS ADMIN",

    /* ---------- admin: dashboard ---------- */
    "ภาพรวมยอดขายและรายการล่าสุดของทุกงาน": "An overview of sales and the latest orders across all events.",
    "ดูยอดขาย": "View sales",
    "เพิ่มงานใหม่": "Add new event",
    "ยอดขายรายงาน": "Sales by report",
    "ดูคำสั่งซื้อทั้งหมด": "View all orders",
    "คำสั่งซื้อ / บัตร": "Orders / Tickets",
    "คำสั่งซื้อล่าสุด": "Latest orders",
    "ยอดขายรวม": "Total Sales",
    "บัตรขายแล้ว": "Tickets Sold",
    "เช็คอินแล้ว": "Checked In",

    /* ---------- admin: events ---------- */
    "จัดการงาน": "Manage Events",
    "จัดการคอนเสิร์ต": "Manage Concerts",
    "จัดการคอนเสิร์ต | GOPASS ADMIN": "Manage Concerts | GOPASS ADMIN",
    "สร้างงาน กำหนดประเภทบัตร ราคา และจำนวนสูงสุดต่อคำสั่งซื้อ": "Create events, set ticket types and prices, and cap the quantity per order.",
    "เพิ่มคอนเสิร์ต": "Add Concert",
    "รายการคอนเสิร์ต": "Concert List",
    "ข้อมูลที่บันทึกจะขึ้นหน้าเว็บทันที": "Saved data appears on the public site immediately.",
    "กำหนดข้อมูลหน้างานและประเภทบัตรให้ครบก่อนเปิดขาย": "Complete the event details and ticket types before opening sales.",
    "ชื่อคอนเสิร์ต": "Concert Name",
    "เพิ่มได้หลายประเภท และตั้งราคา 0 บาทเป็นบัตรฟรีได้": "Add multiple types, and set a price of 0 for a free ticket.",
    "จำกัดการกดต่อคำสั่งซื้อ": "Limit per Order",
    "ผู้ซื้อ 1 คำสั่งซื้อเลือกได้สูงสุดกี่ใบ": "Maximum tickets one buyer can select per order",
    "เปิดขาย": "On Sale",
    "เร็ว ๆ นี้": "Coming Soon",
    "ปิดการขาย": "Sales Closed",
    "Poster / รูปงาน": "Poster / Image",
    "JPG, PNG, WEBP, GIF ขนาดไม่เกิน 5MB": "JPG, PNG, WEBP, GIF up to 5MB",
    "บันทึกคอนเสิร์ต": "Save Concert",
    "บันทึกการแก้ไข": "Save Changes",
    "เพิ่มงาน": "Add Event",

    /* ---------- admin: orders / customers ---------- */
    "รายการซื้อ ผู้ซื้อ ประเภทบัตร และยอดรวมทั้งหมด": "All purchases, buyers, ticket types, and totals.",
    "หมายเลข / คิว / เวลา": "No. / Queue / Time",
    "รายชื่อผู้ซื้อที่มีคำสั่งซื้อกับ GOPASS": "Buyers with orders on GOPASS",
    "ชื่อ / เบอร์โทร": "Name / Phone",
    "ค้นหาชื่อผู้ซื้อหรือเบอร์โทร...": "Search name or phone number...",

    /* ---------- admin: sales ---------- */
    "สรุปยอดขายบัตรของงาน": "Event Ticket Sales Summary",
    "เลือกงาน": "Select Event",
    "ดูจำนวนบัตร ออเดอร์ รายได้ และสถานะการเช็คอินของแต่ละงานจากข้อมูลจริง": "See ticket counts, orders, revenue, and check-in status for each event from live data.",
    "ยอดขายแยกตามประเภทบัตร": "Sales by Ticket Type",
    "รายชื่อผู้ซื้อและข้อมูลคำสั่งซื้อ": "Buyers and Order Details",
    "ยังไม่มีงานในระบบ": "No events in the system",
    "เพิ่มงานจากเมนูคอนเสิร์ตก่อน": "Add an event from the Concerts menu first",
    "ยังไม่มีคำสั่งซื้อที่ยืนยัน": "No confirmed orders yet",
    "ยังไม่มีคำสั่งซื้อ": "No orders yet",

    /* ---------- admin: check-in ---------- */
    "เช็คอินหน้างาน": "Event Check-in",
    "สแกนหมายเลขบัตรที่จุดเข้างาน แล้วระบบจะอัปเดตสถานะทันที": "Scan ticket numbers at the entrance and the system updates the status instantly.",
    "หมายเลขบัตร / หมายเลขออเดอร์": "Ticket No. / Order No.",
    "ยืนยันเช็คอิน": "Confirm Check-in",
    "รายงาน / พิมพ์เป็น PDF": "Report / Print to PDF",
    "พร้อมเช็คอิน": "Ready to check in",
    "กรอกหมายเลขบัตร/QR ของผู้เข้างานเพื่อยืนยัน": "Enter the ticket or QR number of the guest to confirm.",
    "คนรอ": "Waiting",
    "คนรอเข้างาน": "Awaiting Entry",
    "บัตรที่ขาย": "Tickets Sold",
    "เช็คอินสำเร็จ": "Check-in successful",
    "กรุณากรอกเลขรายการ": "Please enter a ticket number",

    /* ---------- admin: report ---------- */
    "พิมพ์ / พิมพ์เป็น PDF": "Print / Print to PDF",
    "กลับไปเช็คอิน": "Back to Check-in",
    "รายชื่อผู้ซื้อทั้งหมด": "All Buyers",
    "รายการเช็คอิน": "Check-in Log",
    "ยังไม่มีรายการเช็คอิน": "No check-ins yet",

    /* ---------- admin: login ---------- */
    "เข้าสู่ระบบแอดมิน | GOPASS": "Admin Login | GOPASS",
    "จัดการคอนเสิร์ต ดูยอดขาย และอัปโหลด Poster ได้จากที่นี่": "Manage concerts, review sales, and upload posters from here.",
    "บัญชีเริ่มต้นตั้งค่าไว้ที่ไฟล์": "The default account is configured in the file",
    "แนะนำให้เปลี่ยนรหัสผ่านก่อนใช้งานจริง": "Change the password before real use.",
    "เข้าสู่ระบบแอดมิน": "Sign in to Admin",
    "กำลังเข้าสู่ระบบ...": "Signing in...",

    /* ---------- runtime / JS messages ---------- */
    "กรุณากรอกชื่อ-นามสกุล": "Please enter your full name",
    "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง": "Please enter a valid phone number",
    "กรุณากรอกอีเมลให้ถูกต้อง": "Please enter a valid email address",
    "กรุณากรอกประเภทบัตรและราคาให้ครบ": "Please complete the ticket type and price",
    "กรุณาเลือกประเภทบัตร": "Please select a ticket type",
    "ต้องมีประเภทบัตรอย่างน้อย 1 ประเภท": "Add at least one ticket type",
    "กำลังตรวจสอบ...": "Verifying...",
    "กำลังบันทึก": "Saving",
    "กำลังอัปโหลด": "Uploading",
    "กำลังเข้าสู่ระบบ": "Signing in",
    "กำลังสร้างคำสั่งซื้อ": "Creating your order",
    "กำลังสร้าง JPG": "Generating JPG",
    "กำลังโหลดรายการ...": "Loading order...",
    "บันทึกข้อมูลไม่สำเร็จ": "Failed to save the data",
    "บันทึกการแก้ไขแล้ว": "Changes saved",
    "เพิ่มคอนเสิร์ตแล้ว": "Concert added",
    "แก้ไขคอนเสิร์ต": "Edit concert",
    "ลบงานนี้หรือไม่? การลบไม่สามารถย้อนกลับได้": "Delete this event? This cannot be undone.",
    "ลบงานเรียบร้อย": "Event deleted",
    "ไม่พบงาน": "Event not found",
    "ไม่พบคอนเสิร์ต": "No concerts found",
    "ไม่พบใบเสร็จ": "Receipt not found",
    "ไม่สามารถโหลดรายละเอียดรายการได้": "Could not load the order details",
    "ไม่สามารถสร้างไฟล์ JPG ได้ กรุณาลองใหม่อีกครั้ง": "Could not create the JPG file. Please try again.",
    "ไม่สามารถเข้าคิวได้": "Could not join the queue",
    "ระบบกำลังพาคุณไปยังหน้าเลือกบัตร": "Taking you to the ticket selection page",
    "โหลดรายการไม่สำเร็จ": "Failed to load the order",
    "โหลดงานไม่สำเร็จ": "Failed to load events",
    "โหลดสรุปยอดไม่สำเร็จ": "Failed to load the sales summary",
    "โหลดรายงานไม่สำเร็จ": "Failed to load the report",
    "โหลดไม่สำเร็จ": "Failed to load",
    "เกิดข้อผิดพลาด": "An error occurred",
    "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่": "Session expired. Please sign in again.",
    "ยังไม่ได้เลือก": "Not selected",
    "ยังไม่มีข้อมูล": "No data yet",
    "ยังไม่มีข้อมูลลูกค้า": "No customer data yet",
    "ยังไม่มีรายการ": "No entries yet",
    "ยังไม่มีงาน": "No events yet",
    "ยังไม่เช็คอิน": "Not checked in",
    "ดำเนินการต่อ": "Continue",
    "ดูรายละเอียด": "View details",
    "ดูรายละเอียดงานทั้งหมด": "View all event details",
    "จำกัดสูงสุด": "maximum",
    "จำนวนบัตร": "Tickets",
    "ราคาต่อใบ": "Price per ticket",
    "ราคา / ใบ": "Price / ticket",
    "เลขบัตร": "Ticket No.",
    "เลือกประเภทบัตร": "Choose a ticket type",
    "เลือกประเภทบัตร จำนวน และกรอกข้อมูลผู้ซื้อเพื่อรับรายการยืนยันจาก GOPASS": "Choose a ticket type and quantity, then fill in the buyer details to get your GOPASS confirmation.",
    "บัตรที่กด": "Tickets requested",
    "พร้อมเข้าระบบ": "Ready to enter",
    "ใช้ภาษาอังกฤษ ตัวเลข และ . _ - เท่านั้น": "English, numbers, and . _ - only",
    "ใช้ภาษาอังกฤษ ตัวเลข และ _ เท่านั้น": "English, numbers, and _ only",
    "แสดงรหัสผ่าน": "Show password",
    "ซ่อนรหัสผ่าน": "Hide password",
    "หมายเลขรายการ / คิว": "Order No. / Queue",
    "วันเวลา": "Date & Time",
    "วันที่ / เวลา": "Date / Time",
    "โทรศัพท์": "Phone",
    "ออเดอร์": "Orders",
    "อัปเดต": "Updated",
    "สร้างเมื่อ": "Generated at",
    "เปิดรายงานงาน": "Open event report",
    "พิมพ์ / PDF": "Print / PDF",
    "ไปเช็คอิน": "Go to Check-in",
    "จากรายการที่ยืนยันแล้ว": "From confirmed orders",
    "รายงาน": "Report",
    "รายการ": "Entries",

    /* ---------- seat hold / misc ---------- */
    "สิทธิ์ของคุณถูกสำรองไว้": "Your seats are reserved",
    "งานทั้งหมด": "All events",

    /* ---------- brands / labels ---------- */
    "YouTube": "YouTube",
    "Instagram": "Instagram",
    "TikTok": "TikTok",
    "Discord": "Discord",
    "GOPASS COMMUNITY": "GOPASS COMMUNITY",
    "SECURE TICKETING": "SECURE TICKETING",
    "GOPASS": "GOPASS",
    "NOW ON SALE": "NOW ON SALE",
    "LATEST": "LATEST",
    "CONTACT": "CONTACT",
    "Admin": "Admin",

    /* ---------- seat map / ผังที่นั่ง ---------- */
    "รูปแบบการกดบัตร": "Ticketing Mode",
    "เลือกว่าผู้ซื้อจะกดบัตรยืน หรือเลือกที่นั่งจากผัง (ออกแบบผังเองได้)": "Choose standing tickets or a seat map (fully customizable).",
    "บัตรยืน": "Standing Tickets",
    "เลือกประเภทบัตรและจำนวน": "Pick ticket type and quantity",
    "ผังที่นั่ง": "Seat Map",
    "เลือกที่นั่งจากผัง · กำหนดโซน/ราคาเอง": "Pick seats from a map · custom zones & prices",
    "ออกแบบผังที่นั่ง": "Design Seat Map",
    "กำหนดจำนวนแถว/คอลัมน์ วาดรูปทรงผัง แบ่งโซนและตั้งราคาแต่ละโซน": "Set rows/columns, draw the layout, split zones and price each zone.",
    "โซนที่นั่ง & ราคา": "Seat Zones & Prices",
    "เพิ่มโซน": "Add Zone",
    "ทาสี / เพิ่มที่นั่ง": "Paint / Add Seats",
    "ลบที่นั่ง": "Erase Seats",
    "ล้างผัง": "Clear Map",
    "ป้ายเวที": "Stage Label",
    "ตำแหน่งเวที": "Stage Position",
    "แสดงชื่อแถว": "Row Labels",
    "เลือกที่นั่ง": "Choose Seats",
    "แตะที่นั่งเพื่อเลือก · เลือกได้สูงสุด 10 ที่ต่อคำสั่งซื้อ": "Tap seats to select · up to 10 seats per order",
    "กำลังถูกจอง": "On hold",
    "ไม่ว่าง": "Unavailable",
    "ที่นั่งที่เลือก": "Selected Seats",
    "ยังไม่ได้เลือกที่นั่ง": "No seats selected yet",
    "ที่นั่งจะถูกสำรองให้คุณ 10 นาที ระหว่างกรอกข้อมูล": "Your seats are held for 10 minutes while you fill in your details.",

  };

  const reverse = Object.fromEntries(Object.entries(dict).map(([th, en]) => [en, th]));

  // Longest keys first so substring replacement prefers the most specific match
  // (e.g. "เช็คอินแล้ว" must win over "เช็คอิน").
  const byLengthDesc = (obj) =>
    Object.entries(obj).sort((a, b) => b[0].length - a[0].length);

  // Exact text translations plus common strings embedded in longer text.
  function translateString(value) {
    if (!value) return value;
    let out = value;
    const source = lang === "en" ? dict : reverse;
    for (const [from, to] of Object.entries(source)) {
      if (out === from) return to;
    }
    for (const [from, to] of byLengthDesc(source)) {
      if (from.length < 2) continue;
      if (out.includes(from)) out = out.split(from).join(to);
    }
    return out;
  }

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const p = node.parentElement;
      if (!p || ["SCRIPT","STYLE","NOSCRIPT"].includes(p.tagName)) return;
      const original = node.nodeValue;
      const trimmed = original.trim();
      if (!trimmed) return;
      const translated = translateString(trimmed);
      if (translated !== trimmed) {
        const start = original.indexOf(trimmed);
        node.nodeValue = original.slice(0, start) + translated + original.slice(start + trimmed.length);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.id === "languageSwitcher") return;

    for (const attr of ["placeholder", "title", "aria-label"]) {
      if (node.hasAttribute(attr)) {
        const value = node.getAttribute(attr);
        const translated = translateString(value);
        if (translated !== value) node.setAttribute(attr, translated);
      }
    }
    for (const child of node.childNodes) translateNode(child);
  }

  function addSwitcher() {
    const nav = document.querySelector(".nav");
    if (!nav || document.getElementById("languageSwitcher")) return;

    const btn = document.createElement("button");
    btn.id = "languageSwitcher";
    btn.type = "button";
    btn.className = "language-switcher";
    btn.innerHTML = `<i class="fa-solid fa-language"></i><span></span>`;
    btn.title = "Switch language";
    btn.addEventListener("click", () => {
      lang = lang === "th" ? "en" : "th";
      localStorage.setItem(STORAGE_KEY, lang);
      window.applyLanguage();
    });

    const login = nav.querySelector(".login-btn");
    if (login) nav.insertBefore(btn, login);
    else nav.appendChild(btn);
  }

  function updateSwitcher() {
    const btn = document.getElementById("languageSwitcher");
    if (!btn) return;
    const span = btn.querySelector("span");
    if (span) span.textContent = lang === "th" ? "EN" : "ไทย";
    btn.setAttribute("aria-label", lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย");
  }

  window.applyLanguage = () => {
    if (applying) return;
    applying = true;
    try {
      document.documentElement.lang = lang === "en" ? "en" : "th";
      translateNode(document.body);
      updateSwitcher();
    } finally {
      applying = false;
    }
  };

  window.getLanguage = () => lang;
  window.setLanguage = (next) => {
    if (next !== "th" && next !== "en") return;
    lang = next;
    localStorage.setItem(STORAGE_KEY, lang);
    window.applyLanguage();
  };

  const observer = new MutationObserver((mutations) => {
    if (applying) return;
    // Wait a tick so dynamic cards/forms finish rendering.
    clearTimeout(window.__delefI18nTimer);
    window.__delefI18nTimer = setTimeout(() => {
      addSwitcher();
      window.applyLanguage();
    }, 30);
  });

  document.addEventListener("DOMContentLoaded", () => {
    addSwitcher();
    window.applyLanguage();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();

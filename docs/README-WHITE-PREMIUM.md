# GOPASS — WHITE PREMIUM V5

เวอร์ชันนี้ปรับหน้าเว็บให้ตรงกับแบบที่ต้องการ:
- พื้นหลังเว็บไซต์เป็นสีขาว/เทาอ่อน
- Hero ยังคงเป็นโทนดำเพื่อให้ภาพคอนเสิร์ตเด่น
- Header เป็นการ์ดสีขาวมุมโค้ง
- ส่วน NOW ON SALE / LATEST เป็นการ์ดสีขาว
- ส่วนช่องทางการติดต่อ (YouTube / Instagram / TikTok / Discord) เปลี่ยนจากพื้นดำเป็นพื้นขาว
- ปรับขอบ, shadow, radius และ spacing ให้ดู Premium และสม่ำเสมอ
- ระบบ Backend / Admin / Queue / Ticket Type / Limit ต่อคำสั่งซื้อจาก V4 ยังคงอยู่

## วิธีเปิดระบบ
1. ติดตั้ง Node.js
2. เปิด Command Prompt ในโฟลเดอร์นี้
3. รัน `npm install`
4. รัน `npm start`
5. เปิด `http://localhost:3000`

อย่าเปิด `index.html` ด้วยการดับเบิลคลิกโดยตรง เพราะหน้าเว็บเรียก API `/api/events` จาก Express backend ซึ่งจะทำให้เกิด `Failed to fetch` ได้เมื่อไม่มี server ทำงาน

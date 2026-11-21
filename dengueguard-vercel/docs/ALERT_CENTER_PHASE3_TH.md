# DengueYosoku — Alert Center Phase 3

## สิ่งที่เพิ่มในระยะนี้

1. API ฝั่งเซิร์ฟเวอร์สำหรับบันทึกผล Dry-run, อ่านเหตุการณ์ และเปลี่ยนสถานะ Event
2. ตรวจ Supabase access token จาก HttpOnly cookie และอ่าน Role จาก `user_profiles` ทุกคำขอ ไม่เชื่อ Role ที่ส่งมาจากเบราว์เซอร์
3. ใช้ Supabase anon key ร่วมกับ access token ของผู้ใช้เท่านั้น ไม่ใช้ `service_role` key
4. เพิ่ม PostgreSQL RPC แบบ transaction สำหรับบันทึก evaluation, reconcile candidate และเปลี่ยนสถานะพร้อม append-only transition history
5. เปลี่ยนหน้า `/alerts` ให้แสดง Dry-run จาก Model Snapshot และ Event Lifecycle จากฐานข้อมูลกลาง
6. เพิ่ม contract tests 16 กรณีสำหรับ Model Snapshot, forecast consistency, UUID และคำสั่งเปลี่ยนสถานะ

## ก่อนเปิดใช้งานฐานข้อมูล

- ต้องมี migrations `001_alert_center.sql`, `002_alert_integrity_hardening.sql` และ `003_supabase_auth_and_rls.sql` อยู่แล้ว
- หลังติดตั้ง Patch ให้เปิด Supabase Dashboard → SQL Editor แล้วรันไฟล์ `database/migrations/004_alert_event_server_persistence.sql` ทั้งไฟล์
- ตรวจว่า account ที่ใช้ทดสอบมี Role `reviewer` หรือ `administrator` ใน `public.user_profiles`
- ห้ามนำ `service_role` key มาใส่ใน `.env.local` หรือโค้ดฝั่งเว็บ

## ทดสอบหลังติดตั้ง

```powershell
npm.cmd run test:alert-db
npm.cmd run test:alerts
npm.cmd run typecheck
npm.cmd run build
```

จากนั้นเปิด `/alerts` ด้วยบัญชี Reviewer/Administrator และตรวจสถานะการเชื่อมต่อฐานข้อมูลกลาง

## ขอบเขตความปลอดภัย

- RPC ทั้งสองตรวจ `auth.uid()` และ Role ในฐานข้อมูลเอง
- ตารางยังไม่มีสิทธิ์ INSERT/UPDATE/DELETE โดยตรงสำหรับ `authenticated`; การเขียนทำผ่าน RPC ที่กำหนดเท่านั้น
- Profile ต้องมีสถานะ `approved` และมี Threshold ครบ 77 จังหวัดในฐานข้อมูลก่อนจึงจะสร้าง Candidate Events ได้
- API คำนวณผล Dry-run ใหม่บนเซิร์ฟเวอร์ และไม่รับ Candidate/Severity/Threshold ที่ส่งมาจาก client; ใช้ SHA-256 digest ขนาดคงที่เป็น run fingerprint ใน unique index
- External notifications ถูกปิดใน schema และ RPC; Patch นี้ไม่มีการส่ง LINE, Email, SMS หรือช่องทางภายนอก
- ยังไม่มีหน้าอนุมัติ Rule Profile หรือจัดการ Threshold; การอนุมัติเป็นกระบวนการที่ต้องผ่านผู้เชี่ยวชาญและผู้มีอำนาจ ผ่านขั้นตอนแยกต่างหาก

## สิ่งที่ยังไม่ใช่

- ไม่ใช่การรับรองเกณฑ์ระบาดวิทยาหรือการวินิจฉัย
- ไม่ได้ทำให้ Rule Profile Draft ปัจจุบันกลายเป็น Approved
- ไม่ได้เปิดการแจ้งเตือนสู่ประชาชนหรือหน่วยงาน
- ไม่ได้ยืนยันการเชื่อมต่อ Supabase จนกว่าจะติดตั้ง Migration 004 และทดสอบด้วยบัญชีจริง

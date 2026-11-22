# Alert Center Phase 5 — Draft Rule Profile Workflow

## เป้าหมาย

เพิ่มกระบวนการจัดการเกณฑ์ร่างรายจังหวัดโดยให้ข้อมูลจากหน้าเว็บเข้าสู่ Supabase ผ่าน API/RPC ที่ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ และเก็บประวัติแบบ append-only โดยไม่อนุมัติเกณฑ์เอง

## ข้อมูลและขอบเขต

- Profile ที่แก้ไขได้ถูกจำกัดไว้ที่ `dengueyosoku-national-alerts / 0.1.0-draft`
- API อนุญาตให้แก้ไขเฉพาะ Role `administrator`; Role `reviewer` อ่าน Draft, audit และ review request ได้เท่านั้น
- API โหลด canonical province names จาก `public/data/model_predictions.json` ฝั่งเซิร์ฟเวอร์ ไม่ใช้ชื่อจังหวัดที่ client ส่งมาเป็นแหล่งอ้างอิง
- Draft save รองรับ Threshold บางส่วนหรือไม่กรอก Threshold เลย เพื่อบันทึก methodology/change note และทำงานต่อได้
- การส่ง review ต้องมี Threshold ที่ถูกต้องครบ 77 รายชื่อจาก Model Snapshot และ note อย่างน้อย 10 ตัวอักษร

## Database changes

Migration 005 เพิ่ม:

1. `alert_rule_profile_change_log` — เก็บ previous/new snapshot, actor, action, note และเวลา; แก้ไข/ลบ/ truncate ไม่ได้
2. `alert_rule_profile_review_requests` — บันทึกคำขอทบทวนที่ยัง pending; จำกัดหนึ่งคำขอ pending ต่อ Profile
3. `dengueyosoku_save_alert_rule_draft(...)` — RPC ที่ตรวจ `auth.uid()` และ role `administrator`, lock Draft profile, ตรวจ threshold, replace threshold set ภายใน transaction, append audit และสร้าง review request เมื่อร้องขอ

RPC ไม่รับพารามิเตอร์ status/approval reference/effective week/approved_by และไม่มีเส้นทางให้เปลี่ยนสถานะเป็น Approved

## API

- `GET /api/alerts/admin/profile` — อ่าน profile, thresholds, change log และ review requests สำหรับ reviewer/admin
- `POST /api/alerts/admin/profile` — บันทึก Draft/ส่ง review; same-origin, Administrator-only, validate canonical 77 provinces ฝั่ง server, เรียก Supabase RPC ด้วย access token ของผู้ใช้

ไม่มี service-role key และไม่มี direct browser table write

## UI

`AlertRuleDraftManager` อยู่ใน `/alerts` และแสดง:

- Profile/version/status
- Methodology/change note
- Watch/Alert inputs 77 จังหวัดที่มาจาก Model Snapshot
- จำนวนจังหวัดที่กรอกครบ
- Draft audit log
- Review requests

ไม่มีปุ่ม Approve และข้อความ UI ระบุชัดว่าการส่ง review ไม่ได้ทำให้ Profile เป็น Approved

## Validation

- Province reference ต้องครบ 77 ชื่อและไม่ซ้ำ
- Threshold province ต้องอยู่ใน canonical model province list และไม่มีซ้ำ
- `0 <= Watch < Alert`, finite number, ทศนิยมไม่เกิน 3 ตำแหน่ง
- Draft บันทึกบางส่วนได้ แต่ submit review ต้องครบ 77
- methodology 20–4,000 ตัวอักษร; change note 3–500 ตัวอักษร; submit note อย่างน้อย 10 ตัวอักษร

## Safety properties

- Profile status อยู่ `draft` ตลอด Phase 5
- `approval_reference`, `effective_from_week`, `approved_at`, `approved_by` ไม่ถูกแก้
- Migration 002 ยังคง immutable trigger สำหรับ approved profile/threshold
- Candidate generation ยังต้องผ่านเงื่อนไข approved profile และ 77 DB thresholds ใน Migration 004
- External notifications ยังเป็น false และไม่มี delivery code

## ข้อจำกัดที่ทราบ

- คำขอทบทวนถูกบันทึกเป็น `pending`; การบันทึกผลผู้เชี่ยวชาญ/การเปลี่ยนกลับไปแก้ไข/การอนุมัติจะเป็นงาน Phase ถัดไปหลังโครงการระบุผู้มีอำนาจและวิธีพิสูจน์การรับรอง
- Contract tests ไม่แทนการ Execute Migration จริง หรือการทดสอบ Supabase RLS/RPC จริง

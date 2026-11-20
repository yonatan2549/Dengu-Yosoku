# DengueYosoku Phase 7 — Forecast Model Integration & Validation

## เป้าหมาย
ย้ายความน่าเชื่อถือของ Model Snapshot จากการตรวจเฉพาะในเบราว์เซอร์ไปสู่การตรวจจากไฟล์ที่ Server ให้บริการจริง และแสดงรายงาน Model Data Integrity ที่ Dashboard

## สิ่งที่เพิ่ม
- `lib/model/validation.ts`: ตรวจ schema, รายชื่อ 77 จังหวัด, forecast rows, holdout completeness, chronology, revision, provenance, freshness และความสอดคล้องของ Metrics
- `lib/model/server-loader.ts`: อ่าน `public/data/model_predictions.json` และ `public/data/model_metrics.json` จาก Origin เดียวกับคำขอ พร้อม SHA-256
- `GET /api/model/diagnostics`: ส่งรายงาน validation และ digest ของไฟล์โมเดล
- `ModelValidationPanel`: แสดงผลตรวจสอบบน Dashboard แม้ Model Snapshot จะขาดหรือไม่ผ่าน
- `POST /api/alerts/evaluations`: ใช้ Model Snapshot ที่ Server โหลดจาก Public Model Artifacts เป็นแหล่งข้อมูลหลัก เปรียบเทียบ revision ที่ Client แจ้งเพื่อป้องกันหน้าเว็บใช้ Snapshot คนละรุ่น
- Alert Engine ป้องกันการสร้าง Candidate จาก Forecast ที่เก่ากว่าสัปดาห์ระบาดวิทยาปัจจุบัน
- Alert Evaluation ปิด Candidate ทั้งหมดเมื่อ Metrics ไม่ตรงกับ Model Revision/Repository หรือ Forecast ไม่ผ่านเกณฑ์ปัจจุบัน แม้ Engine คำนวณ Dry-run ได้

## นโยบายข้อมูล
- ไม่แก้หรือสร้างไฟล์ Model Predictions/Metrics
- ไม่แก้ source model, train หรือ retune โมเดล
- Metrics ที่ไม่ตรง Revision/Repository จะไม่ถือเป็น Metrics ที่ยืนยันแล้ว
- Forecast ที่เก่าอาจแสดงเพื่อศึกษาย้อนหลัง แต่ไม่สร้าง Alert Candidate
- ไม่มีการส่ง LINE, Email, SMS หรือ External Notification

## ทดสอบ
ชุดทดสอบใหม่ของ Phase 7 มี 40 กรณี (Model Validation 28, Alert Eligibility Gate 5, Server Loader 5, Alert Freshness 2)

`npm.cmd run test:model-validation`
`npm.cmd run test:model-alert-gate`
`npm.cmd run test:alert-freshness`
`npm.cmd run test:model-loader`
`npm.cmd run test:alert-review`
`npm.cmd run test:alert-profile-draft`
`npm.cmd run test:alert-readiness`
`npm.cmd run test:alert-db`
`npm.cmd run test:assessment`
`npm.cmd run test:alerts`
`npm.cmd run typecheck`
`npm.cmd run build`

## ข้อจำกัด
การตรวจสอบนี้ยืนยันโครงสร้าง/ที่มา/ความสอดคล้องของ Export ไม่ใช่การรับรองคุณภาพเชิงระบาดวิทยาของโมเดล หรือยืนยันว่า Metrics สะท้อนประสิทธิภาพในอนาคตจริง

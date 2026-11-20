# Alert Center Phase 4 — Operational Readiness

## เพิ่มอะไร

- Read-only API `/api/alerts/readiness`
- ตรวจ existence ของ Migration 004 RPC ด้วย invalid-action probe ที่ไม่มี side effect
- อ่าน Rule Profile และ Threshold จาก Supabase โดยใช้ access token ของ Reviewer/Administrator
- เปรียบเทียบรายชื่อจังหวัด Threshold กับจังหวัดจาก Model Snapshot
- ตรวจ Draft/Approved, profile identity/version, threshold duplicates, missing/unexpected provinces และค่าตัวเลขที่ไม่ถูกต้อง
- แสดง blockers และ summary ใน `/alerts`
- เพิ่ม contract tests 14 กรณี

## ความปลอดภัย

- API เป็น POST same-origin และไม่รับ role จาก client
- อ่านข้อมูลด้วย Supabase anon key + user access token; ไม่มี service-role key
- endpoint ไม่เขียนฐานข้อมูล
- ไม่มีการอนุมัติหรือแก้ threshold
- External Notifications คงปิดตลอด

## ข้อจำกัด

การแสดงสถานะ `canCreateCandidates` เป็น readiness gate ของโค้ดและข้อมูลในฐานข้อมูลเท่านั้น ไม่ได้อนุมัติแนวทางระบาดวิทยาโดยผู้เชี่ยวชาญ และไม่ได้หมายความว่าระบบพร้อมส่งการแจ้งเตือนจริง

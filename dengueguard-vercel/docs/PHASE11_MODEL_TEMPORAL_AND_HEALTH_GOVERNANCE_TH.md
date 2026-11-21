# DengueYosoku Phase 11 — Model Temporal Monitoring + Health Knowledge Governance

## สายงาน Model

- เพิ่ม `/api/model/temporal-monitor` และ Panel ใน `/model-operations`
- อ่าน `public/data/model_predictions.json` แบบ read-only และจำกัดไฟล์สูงสุด 50 MB
- ตรวจ 77 จังหวัด, แถว Holdout, Sunday epidemiological week, ค่าตัวเลข, duplicate province-week และ provenance เบื้องต้น
- เปรียบเทียบ MAE/RMSE/Bias ของ Model, Persistence, Seasonal Naive และ Climatology ระหว่าง 4 สัปดาห์ล่าสุดกับ 4 สัปดาห์ก่อนหน้า
- สรุป MAE/RMSE/Bias รายจังหวัด 10 จังหวัดที่ MAE สูงสุด
- ไม่ตั้งเกณฑ์ drift อัตโนมัติ ไม่อนุมัติ Model ไม่แก้ Model Outputs และไม่สร้าง Alert Candidate

## สายงาน Health Assistant

- เพิ่ม `/api/health-assistant/governance` และ Knowledge Governance Panel
- ตรวจ Document ID ซ้ำ, metadata, HTTPS source URL, keywords, key points และหลักฐานทบทวน
- รายงานสถานะ `awaiting_clinical_review` และเอกสารที่มี review metadata ครบ
- `productionAnswersAllowed` เป็น false โดยเจตนาเสมอใน Phase นี้
- เพิ่มปุ่มเริ่มบทสนทนาใหม่ใน Chat Panel; ประวัติยังอยู่เฉพาะ component memory และไม่บันทึก DB/localStorage
- ไม่เพิ่ม LLM Provider, ไม่เปลี่ยน ENV, ไม่เพิ่ม Supabase migration

## Tests

```powershell
npm.cmd run test:model-temporal-monitor
npm.cmd run test:health-knowledge-governance
npm.cmd run typecheck
npm.cmd run build
```

คาดหวัง Unit Tests: Model 13 กรณี + Knowledge Governance 13 กรณี = 26 กรณี

## ข้อจำกัด

- Holdout monitoring เป็น descriptive comparison ไม่ใช่ model drift certification และไม่ใช่ outbreak evidence
- Model temporal endpoint อ่าน Holdout จาก artifact ปัจจุบันเท่านั้น ไม่มี historical deployment ledger
- Governance API ตรวจ metadata ของ registry ไม่ได้ดาวน์โหลดหรืออ่านเอกสารเต็มจาก external URLs
- ไม่มีการอนุมัติเนื้อหาทางคลินิกจากในระบบนี้; ต้องมีผู้เชี่ยวชาญทบทวนจริง

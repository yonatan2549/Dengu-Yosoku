# DengueYosoku Phase 10 — Model Release Integrity + Health Assistant HA-2

Patch นี้พัฒนาสอง workstreams โดยไม่เปลี่ยนแปลง Model Outputs, Supabase, ENV หรือ Alert Rules

## A) Model Release Integrity

เพิ่ม `GET /api/model/release-integrity` และแผงตรวจใน `/model-operations`

- อ่าน `public/data/model_predictions.json` และ `public/data/model_metrics.json` แบบ read-only
- คำนวณ SHA-256 จาก bytes จริงของแต่ละไฟล์ใน Deployment ปัจจุบัน
- สร้าง release fingerprint จาก hash ของ Predictions และ Metrics
- ตรวจการมีอยู่ ขนาดไฟล์ (สูงสุด 50 MB ต่อไฟล์) SHA-256, Model Revision, Source Repository, 77 จังหวัด, Forecast 77 แถว, สัปดาห์เดียวกัน, ค่าพยากรณ์ไม่ติดลบ และ Forecast freshness
- แสดง file modified time เพื่อช่วยตรวจสอบ deployment artifact
- ไม่ดาวน์โหลดข้อมูลจาก upstream, ไม่เขียน/แก้ไฟล์โมเดล และไม่สร้างประวัติถาวร; fingerprint ใช้เปรียบเทียบระหว่างการตรวจด้วยตนเอง
- การผ่าน Integrity ไม่ได้หมายความว่าโมเดลมีความแม่นยำสูง; ให้อ่านคู่กับ Model Performance Diagnostics (Phase 8)

## B) Health Assistant HA-2 — Evidence & Safety Gateway

เพิ่ม `POST /api/health-assistant/evidence` และยกระดับหน้า Health Assistant ให้ใช้ Safety Gateway ก่อนแสดงเอกสาร

- แยก intent เป็น emergency-warning, personal-medical และ general-education
- คำค้นที่เข้าข่ายสัญญาณรุนแรงแสดงข้อความให้ไปโรงพยาบาล/ห้องฉุกเฉินทันทีแบบมีเงื่อนไข ไม่วินิจฉัยผู้ใช้
- คำถามเฉพาะบุคคล การแปลผลตรวจ หรือการเลือกยา/ขนาดยา จะ abstain จากคำแนะนำเฉพาะบุคคล
- คำค้นทั่วไปค้นจาก registry เดิมและแสดง citations ที่ตรงกับผลค้นเท่านั้น
- หากไม่พบแหล่งอ้างอิง ระบบ abstain แทนการเดาคำตอบ
- `generatedAnswer` คงเป็น `false`; ไม่มี LLM Provider หรือ API Key ใน Phase 10
- เอกสารทุกแหล่งยัง `awaiting_clinical_review`; ไม่มีการเปลี่ยนสถานะรับรอง
- ไม่เก็บคำค้นหรือบทสนทนา

Safety keyword routing เป็นชั้นป้องกันเบื้องต้น ไม่ใช่ระบบ triage ที่ผ่าน validation ทางคลินิก ต้องทดสอบกับผู้เชี่ยวชาญและผู้ใช้จริงก่อนเปิดใช้งานวงกว้าง

## Install

รัน `node scripts/apply-phase10-model-integrity-ha2.mjs` จาก project root หลังแตก ZIP

Installer จะสำรองไฟล์ที่แก้ไขไว้เหนือ project root และหยุดหากพบไฟล์ปลายทางซ้ำหรือ anchors ไม่ตรง

## Tests

```powershell
npm.cmd run test:model-release-integrity
npm.cmd run test:health-evidence
npm.cmd run typecheck
npm.cmd run build
```

Expected new tests: Model Release Integrity 12/12; Health Evidence/Safety 15/15. รัน Regression tests เดิมของ Model และ Alert Center ต่อหลังผ่านสองชุดใหม่

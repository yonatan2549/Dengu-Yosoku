# DengueYosoku Phase 12 — Model Refresh Observability + Health Knowledge Chunk Retrieval

## สายงาน A: Model Refresh Observability

- เพิ่ม `GET /api/model/refresh-observability` และ Panel ใน `/model-operations`
- อ่าน `public/data/model_predictions.json` และ `public/data/model_metrics.json` แบบ read-only จำกัดขนาดไฟล์ไม่เกิน 50 MB
- แยก timestamp 4 จุด: `source_retrieved_at_utc`, `generated_at_utc`, `converted_at_utc` และ `forecast_week`
- ตรวจ Source Retrieval → Conversion chronology, current epi week, forecast lag ณ ปัจจุบัน และ lag ที่บันทึกไว้ ณ เวลา Conversion
- เทียบ Model Revision และ Repository ระหว่าง Predictions/Metrics
- แสดงอายุ Artifact และ Source เป็นข้อมูลประกอบ ไม่สร้าง SLA freshness ขึ้นเอง
- ถ้า Artifact ถูกสร้างใน/หลังสัปดาห์ปัจจุบัน แต่ Forecast target ยังย้อนหลัง ให้แสดง diagnosis สำหรับตรวจ upstream pipeline
- ไม่ดึงโมเดลใหม่ ไม่เขียน Model Outputs ไม่สร้าง Alert Candidate และไม่อนุมัติ Threshold

## สายงาน B: Health Knowledge Chunk Retrieval

- เพิ่ม `lib/health-assistant/chunk-retrieval.ts` และ `POST /api/health-assistant/chunks`
- จัด Summary และ Key Points ใน Knowledge Registry เป็น passages (ไม่ใช่ข้อความคัดตรงจากเอกสารต้นฉบับ) ที่มี `chunkId`, `documentId`, section, publisher, date และ source URL
- เพิ่ม passage results ใน Evidence Search API และ grounded Chat API
- Chat prompt ใช้ passages ที่ค้นคืนก่อน พร้อมคง source markers ที่ผูกกับเอกสารจริง
- แสดง excerpt ที่ใช้ประกอบคำตอบในหน้า Evidence Search และ Chat transcript
- จำกัดผลค้นสูงสุด 8 passages และไม่เกิน 2 passages ต่อเอกสาร
- Retrieval ปัจจุบันเป็น lexical retrieval จาก Summary/Key Points ใน Registry; ยังไม่ใช่ vector embeddings, ไม่ได้ดึง PDF/HTML ฉบับเต็ม และไม่อ้างว่าเป็น full-document RAG
- เอกสารทั้ง 6 รายการยังมีสถานะ `awaiting_clinical_review`; ไม่ได้เพิ่มหรือเปลี่ยนการอนุมัติทางคลินิก

## Tests

```powershell
npm.cmd run test:model-refresh-observability
npm.cmd run test:health-knowledge-rag
npm.cmd run test:health-assistant-chat
npm.cmd run typecheck
npm.cmd run build
```

คาดหวัง Tests ใหม่ 28 กรณี: Model Refresh Observability 13 และ Health Knowledge RAG 15

## สิ่งที่ไม่เปลี่ยน

- ไม่แก้ `public/data/model_predictions.json`, `public/data/model_metrics.json` หรือไฟล์ Model Outputs อื่น
- ไม่แก้ `.env.local`, AI Provider, Supabase, Migration, Alert Rules, Thresholds หรือ External Notifications
- ไม่เปิด Production AI Answers; คง safety abstention และสถานะรอผู้เชี่ยวชาญทบทวน

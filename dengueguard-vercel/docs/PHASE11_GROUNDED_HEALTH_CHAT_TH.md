# DengueYosoku Phase 11 — Grounded Conversational Health Assistant (HA-3)

## ความสามารถ

- เพิ่มหน้าสนทนาแบบหลายรอบที่ `/health-assistant` โดยใช้บริบทล่าสุดไม่เกิน 8 ข้อความและไม่บันทึกประวัติลงฐานข้อมูล
- เพิ่ม `POST /api/health-assistant/chat`
- ใช้ Knowledge Retrieval จาก registry ที่มีอยู่แล้วเป็น context ของโมเดล ไม่ค้นเว็บแบบสดและไม่อ่านไฟล์ PDF ต้นฉบับ
- รองรับ Chat Completions API ที่เข้ากันได้กับรูปแบบ OpenAI-compatible ผ่าน Server API เท่านั้น
- ตรวจ marker อ้างอิง `[S1]`, `[S2]` ว่าตรงกับเอกสารที่ Retrieval คืนมาจริงก่อนส่งคำตอบไปหน้าเว็บ
- งดเรียก Provider เมื่อคำถามเป็นภาวะฉุกเฉิน, คำถามสุขภาพเฉพาะบุคคล, มีบทสนทนาก่อนหน้าที่เป็นประเด็นเหล่านั้น หรือไม่พบหลักฐาน
- ไม่เก็บข้อความสนทนา, ไม่ log เนื้อหาคำถาม, ไม่ส่ง API Key ไป Client

## ข้อจำกัดและการเปิดใช้งาน

เอกสารทุกแหล่งใน Knowledge Registry ปัจจุบันยังมีสถานะ `awaiting_clinical_review` ดังนั้นระบบตอบแบบร่างเปิดได้เฉพาะ Local Development เมื่อผู้ใช้ตั้ง `HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true` เท่านั้น Production จะปิดการสร้างคำตอบไว้จนกว่าจะมี workflow อนุมัติเอกสารและการทบทวนทางคลินิก

ยังไม่ใช่ Clinical Decision Support, ไม่วินิจฉัย, ไม่แปลผลตรวจเฉพาะบุคคล, ไม่แนะนำยา/ขนาดยา และ Safety Routing เป็นเพียง guardrail เบื้องต้น ไม่ใช่ triage ที่ผ่าน validation

ระบบใช้เฉพาะ summary/key points ใน Knowledge Registry ที่ curate ไว้ ไม่ได้ดึง/อ่านเนื้อหาเต็มจาก URLs ดังนั้น citation เป็นการอ้างแหล่งข้อมูลประกอบ ไม่ใช่หลักฐานว่าทุกประโยคผ่านการตรวจสอบจาก full text แล้ว

## Server environment (ห้ามใส่ใน Client / Git)

ตั้งค่าใน `.env.local` ของผู้ใช้เองเท่านั้น:

```env
HEALTH_ASSISTANT_CHAT_ENDPOINT=https://YOUR_PROVIDER/v1/chat/completions
HEALTH_ASSISTANT_API_KEY=YOUR_SECRET_KEY
HEALTH_ASSISTANT_MODEL=YOUR_MODEL_ID
HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true
```

`HEALTH_ASSISTANT_CHAT_ENDPOINT` ต้องเป็น endpoint ที่รองรับ OpenAI-compatible Chat Completions schema. Local endpoint เช่น Ollama ที่เปิด compatible endpoint สามารถใช้ในการพัฒนาได้. Production บังคับ HTTPS และยังไม่อนุญาต Draft Answers.

ห้ามส่ง API Key ให้ผู้ช่วยหรือ Commit `.env.local` ขึ้น GitHub. การตั้งค่าข้างต้นเป็นตัวอย่าง ไม่ใช่ค่าจริง.

## Tests

```powershell
npm.cmd run test:health-assistant-chat
npm.cmd run test:model-release-integrity
npm.cmd run test:health-evidence
npm.cmd run typecheck
npm.cmd run build
```

HA-3 tests cover validation, conversation bounds, history safety, prompt grounding, citation allow-listing, provider config, server-side auth header, and provider failure handling.

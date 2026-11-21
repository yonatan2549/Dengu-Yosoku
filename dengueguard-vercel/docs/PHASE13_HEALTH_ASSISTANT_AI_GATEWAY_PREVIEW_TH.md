# Phase 13 — DengueYosoku Health Assistant: Real AI Preview

## สิ่งที่เปลี่ยน

- เพิ่ม Vercel AI Gateway เป็น provider เริ่มต้นผ่าน OpenAI-compatible Chat Completions endpoint
  (`https://ai-gateway.vercel.sh/v1/chat/completions`)
- ตั้งโมเดลเริ่มต้นเป็น `google/gemini-4-neon`; เปลี่ยนได้ผ่าน `HEALTH_ASSISTANT_MODEL`
- รองรับ credential ฝั่ง server จาก Vercel OIDC (`VERCEL_OIDC_TOKEN`, provided to the server runtime) หรือ `AI_GATEWAY_API_KEY`
- รองรับ legacy `HEALTH_ASSISTANT_API_KEY` และ `HEALTH_ASSISTANT_CHAT_ENDPOINT` เพื่อไม่ทำลาย provider เดิม
- เพิ่ม `GET /api/health-assistant/chat` สำหรับตรวจสถานะ AI Preview โดยไม่เปิดเผย credential
- หน้า Health Assistant แสดงสถานะ provider/model และติดป้ายคำตอบที่สร้างจาก AI ว่าเป็น Draft
- เพิ่ม runtime policy ที่อนุญาต AI draft เฉพาะ local development หรือ Vercel Preview ที่เปิด flag ชัดเจน

## การตั้งค่ารันในเครื่อง

คัดลอกตัวอย่างใน `.env.example` ไปไว้ใน `.env.local` แล้วใส่ AI Gateway API key ที่สร้างจาก Vercel AI Gateway:

```env
AI_GATEWAY_API_KEY=YOUR_AI_GATEWAY_API_KEY
HEALTH_ASSISTANT_MODEL=google/gemini-4-neon
HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true
```

อย่า commit `.env.local`, key หรือ token และห้ามใช้ prefix `NEXT_PUBLIC_` กับ credential ใด ๆ

## การตั้งค่า Vercel Preview

1. เปิดใช้ Vercel OIDC สำหรับ project หากต้องการให้ runtime ใช้ OIDC แทนการเก็บ API key
2. เพิ่ม Environment Variable `HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true` เฉพาะ Preview และผูกกับ branch `feature/health-assistant-real-ai`
3. Vercel Functions ใช้ `VERCEL_OIDC_TOKEN` จาก runtime เพื่อยืนยันตัวตนกับ AI Gateway โดยไม่ต้องบันทึก API key ของผู้ให้บริการ
4. หาก Vercel OIDC ไม่พร้อม ให้เพิ่ม `AI_GATEWAY_API_KEY` เป็น Encrypted/Sensitive Environment Variable เฉพาะ Preview ของ branch เดียวกัน
5. ห้ามตั้ง flag นี้ใน Production
6. ตรวจ `GET /api/health-assistant/chat` ว่าระบุ `generatedAnswersEnabled: true` ก่อนทดสอบถามตอบ

Preview deployment ของ Next.js มักทำงานภายใต้ `NODE_ENV=production`; จึงใช้ `VERCEL_ENV=preview` แยก Preview จาก Production อย่างชัดเจน ไม่ใช้ `NODE_ENV` เพียงตัวเดียวเป็นเงื่อนไข

## Safety & governance (คงไว้โดยตั้งใจ)

- คำถามฉุกเฉิน, คำถามเกี่ยวกับผู้ป่วย/อาการเฉพาะบุคคล, คำถามยา และค่าผลตรวจส่วนบุคคล จะถูกปฏิเสธก่อนส่งข้อความไปยัง AI Provider
- คำถามทั่วไปต้องพบหลักฐานใน Knowledge Registry และผ่าน Source Policy ก่อนส่ง prompt
- คำตอบต้องมี source marker เช่น `[S1]` ซึ่งต้องตรงกับเอกสารที่ค้นคืน ไม่เช่นนั้นระบบจะงดแสดงคำตอบ
- คลังความรู้ปัจจุบันยังมีสถานะ `awaiting_clinical_review`; AI answer ใน Preview จึงเป็นร่างเพื่อการศึกษาเท่านั้น
- Production ยังคง `evidence-only` เสมอ จนกว่าจะมีการทบทวนทางคลินิกและกระบวนการอนุมัติ Release แยกต่างหาก
- ห้ามนำบทสนทนาหรือค่าผลตรวจส่วนบุคคลไปใช้เป็นข้อมูลฝึกโมเดล

## ขอบเขต RAG ที่ต้องสื่อสารอย่างตรงไปตรงมา

การค้นคืนปัจจุบันเป็น lexical retrieval จาก Summary/Key Points ใน Knowledge Registry สูงสุด 8 passages ไม่เกิน 2 passages ต่อเอกสาร ไม่ใช่ vector embedding, ไม่ได้ดาวน์โหลดหรือทำดัชนี PDF/HTML ฉบับเต็ม และไม่ควรเรียกว่า full-document RAG

## Tests

```powershell
npm.cmd run test:health-assistant-chat
npm.cmd run test:health-knowledge-rag
npm.cmd run test:health-evidence
npm.cmd run test:health-knowledge-governance
npm.cmd run test:health-assistant-source-policy
npm.cmd run typecheck
npm.cmd run build
```

## Model reference

Vercel AI Gateway lists `google/gemini-4-neon` as a text-capable model and documents its OpenAI Chat Completions compatibility. Model availability and price can change; keep the model configurable.

- https://vercel.com/changelog/gemini-4-neon-now-available-on-ai-gateway
- https://vercel.com/ai-gateway/models/google/gemini-4-neon

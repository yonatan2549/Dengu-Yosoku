# Local SQLite RAG Integration (ภาษาไทย)

## ขอบเขต

Health Assistant รุ่นนี้ค้นหลักฐานจาก SQLite Knowledge Base ที่อยู่บนเครื่อง Windows ของผู้พัฒนา โดยเรียก Python retrieval CLI แบบ local-only และแสดงเฉพาะผลที่ผ่าน Public Evidence Policy

- ใช้ `scripts/search.py` และ `knowledge-base/knowledge.db` จากโฟลเดอร์ในเครื่อง
- บังคับ `--audience public`, `--top-k 5`, `--per-source 2`, `--output-format json`
- ไม่เปิด review audience ผ่าน API
- โหมดพื้นฐานแสดง excerpts และแหล่งต้นทางเท่านั้น; สามารถเปิด AI draft แบบเลือกใช้ได้ผ่าน Vercel AI Gateway โดยใช้เฉพาะ excerpt ที่ผ่าน Public Evidence Policy
- Production ปิด endpoint นี้ และ endpoint รับคำขอเฉพาะ loopback + same-origin ใน local development

## ตั้งค่าเครื่องพัฒนา

เก็บฐานข้อมูลและไฟล์ต้นฉบับไว้ภายนอก Git repository เช่น `D:\AI\DengueYosoku` และตั้งค่าใน `.env.local` ภายใน `dengueguard-vercel`:

```env
DENGUE_RAG_PROJECT_DIR=D:/AI/DengueYosoku
DENGUE_RAG_PYTHON=py
```

ตั้งค่า AI draft เพิ่มเมื่อมี Vercel AI Gateway API key ของตนเอง:

```env
AI_GATEWAY_API_KEY=ใส่คีย์จริงในเครื่องเท่านั้น
HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true
```

ระบบ pin โมเดลไว้ที่ `nvidia/nemotron-3.5-lightning-free` ซึ่ง Vercel AI Gateway catalog แสดงราคา input/output เป็น $0 ในเวลาที่ตรวจสอบ และไม่อ่าน model override จาก `.env.local` เพื่อป้องกันการเรียกโมเดลเสียเงินโดยไม่ตั้งใจ จึงไม่ต้องซื้อเครดิตสำหรับโมเดลนี้ตามราคาปัจจุบัน แต่สถานะราคา/การให้บริการอาจเปลี่ยนได้ในอนาคต

เก็บ API key ไว้ใน `.env.local` เท่านั้น ห้ามส่ง key ในแชตหรือ commit ลง GitHub หากไม่มี key ระบบยังค้นและแสดงหลักฐานได้ตามปกติ แต่จะไม่สร้างคำตอบด้วย AI

อย่า commit `.env.local`, AI API key, SQLite database, backup, raw documents, หรือ Ollama model files

## วิธีทำงาน

1. Browser ตรวจสถานะด้วย `GET /api/health-assistant/sqlite-search`; เมื่อพบการตั้งค่า SQLite local จะส่งเฉพาะคำถามไปยัง `POST /api/health-assistant/sqlite-search`. หากไม่ได้ตั้งค่า จึงใช้ Health Assistant chat path เดิม.
2. Safety preflight จะ block emergency/personal-medical queries ก่อนเปิด subprocess
3. Node เรียก Python ด้วย `execFile` โดยไม่ผ่าน shell และส่ง query เป็น argv แยก
4. Python ค้นด้วย Public audience เท่านั้น แล้วคืน JSON
5. TypeScript ตรวจ schema, public audience, access policy, extraction quality, HTTPS domain allow-list และ excerpt limit ก่อนส่งไปยัง browser
6. เมื่อเปิด draft flag และมี AI Gateway credential, Node จะส่งเฉพาะคำถามปัจจุบันกับ public excerpts ไปยัง AI Gateway; ไม่ส่งประวัติสนทนา โดยใช้ NVIDIA Nemotron 3.5 Lightning Free
7. ตัวตรวจคำตอบบังคับ citation marker ที่ตรงกับผลค้น, ปฏิเสธ marker ที่ไม่มีจริง, ย่อหน้าที่ไม่มี citation และคำแนะนำเรื่องยา/ขนาดยา; เมื่อ AI ใช้งานไม่ได้หรือคำตอบไม่ผ่าน validation ระบบจะ fallback เป็น evidence-only

## ข้อจำกัด

- `quality_status=ok` และ `extraction_method=legacy_unknown` ไม่ได้แปลว่าผ่าน clinical review
- Retrieval rank/similarity ไม่ใช่คะแนนความถูกต้องทางการแพทย์
- Excerpt อาจเป็นส่วนหนึ่งของเอกสาร ไม่ใช่เอกสารฉบับเต็ม
- ข้อความที่ไม่มีวันที่เผยแพร่ใน metadata จะแสดงว่าไม่ระบุ ไม่อนุมานวันที่จากเวลาค้นคืน
- SQLite endpoint ใช้ได้เฉพาะบนเครื่องเดียวกับฐานข้อมูล; AI draft ใช้ Vercel AI Gateway ผ่าน server-side key และไม่ใช้ Qwen 0.8B ในเครื่อง\n- NVIDIA provider ที่ให้บริการโมเดล Free อาจเก็บ prompts/responses เพื่อปรับปรุงโมเดล; ห้ามส่งข้อมูลระบุตัวบุคคลหรือข้อมูลผู้ป่วย แม้ระบบจะบล็อกคำถามสุขภาพเฉพาะบุคคลที่ตรวจพบได้ก็ตาม
- AI draft เป็นเพียงร่างเพื่อการศึกษา แม้ผ่าน citation validation ก็ไม่ได้ยืนยันความถูกต้องทางคลินิก
- คำตอบฉุกเฉิน การวินิจฉัย อาการเฉพาะบุคคล การแปลผลตรวจ และการคำนวณขนาดยาไม่อยู่ในขอบเขตของระบบนี้

การเปิดใช้เป็นคำตอบสุขภาพที่ผ่านการรับรองต้องผ่านการทบทวนโดยผู้เชี่ยวชาญและชุดประเมินความถูกต้องแยกต่างหาก

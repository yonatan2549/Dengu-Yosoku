# Local SQLite RAG Integration (ภาษาไทย)

## ขอบเขต

Health Assistant รุ่นนี้ค้นหลักฐานจาก SQLite Knowledge Base ที่อยู่บนเครื่อง Windows ของผู้พัฒนา โดยเรียก Python retrieval CLI แบบ local-only และแสดงเฉพาะผลที่ผ่าน Public Evidence Policy

- ใช้ `scripts/search.py` และ `knowledge-base/knowledge.db` จากโฟลเดอร์ในเครื่อง
- บังคับ `--audience public`, `--top-k 5`, `--per-source 2`, `--output-format json`
- ไม่เปิด review audience ผ่าน API
- ไม่เรียกโมเดลสร้างคำตอบ; หน้าเว็บแสดง excerpts และแหล่งต้นทางเท่านั้น
- Production ปิด endpoint นี้ และ endpoint รับคำขอเฉพาะ loopback + same-origin ใน local development

## ตั้งค่าเครื่องพัฒนา

เก็บฐานข้อมูลและไฟล์ต้นฉบับไว้ภายนอก Git repository เช่น `D:\AI\DengueYosoku` และตั้งค่าใน `.env.local` ภายใน `dengueguard-vercel`:

```env
DENGUE_RAG_PROJECT_DIR=D:/AI/DengueYosoku
DENGUE_RAG_PYTHON=py
```

อย่า commit `.env.local`, SQLite database, backup, raw documents, หรือ Ollama model files

## วิธีทำงาน

1. Browser ตรวจสถานะด้วย `GET /api/health-assistant/sqlite-search`; เมื่อพบการตั้งค่า SQLite local จะส่งเฉพาะคำถามไปยัง `POST /api/health-assistant/sqlite-search`. หากไม่ได้ตั้งค่า จึงใช้ Health Assistant chat path เดิม.
2. Safety preflight จะ block emergency/personal-medical queries ก่อนเปิด subprocess
3. Node เรียก Python ด้วย `execFile` โดยไม่ผ่าน shell และส่ง query เป็น argv แยก
4. Python ค้นด้วย Public audience เท่านั้น แล้วคืน JSON
5. TypeScript ตรวจ schema, public audience, access policy, extraction quality, HTTPS domain allow-list และ excerpt limit ก่อนส่งไปยัง browser
6. หน้าเว็บแสดงแหล่งอ้างอิงและข้อความต้นทาง โดยไม่มี generative answer

## ข้อจำกัด

- `quality_status=ok` และ `extraction_method=legacy_unknown` ไม่ได้แปลว่าผ่าน clinical review
- Retrieval rank/similarity ไม่ใช่คะแนนความถูกต้องทางการแพทย์
- Excerpt อาจเป็นส่วนหนึ่งของเอกสาร ไม่ใช่เอกสารฉบับเต็ม
- ข้อความที่ไม่มีวันที่เผยแพร่ใน metadata จะแสดงว่าไม่ระบุ ไม่อนุมานวันที่จากเวลาค้นคืน
- Local endpoint ใช้ได้เฉพาะบนเครื่องเดียวกับ SQLite และ Ollama; ไม่สามารถทำงานใน Vercel production
- คำตอบฉุกเฉิน การวินิจฉัย อาการเฉพาะบุคคล การแปลผลตรวจ และการคำนวณขนาดยาไม่อยู่ในขอบเขตของระบบนี้

การเปิดใช้เป็นคำตอบสุขภาพที่ผ่านการรับรองต้องผ่านการทบทวนโดยผู้เชี่ยวชาญและชุดประเมินความถูกต้องแยกต่างหาก

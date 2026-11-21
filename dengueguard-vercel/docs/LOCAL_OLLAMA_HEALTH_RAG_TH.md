# DengueYosoku Local Health RAG (ภาษาไทย)

เอกสารนี้อธิบายการทดลอง Local RAG บนเครื่อง Windows โดยใช้ Ollama เท่านั้น ไม่ใช้ Vercel AI Gateway หรือ API key ภายนอก

## สถาปัตยกรรม

1. Knowledge corpus: ข้อความภาษาไทยที่เรียบเรียงใหม่จากแหล่งสาธารณสุขทางการและเก็บ metadata/URL/date ไว้ทุก chunk
2. Embedding: Qwen3 Embedding 0.6B สร้างเวกเตอร์ของ chunk และคำถามภายใน Ollama
3. Retrieval: cosine similarity, จำกัดไม่เกิน 2 chunks ต่อแหล่งข้อมูล และตั้ง similarity floor เพื่อให้ระบบ abstain เมื่อหลักฐานไม่ตรง
4. Generation: Qwen 3.5 0.8B สร้างร่างคำตอบจาก passages ที่ค้นคืน
5. Validation: ตรวจ source markers, ปฏิเสธ marker ปลอม/ย่อหน้าที่ไม่มี citation และปฏิเสธข้อความ Thinking/Analysis ที่หลุดมา
6. Safety: คำถามฉุกเฉินและข้อมูลสุขภาพเฉพาะบุคคลถูกสกัดก่อนเรียกโมเดลตาม Safety Gateway เดิม

## แหล่งข้อมูลเริ่มต้น

- WHO, Dengue, published 21 August 2025: https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue
- CDC, Clinical Features of Dengue, updated 15 May 2025: https://www.cdc.gov/dengue/hcp/clinical-signs/index.html
- CDC, Clinical Care of Dengue, 15 April 2026: https://www.cdc.gov/dengue/hcp/clinical-care/
- CDC, Clinical Testing Guidance for Dengue, 26 August 2025: https://www.cdc.gov/dengue/hcp/diagnosis-testing/index.html
- กรมควบคุมโรค, แนวทางและคู่มือปฏิบัติงานโรคไข้เลือดออก (หน้าแหล่งรวมเอกสาร; ตรวจพบการปรับปรุง 20 พฤศจิกายน 2569): https://ddc.moph.go.th/dvb/pagecontent.php?dept=dvb164&page=17

ข้อจำกัด: dataset นี้เป็นข้อความสรุปภาษาไทยที่เรียบเรียงใหม่ ไม่ใช่การดาวน์โหลดหรือทำดัชนีเอกสารฉบับเต็ม จึงต้องเรียกว่า curated-source vector RAG ไม่ใช่ full-document RAG เอกสารทุกชิ้นยังมีสถานะ awaiting_clinical_review

## ติดตั้งโมเดล Embedding

เปิด Ollama ให้ทำงานอยู่ จากนั้นเปิด PowerShell:

\`\`\`powershell
ollama pull qwen3-embedding:0.6b
\`\`\`

รุ่นนี้มีขนาดประมาณ 639 MB และรองรับมากกว่า 100 ภาษา รวมถึงภาษาไทยผ่าน multilingual capability

## ตั้งค่า Local Development

ในโฟลเดอร์ dengueguard-vercel ให้คัดลอก .env.example เป็น .env.local (ถ้ายังไม่มี) แล้วเพิ่ม:

\`\`\`env
HEALTH_ASSISTANT_PROVIDER=ollama-local
HEALTH_ASSISTANT_MODEL=qwen3.5:0.8b
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b
LOCAL_HEALTH_RAG_MIN_SIMILARITY=0.30
\`\`\`

ห้ามตั้ง HEALTH_ASSISTANT_PROVIDER=ollama-local ใน Vercel หรือ Production ระบบบล็อก provider นี้นอก local development อยู่แล้ว

## สร้าง Vector Index

ต้องให้ Ollama ทำงาน และติดตั้ง embedding model ก่อน:

\`\`\`powershell
npm.cmd run health:rag:index
\`\`\`

Script จะ embed 13 knowledge chunks เป็น batch และสร้างไฟล์ที่:

\`\`\`text
data/health-assistant/.local/vector-index.json
\`\`\`

ไฟล์ index นี้มี embeddings และถูก ignore โดย Git เพื่อไม่ commit ไฟล์ machine-generated

## ทดสอบ

\`\`\`powershell
npm.cmd run test:local-health-rag
npm.cmd run typecheck
\`\`\`

เริ่มเว็บไซต์ local ด้วย:

\`\`\`powershell
npm.cmd run dev
\`\`\`

จากนั้นเปิด Health Assistant ใน local dev และทดสอบคำถามทั่วไป เช่น:
- ไข้เลือดออกเกิดจากอะไร
- อาการเตือนของไข้เลือดออกมีอะไรบ้าง
- NS1 กับ IgM แตกต่างกันอย่างไร

ทดสอบ negative cases ด้วย:
- โรคที่ไม่เกี่ยวข้องกับไข้เลือดออก (ควร abstain หาก similarity ไม่ถึงเกณฑ์)
- รายงานอาการฉุกเฉินหรืออาการของผู้ป่วยเฉพาะบุคคล (ต้องถูก Safety Gateway สกัดก่อนส่งเข้า Ollama)

## ข้อจำกัดและ Release Gate

- AI output ทุกคำตอบเป็น draft เพื่อการศึกษาเท่านั้น
- ยังไม่มี clinical sign-off; ห้ามใช้วินิจฉัย คัดกรองจริง หรือแนะนำการรักษาเฉพาะบุคคล
- คำถามฉุกเฉินและ personal-health/lab-value queries ต้องไม่ถูกส่งไปยัง Ollama
- Local Ollama ใช้ได้เฉพาะ Next.js development บนเครื่องเดียวกับ Ollama; Vercel serverless ไม่สามารถเข้าถึง Ollama บนเครื่องผู้พัฒนาได้
- Full-document PDF/HTML ingestion, OCR, source-content licensing review, Thai clinical review, broader evaluation set และ adversarial red-team tests ยังไม่เสร็จ
- Threshold 0.30 เป็นค่าเริ่มต้นเชิงทดลอง ต้องปรับจากชุดคำถามภาษาไทยที่มี positive/negative labels ก่อนใช้งาน
- No patient chat or lab values are used for model training or embedding index creation.

## API behavior

- Ollama embedding: POST http://127.0.0.1:11434/api/embed
- Ollama chat: POST http://127.0.0.1:11434/api/chat (stream=false, think=false)
- Chat output uses only message.content; message.thinking is never returned to the client.

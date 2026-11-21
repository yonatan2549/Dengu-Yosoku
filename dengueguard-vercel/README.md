# DengueYosoku

แพลตฟอร์มดิจิทัลเพื่อการเฝ้าระวัง ป้องกัน คัดกรอง และเรียนรู้เรื่องโรคไข้เลือดออก พัฒนาด้วย Next.js และ TypeScript โดยเน้นการแสดงที่มาของข้อมูล การแยกผลพยากรณ์ทดลองออกจากข้อมูลเฝ้าระวังจริง และการป้องกันไม่ให้ระบบแจ้งเตือนหรือให้คำแนะนำทางการแพทย์เกินกว่าหลักฐานที่มี

> **สถานะเพื่อการส่งโครงงาน (21 พฤศจิกายน 2026):** GitHub Actions บน integration branch ผ่านครบใน run #231 แต่ Preview ของ commit ก่อนหน้ามีแล้ว แต่ต้องตรวจ SHA ให้ตรงกับโค้ดล่าสุดก่อนสาธิต จึงต้องรันและสาธิตจากเครื่อง local หรือใช้ Preview ที่ตรงกับ commit หลังตรวจสอบ SHA แล้วเท่านั้น ระบบนี้ยังไม่ใช่เครื่องมือวินิจฉัยหรือระบบเตือนภัยสาธารณสุขที่ผ่านการรับรอง

## ฟีเจอร์หลัก

- **Dashboard:** แสดงข้อมูลภาพรวมการเฝ้าระวังและข้อมูลแนวโน้มที่มีแหล่งอ้างอิง โดยแยกสถิติระดับประเทศออกจากผลพยากรณ์ของโมเดล
- **Prevention:** คำแนะนำการป้องกันโรคและรายการตรวจสอบพฤติกรรมกำจัดแหล่งเพาะพันธุ์ยุงตามหลัก 3 เก็บ
- **Symptom Checker:** แบบประเมินอาการเบื้องต้นและสัญญาณอันตรายเพื่อให้ผู้ใช้ตัดสินใจขอความช่วยเหลือจากบุคลากรทางการแพทย์ ไม่ใช่เครื่องมือวินิจฉัย
- **Health Assistant / Knowledge:** ค้นคืนสาระความรู้พร้อมแหล่งอ้างอิง; AI-generated draft จำกัดเฉพาะ local/Preview ที่เปิดใช้อย่างชัดเจน ขณะที่ Production คงรูปแบบ evidence-only
- **Alert Center:** โครงสร้างการจัดการกฎ ร่างการประเมิน เหตุการณ์ และการทบทวนโดยผู้เชี่ยวชาญ โดยยังไม่เปิดใช้การแจ้งเตือนออกภายนอก
- **Model Operations:** ตรวจสอบความพร้อม ความสดใหม่ ความสมบูรณ์ และความสอดคล้องของ artifacts ก่อนอนุญาตให้ส่วนอื่นนำโมเดลไปใช้
- **References / About:** แสดงแหล่งข้อมูลและขอบเขตของระบบ

## Model Snapshot 77 จังหวัดล่าสุด (ข้อมูล ณ 21 พฤศจิกายน 2026)

ขณะนี้ repository มีผลพยากรณ์ทดลองครบ **77/77 จังหวัด** อยู่ใน `public/data/model_predictions.json`:
- สัปดาห์เป้าหมายเริ่ม **15 พฤศจิกายน 2026** และมีข้อมูลผู้ป่วยรายสัปดาห์ถึง **8 พฤศจิกายน 2026**
- สร้างเมื่อ 21 พฤศจิกายน 2026 เวลา 02:18 UTC และมี Metrics Revision ตรงกับ model export
- Retrospective holdout 26 สัปดาห์ / 2,002 province-weeks: MAE 3.943 ราย, RMSE 6.340 ราย, WAPE 27.17%; MAE ต่ำกว่า persistence baseline 9.12%
- ผล holdout มาจากข้อมูลย้อนหลังที่เผยแพร่แล้ว ไม่ใช่ sealed independent blind test
- สถานะ export คือ `review_only`: ใช้แสดงเพื่อตรวจทานโมเดลได้ แต่ไม่อนุญาตใช้เป็นสถานะความเสี่ยงปัจจุบัน สร้าง Alert หรือส่งแจ้งเตือนประชาชน
- Snapshot จะ stale เมื่อสัปดาห์ระบาดวิทยาเปลี่ยนเป็น 22 พฤศจิกายน 2026 หากไม่มี weekly input ชุดใหม่ที่ได้รับอนุญาตและผ่านการตรวจ

## Draft Thresholds สำหรับโมเดล 77 จังหวัด

มีการคำนวณ Candidate ครบ 77 จังหวัดจากข้อมูลผู้ป่วยรายสัปดาห์ 26 สัปดาห์ (Watch=P75 / Alert=P90, Type-7) พร้อม temporal split และ leave-one-week-out sensitivity report:
- [รายงานวิธีคำนวณและผลตรวจ](docs/NATIONAL_ALERT_THRESHOLDS_77_TH.md)
- [ไฟล์ JSON Candidate](public/data/alert_threshold_candidates_77.json)

Candidate นี้ยังเป็น Draft, ไม่ใช่ threshold ที่อนุมัติแล้ว และจะไม่สร้าง Alert Candidate หรือจำแนกระดับความเสี่ยงทั่วประเทศ เพราะ Model Snapshot ต้นทางยังเป็น `review_only` และ stale สำหรับสัปดาห์ 22 พ.ย. 2026 การบันทึกค่าเข้า Supabase ทำได้ผ่าน Admin Draft workflow ที่มี audit log เท่านั้น; external notifications ยังคงปิด

## สิ่งที่ต้องทราบก่อนสาธิต

1. แผนที่/แนวโน้ม ODPC4 เป็นข้อมูลชุดประวัติศาสตร์ ไม่ใช่การพยากรณ์ปัจจุบันครบ 77 จังหวัด
2. สายงานพัฒนาโมเดล 77 จังหวัดเป็นงานพัฒนาและประเมินย้อนหลัง ผล holdout เป็น retrospective benchmark ไม่ใช่ blind test ที่ปิดผนึก
3. ห้ามนำผลพยากรณ์ทดลองที่เก่าหรือ stale ไปแสดงเป็นสถานการณ์ปัจจุบัน ปัจจุบัน Model Operations จะปิดกั้นการใช้งานเมื่อไฟล์ Prediction/Metrics ที่ต้องใช้ไม่พร้อมหรือไม่ผ่านเงื่อนไข
4. Alert Rule Profile ยังเป็น Draft และยังไม่มี threshold 77 จังหวัดที่ผ่าน independent review; LINE, SMS, Email และการแจ้งเตือนภายนอกยังปิดอยู่
5. เนื้อหา Knowledge Registry ยังรอการทบทวนทางคลินิก การอนุมัติสำหรับการสาธิตเชิงวิชาการไม่ใช่การรับรองทางการแพทย์
6. ห้ามป้อนชื่อ-นามสกุล HN/AN เบอร์โทร วันเกิด อาการเฉพาะบุคคล หรือผลแล็บของผู้ป่วยจริงให้ Health Assistant Preview

## เริ่มต้นใช้งานบนเครื่อง

### ข้อกำหนด

- Node.js 20.9 หรือใหม่กว่า
- npm
- Git

### ติดตั้งและเปิดเว็บ

เปิด Terminal ในโฟลเดอร์ `dengueguard-vercel`:

```bash
npm install
npm run dev
```

จากนั้นเปิด <http://localhost:3000>

**Windows PowerShell:** หาก PowerShell บล็อก `npm.ps1` ให้ใช้ `npm.cmd` แทน เช่น

```powershell
npm.cmd install
npm.cmd run dev
```

### Environment variables

ไฟล์ `.env.example` เป็นตัวอย่างเท่านั้น ให้คัดลอกเป็น `.env.local` เฉพาะเมื่อจำเป็นต้องใช้บริการที่เกี่ยวข้อง

- `SUPABASE_URL` และ `SUPABASE_ANON_KEY`: ใช้กับเส้นทาง Auth ที่เชื่อมต่อ Supabase; ห้ามใส่ service-role key ในฝั่ง client
- `AI_GATEWAY_API_KEY`: ใช้เป็น credential ฝั่ง server สำหรับ AI Gateway ใน local development เท่านั้นเมื่อจำเป็น
- `HEALTH_ASSISTANT_MODEL`: ชื่อโมเดลที่ต้องการใช้
- `HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=true`: เปิด AI draft เฉพาะ local development หรือ Vercel Preview ตาม runtime policy; Production ยังคง evidence-only

**ข้อควรระวัง:** ห้าม commit `.env.local`, API key, access token, service-role key หรือข้อมูลผู้ป่วย และห้ามใช้ prefix `NEXT_PUBLIC_` กับ credential ลับ

## ตรวจสอบก่อนส่งงาน

คำสั่งพื้นฐาน:

```bash
npm run typecheck
npm run build
```

ชุดทดสอบแยกตามส่วน เช่น:

```bash
npm run test:dashboard-view
npm run test:assessment
npm run test:health-knowledge
npm run test:health-evidence
npm run test:health-assistant-chat
npm run test:health-assistant-source-policy
npm run test:health-knowledge-governance
npm run test:health-knowledge-rag
npm run test:alerts
npm run test:alert-lifecycle
npm run test:alert-workflows
npm run test:model-validation
npm run test:model-release-integrity
npm run test:model-temporal-monitor
npm run test:model-artifact-pipeline
```

CI บน GitHub เป็นผลตรวจชุดรวมที่ใช้อ้างอิงสำหรับ commit นั้น ๆ: [DengueYosoku web CI #231](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44865828911) — passed บน commit `92629dad0de4d0fd206e70151e2d6a418a5a1da0` (21 พ.ย. 2026) การผ่าน CI ไม่ได้หมายถึงโมเดลผ่านการรับรองทางคลินิกหรือระบบพร้อมใช้งาน Production

## โครงสร้างสำคัญ

- `app/`: Next.js routes และ API routes
- `components/`: UI components
- `lib/health-assistant/`: Knowledge, evidence, source policy, chat contract และ provider
- `lib/model/`: model loading, validation, diagnostics และ release checks
- `lib/alerting/`: alert engine, rule profile, lifecycle และ review workflow
- `database/migrations/`: SQL migrations; ตรวจสอบสถานะ remote database และ migration history ก่อนนำไปใช้จริง
- `scripts/`: regression tests และ model pipeline scripts
- `docs/`: เอกสารการพัฒนา การกำกับดูแล และคู่มือส่งมอบ

## ขอบเขตการใช้งานและความปลอดภัย

DengueYosoku เป็นโครงงานต้นแบบเพื่อการศึกษาและสนับสนุนการเรียนรู้ ข้อมูลจาก Dashboard, ผลโมเดล และคำตอบ Health Assistant อาจมีข้อจำกัดด้านเวลา ความครอบคลุม และการทบทวนโดยผู้เชี่ยวชาญ ไม่ใช้แทนคำแนะนำจากแพทย์ ไม่ใช้วินิจฉัย และไม่ใช้เป็นฐานตัดสินใจรักษาผู้ป่วย หากมีอาการรุนแรงหรือสัญญาณอันตรายให้ไปสถานพยาบาลหรือโทร 1669 ทันที

ดูคู่มือประกอบการส่งงานที่ [docs/SUBMISSION_GUIDE_TH.md](docs/SUBMISSION_GUIDE_TH.md), ลำดับสาธิตที่ [docs/DEMO_CHECKLIST_TH.md](docs/DEMO_CHECKLIST_TH.md) และตารางสถานะที่ [docs/PROJECT_STATUS_MATRIX_TH.md](docs/PROJECT_STATUS_MATRIX_TH.md)

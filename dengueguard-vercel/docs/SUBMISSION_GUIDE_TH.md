# คู่มือส่งมอบโครงงาน DengueYosoku

**วันที่จัดทำ:** 21 พฤศจิกายน 2026  
**Repository:** `yonatan2549/Dengu-Yosoku`  
**Branch อ้างอิง:** `integration/phase9-12-final-review`

## 1. บทคัดย่อของระบบ

DengueYosoku เป็นแพลตฟอร์มเว็บเพื่อสนับสนุนการเฝ้าระวัง การป้องกัน การคัดกรองเบื้องต้น และการเรียนรู้เรื่องโรคไข้เลือดออก ประกอบด้วย Dashboard, Prevention, Symptom Checker, Health Assistant/Knowledge, Alert Center และ Model Operations ระบบออกแบบให้แยกข้อมูลเฝ้าระวังที่มีแหล่งอ้างอิงออกจากผลพยากรณ์ทดลอง พร้อมตรวจสอบความพร้อมและความสดใหม่ของ artifacts ก่อนอนุญาตให้โมดูล downstream ใช้งาน

ระบบเป็นต้นแบบเชิงวิชาการ ไม่ใช่อุปกรณ์การแพทย์หรือระบบเตือนภัยสาธารณสุขที่ผ่านการรับรอง

## 2. วัตถุประสงค์

1. รวมการสื่อสารข้อมูลความรู้และแนวทางป้องกันไข้เลือดออกไว้ในจุดเดียว
2. ทำให้ผู้ใช้เห็นข้อมูลเฝ้าระวังและแนวโน้มโดยคำนึงถึงที่มาและช่วงเวลาของข้อมูล
3. สนับสนุนการสังเกตอาการและสัญญาณอันตราย โดยไม่วินิจฉัยโรค
4. ทดลองพัฒนาโมเดลพยากรณ์รายจังหวัดและวางระบบตรวจสอบก่อนเผยแพร่
5. สร้างกระบวนการกำกับดูแลความรู้และ Alert Rules โดยแยกผู้จัดทำออกจากผู้ทบทวน

## 3. โมดูลและสิ่งที่ผู้ใช้ทำได้

| โมดูล | ความสามารถ | ขอบเขต |
|---|---|---|
| Dashboard | ดูข้อมูลภาพรวม สถิติที่อ้างอิงแหล่งข้อมูล และแนวโน้ม | สถิติรายงานระดับประเทศไม่ใช่ผลโมเดลรายจังหวัด; แผนที่/แนวโน้ม ODPC4 เป็นข้อมูลประวัติศาสตร์ |
| Prevention | อ่านคำแนะนำและทำ checklist การป้องกันตามหลัก 3 เก็บ/ป้องกันยุงกัด | เป็นคำแนะนำทั่วไป ไม่ใช่คำสั่งจากการประเมินความเสี่ยงเฉพาะบ้าน |
| Symptom Checker | กรอกข้อมูลอาการและตรวจสัญญาณเตือน/ฉุกเฉิน | ไม่ใช่การวินิจฉัย; เมื่อมีสัญญาณอันตรายต้องพบแพทย์ทันที |
| Health Assistant | ค้นคืนคำตอบความรู้พร้อมแหล่งอ้างอิง; Preview อาจแสดง AI draft เมื่อผ่านเงื่อนไข | Production เป็น evidence-only; ห้ามใช้ข้อมูลผู้ป่วยจริง; เนื้อหายังรอ clinical review |
| Knowledge / References | อ่านองค์ความรู้และดูแหล่งอ้างอิง | Registry มี 6 ระเบียนและยังรอการทบทวนทางคลินิก |
| Alert Center | จัดการ Rule Profile แบบ Draft, ทดลองประเมิน, workflow เหตุการณ์และการทบทวน | ไม่มี threshold ครบ 77 จังหวัดที่ผ่าน independent review; ไม่ส่ง LINE/SMS/Email |
| Model Operations | ตรวจ freshness, validation, integrity, readiness และสถานะ artifacts | ปิดกั้นเมื่อ artifacts ที่จำเป็นขาด/เก่า/ไม่ผ่าน; ไม่สร้าง forecast ทดแทนขึ้นเอง |

## 4. ภาพรวมสถาปัตยกรรม

- **Frontend:** Next.js App Router, React และ TypeScript
- **Business logic:** แยกใน `lib/` เช่น model, alerting, assessment และ health-assistant
- **API:** Next.js route handlers สำหรับ readiness, evidence/chat, model diagnostics และ alert workflows
- **Database/Auth:** มี Supabase integration และ SQL migrations ใน repository; การนำ migration ไปใช้กับฐานข้อมูลที่มีอยู่ต้องตรวจ schema และ migration ledger ก่อน ห้ามรันซ้ำโดยไม่ reconcile
- **AI provider:** Vercel AI Gateway ผ่าน server-side provider; credential ไม่ส่งไป browser
- **CI:** GitHub Actions ตรวจ TypeScript, regression suites และ Next.js production build
- **Deployment:** Vercel Preview/Production แยก environment และ branch; ห้ามนำ Preview configuration ไปตั้ง Production โดยไม่ review

## 5. ข้อมูลและโมเดลพยากรณ์

### 5.1 ข้อมูลเฝ้าระวัง

Dashboard มีข้อมูลอ้างอิงระดับประเทศและแหล่งข้อมูลประกอบ โดยต้องแสดงวันที่ของรายงานและช่วงเวลาที่ข้อมูลครอบคลุมเสมอ ตัวเลขที่เผยแพร่จากระบบเฝ้าระวังเป็นจำนวนรายงาน/ผู้ป่วยสงสัยตามนิยามแหล่งข้อมูล ไม่ควรเปลี่ยนคำเรียกให้กลายเป็นผู้ป่วยยืนยันหรือผลพยากรณ์ของ DengueYosoku

### 5.2 ขอบเขต 8 จังหวัดกับ 77 จังหวัด

- แผนที่/ชุดแนวโน้ม ODPC4 เดิมเป็นข้อมูลประวัติศาสตร์ 8 จังหวัด
- มี Model Snapshot ทดลอง 77/77 จังหวัดใน `public/data/model_predictions.json` และ Metrics ที่ Revision ตรงกัน
- Snapshot นี้มี target week เริ่ม **15 พ.ย. 2026** และ weekly case input ถึง **8 พ.ย. 2026** สร้างเมื่อ 21 พ.ย. 2026 เวลา 02:18 UTC
- สถานะเป็น `review_only`: แสดงผลบน Dashboard เพื่อทบทวนได้ แต่ไม่อนุญาตใช้จัดระดับความเสี่ยงปัจจุบัน สร้าง Alert Candidate หรือแจ้งเตือนประชาชน
- เมื่อเข้าสัปดาห์ระบาดวิทยาใหม่ที่เริ่ม **22 พ.ย. 2026** Snapshot นี้จะ stale หากไม่มีข้อมูลรายสัปดาห์ชุดใหม่ที่ได้รับอนุญาตและผ่าน audit/release checks
- การมี GeoJSON 77 จังหวัดหรือ Snapshot review-only ไม่ได้แปลว่ามี nowcast ที่ผ่านการอนุมัติครบ 77 จังหวัด

### 5.3 วิธีประเมินและข้อจำกัด

สายงาน Phase 13 เปรียบเทียบโมเดล LightGBM Quantile 0.5 กับ baseline เช่น persistence และ seasonal-naive โดยใช้ expanding temporal cross-validation 4 folds, validation 8 สัปดาห์ต่อ fold, embargo gap 4 สัปดาห์ และ rolling-origin retrospective holdout 26 สัปดาห์ (2,002 province-weeks) สำหรับ Snapshot ปัจจุบัน Metrics คือ MAE 3.943, RMSE 6.340, WAPE 27.17%; MAE ต่ำกว่า persistence baseline ประมาณ 9.12% ผล holdout เป็น retrospective benchmark เนื่องจากข้อมูลย้อนหลังและคำตอบถูกเผยแพร่แล้ว ไม่ใช่ sealed blind test และไม่ใช่หลักฐานยืนยันประสิทธิภาพในอนาคต

ก่อนเผยแพร่ snapshot ใหม่ต้องมีข้อมูลสัปดาห์ล่าสุดที่ได้รับอนุญาต, audit คีย์ province-week, target-week leakage check, metrics และ release checks ครบ ห้ามสร้างตัวเลขแทนข้อมูลที่ขาด

## 6. AI Health Assistant และการคุ้มครองข้อมูล

- AI-generated educational draft ทำงานได้เฉพาะ local development หรือ Preview ที่เปิด feature flag อย่างชัดเจนและผ่าน runtime/safety/evidence/source policy
- Production คงเป็น evidence-only ขณะที่ clinical review ยังไม่เสร็จ
- ระบบค้นคืนแบบ lexical จาก summaries/key points ของ Knowledge Registry ยังไม่ใช่ full-document หรือ vector RAG
- คำถามฉุกเฉิน อาการเฉพาะบุคคล คำถามยา และข้อมูลผลแล็บส่วนบุคคลถูกกันออกจาก AI provider
- คำตอบที่เป็นข้อเท็จจริงต้องมี source markers ที่ตรวจสอบกับหลักฐานที่ค้นคืนได้; หากไม่ผ่านให้ abstain
- ห้ามป้อนชื่อ HN/AN เบอร์โทร วันเกิด ที่อยู่ อาการเฉพาะบุคคล หรือผลตรวจผู้ป่วยจริง
- การอนุมัติ project-owner สำหรับ academic demonstration ไม่ใช่ clinical endorsement

## 7. ความปลอดภัยของ Alert Center

Alert Rules ต้องผ่านการทบทวนโดยผู้มีอำนาจอย่างเป็นอิสระ และมี threshold ที่สมบูรณ์สำหรับ 77 จังหวัด พร้อมหลักฐานที่ตรวจสอบได้ ก่อนมีผลต่อการจัดระดับความเสี่ยงหรือแจ้งเตือนจริง ปัจจุบัน Rule Profile ยังเป็น Draft และไม่มี threshold ที่อนุมัติครบ จึงไม่ควรเปิดใช้ national risk classification หรือ external notification

SQL migrations เป็นไฟล์ source ใน repository เท่านั้น การเชื่อมฐานข้อมูลจริงต้องตรวจ remote schema, RLS, trigger และ migration history ก่อนทำการเปลี่ยนแปลง

## 8. หลักฐานการทดสอบ

ผล GitHub Actions ที่ตรวจสอบได้:
- Workflow: **DengueYosoku web CI**
- Run: [#228](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44865828911)
- Commit: `92629dad0de4d0fd206e70151e2d6a418a5a1da0`
- ผล: **completed / success** ณ 21 พฤศจิกายน 2026

ครอบคลุม TypeScript, Dashboard selection, Alert engine/lifecycle/profile/readiness, Symptom Checker assessment, model validation/freshness/loader/performance/operations/release integrity, Health Knowledge, Health Assistant evidence/chat/source policy/governance/RAG, model temporal monitor/refresh/snapshot/consumer readiness, source policy, Python model artifact pipeline, release source guard และ Next.js Production build

หลักฐาน CI ยืนยันว่า code ใน commit นั้นผ่านการตรวจที่กำหนด ไม่ได้ยืนยัน clinical validity, security penetration test, production deployment หรือ readiness ของข้อมูลพยากรณ์ล่าสุด

## 9. สถานะ Deployment ณ วันจัดทำ

- PR #2 ยังเป็น Draft/Open; ยังไม่ merge
- PR #3 เป็น branch ที่มีประวัติแตกต่างและไม่ควร merge ทั้งก้อน
- Vercel Preview ของ integration commit ล่าสุดสร้างไม่สำเร็จเพราะ daily deployment API/build limit
- Deployment Production เดิมไม่ได้ถูกแทนที่จากงาน integration นี้
- จึงต้องสาธิต local หรือ Preview ที่ตรวจสอบ commit SHA ให้ตรงกับ ZIP ก่อนเท่านั้น

## 10. แนวทางนำเสนอ

ลำดับสาธิตและ checklist แยกอยู่ใน [DEMO_CHECKLIST_TH.md](DEMO_CHECKLIST_TH.md) ส่วนความพร้อมแต่ละโมดูลอยู่ใน [PROJECT_STATUS_MATRIX_TH.md](PROJECT_STATUS_MATRIX_TH.md)

## 11. ข้อจำกัดและแผนพัฒนาต่อ

1. รับข้อมูล 77 จังหวัดชุดล่าสุดที่ได้รับอนุญาตและทำ reproducible model release
2. ทำ blind/forward temporal evaluation ที่ไม่ใช้ข้อมูลคำตอบซึ่งถูกเปิดเผยแล้ว
3. ให้ผู้เชี่ยวชาญทบทวน Knowledge Registry, clinical safety และข้อความ Symptom Checker
4. ทำ clinical validation และ independent review ของ threshold ก่อนปลดล็อก Alert
5. ทำ rate limit, abuse controls และ monitoring สำหรับ AI Preview ก่อนขยายผู้ใช้
6. ทำ Supabase schema baseline/migration reconciliation ก่อน apply migration ใด ๆ
7. ทดสอบ smoke test บน deployment ที่ตรงกับ commit ก่อนส่งลิงก์เว็บเป็นหลักฐาน

## 12. ข้อความสรุปสำหรับรายงาน

DengueYosoku แสดงให้เห็นการออกแบบระบบดิจิทัลที่รวมข้อมูลเฝ้าระวัง การป้องกัน การคัดกรองเบื้องต้น และองค์ความรู้ไว้ในแพลตฟอร์มเดียว พร้อมวางกลไกตรวจสอบความสดใหม่และความสมบูรณ์ของข้อมูลก่อนนำผลโมเดลไปใช้งาน จุดเด่นของระบบคือการแยกต้นแบบการพยากรณ์ออกจากผลที่พร้อมใช้งานจริง และกำหนดให้การแจ้งเตือนกับคำตอบ AI ต้องอยู่ภายใต้เงื่อนไขด้านหลักฐานและการทบทวนจากผู้เชี่ยวชาญ อย่างไรก็ตาม ระบบยังเป็นต้นแบบเชิงวิชาการและต้องได้รับข้อมูลล่าสุด การประเมินแบบ prospective/independent และการทบทวนทางคลินิกเพิ่มเติมก่อนใช้งานในบริบทสาธารณสุขจริง

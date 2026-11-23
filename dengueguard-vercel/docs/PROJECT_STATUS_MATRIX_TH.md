# ตารางสถานะฟีเจอร์ DengueYosoku

**อัปเดต:** 23 พฤศจิกายน 2026 · ชุดสาธิต/ส่งมอบ PR #5  
ตารางนี้แยกสิ่งที่พัฒนาแล้วออกจากสิ่งที่ยังไม่พร้อมใช้งานจริง เพื่อใช้ประกอบการส่งโครงงาน

| ฟีเจอร์ | สถานะ | สิ่งที่ทำได้ในปัจจุบัน | สิ่งที่ยังขาด/ข้อจำกัด |
|---|---|---|---|
| Dashboard ภาพรวม | พร้อมสาธิต | แสดงข้อมูลเฝ้าระวัง แหล่งอ้างอิง แนวโน้ม และ Popup พยากรณ์ที่จัดรูปแบบใหม่ พร้อมวันที่เป้าหมายและ Snapshot provenance | legacy ODPC4 เป็นข้อมูลประวัติศาสตร์; Model Snapshot 77 จังหวัดยังเป็น Review-only |
| แผนที่ ODPC4 8 จังหวัด | มีชุดข้อมูลเดิม | แสดงขอบเขต/แนวโน้มตามข้อมูลเก่า | ไม่ใช่ความเสี่ยงปัจจุบันทั่วประเทศ |
| แผนที่ขอบเขต 77 จังหวัด | มีขอบเขตแผนที่ | ใช้อ้างอิงพื้นที่จังหวัด | การมีขอบเขตไม่ใช่ข้อมูลพยากรณ์สด |
| โมเดลพัฒนา 77 จังหวัด | pipeline และการประเมินย้อนหลัง | audit แหล่งข้อมูล, temporal CV 4 folds, baseline comparison และ retrospective holdout 26 สัปดาห์ / 2,002 province-weeks | ต้องรับ weekly case export ใหม่ทุกสัปดาห์; holdout เป็นข้อมูลย้อนหลังสาธารณะ ไม่ใช่ sealed blind test |
| Model Snapshot / Operations | มี Snapshot 77 จังหวัดครบ 77/77 ใน repository | target week 2026-11-15 (สัปดาห์ 46/2569); input cases ถึง 2026-11-08; ตรวจ Revision, history coverage และ release status | `review_only`; แสดงพยากรณ์สัปดาห์ 46 ได้ แต่ยังไม่มี actuals รายจังหวัดของสัปดาห์ 46; Snapshot จะ stale เมื่อเริ่มสัปดาห์ 47 วันที่ 2026-11-22 หากไม่มี Snapshot ใหม่ |
| Prevention | พร้อมสาธิต | แถบหัวข้ออยู่บนสุดตามรูปแบบ Dashboard, ไอคอนหลักขนาด 58px, คำแนะนำ 3 เก็บและ checklist รายสัปดาห์ | เป็นคำแนะนำทั่วไป; แยกระบบเดิม 8 จังหวัดจาก Snapshot 77 จังหวัด |
| Symptom Checker | พร้อมสาธิต | แบบประเมินหลายขั้นตอน ตรวจข้อมูลตัวเลข และแสดงสัญญาณเตือน/ฉุกเฉิน; ไอคอนหลักปรับเป็น 58px | ไม่ใช่ diagnosis; ต้องผ่าน clinical review |
| Health Knowledge | พร้อมสาธิต | ค้นคืนหลักฐาน แสดงสรุป/แหล่งอ้างอิง และหมวดความรู้; ไอคอนหลักปรับเป็น 58px | Registry 6 records ยังรอ clinical review |
| Health Assistant | AI พักการพัฒนา / Evidence-only | UI ซ่อนช่องสนทนา AI, มี server-side pause gate โดยค่าเริ่มต้น และเปิดค้นคืนหลักฐานผ่านเครื่องมือแบบพับเก็บได้; ไอคอนหลักปรับเป็น 58px | ไม่มีการสร้างคำตอบ AI ในชุดสาธิต; Knowledge Registry ยังรอ clinical review; retrieval ยังไม่ใช่ full-document/vector RAG |
| Alert Center | มี workflow และ API draft; มี Draft threshold candidate ครบ 77 จังหวัด | คำนวณ Watch=P75 / Alert=P90 จาก 26 สัปดาห์รายจังหวัด; dual-implementation, temporal split 18/8, leave-one-week-out และเทียบ forecast/persistence ผ่าน technical review อัตโนมัติ; โหลด Candidate ให้ Admin editor ได้โดยไม่อนุมัติ | ค่าคำนวณยังเป็น Draft, ต้องมี independent epidemiological/clinical review และผู้มีอำนาจรับรอง; Snapshot เป็น `review_only`, ไม่มี actuals รายจังหวัดของสัปดาห์ 46; forecast micro-F1 ต่ำกว่า persistence และ macro Alert recall 9.3%; ระบบคง Dry-run ภายในและปิด external notifications; ยังไม่จัด national risk จริง |
| Authentication / Supabase | มี integration และ migration source | มี Auth routes และ RLS/migration definitions | ต้อง reconcile remote schema/migration history ก่อน apply migrations เพิ่ม |
| References / About | มีหน้าอ้างอิง/ข้อมูลโครงการ | ใช้ประกอบการตรวจสอบแหล่งข้อมูลและขอบเขต | ต้องอัปเดตเมื่อเพิ่มแหล่งข้อมูลหรือรุ่นโมเดลใหม่ |
| Mobile responsive | ปรับปรุงแล้วและผ่าน Build | Hero icons ยังคงแสดงบนมือถือในขนาดที่เหมาะสม; ตารางจังหวัดเลื่อนแนวนอนได้; Alert Sandbox รองรับจอเล็ก | ยังควรทดสอบบนมือถือและเบราว์เซอร์จริงก่อนวันนำเสนอ |

## การปรับปรุง UI สำหรับการนำเสนอ (23 พ.ย. 2569)

- Dashboard Forecast Popup จัดข้อมูลเป็นสรุป 3 KPI, Top 5 จังหวัด, สัปดาห์เป้าหมาย, วันที่สร้าง Snapshot และสถานะ Review-only
- Prevention ย้าย Feature Hero ไปเป็นแถบบนสุดก่อน Dataset Selector, National Surveillance และ Checklist; ไม่มีการเพิ่มโลโก้แยก และใช้ไอคอน 58px
- ไอคอนหลักของ Symptom Checker, Health Assistant, Knowledge, About/References และ Model Operations ใช้ขนาด 58px ตาม Dashboard; ปรับการแสดงผลบนมือถือไม่ให้ซ่อนไอคอนหลัก
- Alert Center มีสนามจำลองสำหรับการนำเสนอเท่านั้น: 5 สถานการณ์, ผลสังเคราะห์ 77 จังหวัด, ตารางผล, Event Lifecycle, Workflow ทบทวนจำลอง และ CSV export
- Health Assistant ปิดการสร้างคำตอบ AI ใน UI และมี server-side pause gate โดยค่าเริ่มต้น; ค้นคืนหลักฐานแบบ Evidence-only ยังเปิดใช้ได้
- ไม่มีการเปลี่ยน Production, ไม่มีการเปิด external notifications และไม่มีการ Merge PR เข้าสู่ main

## หลักฐานการตรวจสอบโค้ด

- GitHub Actions run [#231](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44865828911)
- Commit: `6effe2b5f0facfc16c1a70b01459cbb07f08cd13`
- ผล: passed, รวม TypeScript, regression tests และ Next.js Production build
- มี Preview deployment จาก commit ก่อนหน้าแล้ว แต่ต้องตรวจว่า SHA ตรงกับ commit ล่าสุด และต้อง smoke test deployment ก่อนใช้อ้างอิง
- PR #4 ยัง Draft/Open และไม่ถูก merge ในเวลาจัดทำเอกสารนี้
- PR #4 head ณ 21 พ.ย. 2026: `c9b7ec1a6bc5bfdff334dabcdf3fd660c9688b78` (Dashboard week-46 labelling, actuals separation, epi-week tests และ Alert governance copy)
- GitHub Actions run [#44897980257](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44897980257): TypeScript, regression, production build และ smoke tests ผ่าน
- GitHub Actions run 44894610035: weekly ZIP intake, model input build, case-only experiment และ Phase 13 12-feature review snapshot ผ่าน; run 44895114319: threshold technical review ผ่าน

## ผลการคำนวณ Threshold 77 จังหวัด (Draft)

- ไฟล์ Candidate: `public/data/alert_threshold_candidates_77.json` และรายงาน `docs/NATIONAL_ALERT_THRESHOLDS_77_TH.md`
- Watch=P75 / Alert=P90 แบบ Type-7 จากข้อมูลจริง 26 สัปดาห์ต่อจังหวัด; คำนวณครบ 77/77 และตรวจด้วย quantile implementation อิสระ
- Temporal split 18/8 สัปดาห์; validation exceedance 158/616 ที่ Watch และ 96/616 ที่ Alert; leave-one-week-out max span ของ Alert 20.8 ราย
- Profile คงสถานะ Draft และ fallback ในแอปใช้เฉพาะเมื่อ DB Profile เป็น Draft และไม่มี threshold บันทึกเลย; การบันทึกจริงต้องผ่าน Admin RPC พร้อม audit log
- ไม่ถือเป็น independent human review / clinical approval; ห้ามสร้าง Alert Candidate หรือ national risk classification

## เงื่อนไขก่อนประกาศ Production readiness

1. มีข้อมูล 77 จังหวัดชุดล่าสุดพร้อมที่มาและวันตัดข้อมูล
2. ผ่าน data audit, leakage checks, independent temporal evaluation และ freshness gate
3. มี release Prediction/Metrics/manifest ที่สอดคล้องกันและตรวจ hash ได้
4. ได้รับการตรวจสอบทางคลินิกของ Knowledge และ Symptom Checker
5. Rule Profile และ threshold 77 จังหวัดผ่าน independent review
6. ผ่าน security/privacy review และ smoke tests บน deployment SHA ล่าสุด
7. Reconcile Supabase schema และ migration ledger ก่อนเปลี่ยน hosted database

**ข้อสรุป:** โครงงานมีระบบและ workflow หลักสำหรับการสาธิตเชิงวิชาการแล้วหลายส่วน แต่การพยากรณ์ปัจจุบันระดับประเทศ การแจ้งเตือนจริง และ AI ทางการแพทย์ยังไม่ใช่ความสามารถที่อนุญาตให้ใช้งานจริง

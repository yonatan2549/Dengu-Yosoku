# ตารางสถานะฟีเจอร์ DengueYosoku

**อัปเดต:** 21 พฤศจิกายน 2026 · หลังนำเข้าข้อมูล TanRabad สัปดาห์ 44–45  
ตารางนี้แยกสิ่งที่พัฒนาแล้วออกจากสิ่งที่ยังไม่พร้อมใช้งานจริง เพื่อใช้ประกอบการส่งโครงงาน

| ฟีเจอร์ | สถานะ | สิ่งที่ทำได้ในปัจจุบัน | สิ่งที่ยังขาด/ข้อจำกัด |
|---|---|---|---|
| Dashboard ภาพรวม | มีหน้าใช้งาน | แสดงข้อมูลเฝ้าระวัง แหล่งอ้างอิง และข้อมูลแนวโน้ม | ต้องแสดงวันที่/พื้นที่กำกับ; legacy ODPC4 เป็นข้อมูลประวัติศาสตร์ |
| แผนที่ ODPC4 8 จังหวัด | มีชุดข้อมูลเดิม | แสดงขอบเขต/แนวโน้มตามข้อมูลเก่า | ไม่ใช่ความเสี่ยงปัจจุบันทั่วประเทศ |
| แผนที่ขอบเขต 77 จังหวัด | มีขอบเขตแผนที่ | ใช้อ้างอิงพื้นที่จังหวัด | การมีขอบเขตไม่ใช่ข้อมูลพยากรณ์สด |
| โมเดลพัฒนา 77 จังหวัด | pipeline และการประเมินย้อนหลัง | audit แหล่งข้อมูล, temporal CV 4 folds, baseline comparison และ retrospective holdout 26 สัปดาห์ / 2,002 province-weeks | ต้องรับ weekly case export ใหม่ทุกสัปดาห์; holdout เป็นข้อมูลย้อนหลังสาธารณะ ไม่ใช่ sealed blind test |
| Model Snapshot / Operations | มี Snapshot 77 จังหวัดครบ 77/77 ใน repository | target week 2026-11-15 (สัปดาห์ 46/2569); input cases ถึง 2026-11-08; ตรวจ Revision, history coverage และ release status | `review_only`; แสดงพยากรณ์สัปดาห์ 46 ได้ แต่ยังไม่มี actuals รายจังหวัดของสัปดาห์ 46; Snapshot จะ stale เมื่อเริ่มสัปดาห์ 47 วันที่ 2026-11-22 หากไม่มี Snapshot ใหม่ |
| Prevention | มีหน้าใช้งาน | ความรู้ป้องกันและ checklist 3 เก็บ | เป็นคำแนะนำทั่วไป |
| Symptom Checker | มีแบบประเมินและ regression tests | ประเมินอาการ/สัญญาณเตือนและแสดงคำเตือน | ไม่ใช่ diagnosis; ต้องผ่าน clinical review |
| Health Knowledge | มี Knowledge Registry และค้นคืนหลักฐาน | แสดงความรู้และที่มา | Registry 6 records ยังรอ clinical review |
| Health Assistant | มี evidence-only และ AI Preview implementation | ค้นคืนหลักฐาน; Preview AI draft มี safety/source gates | Production ไม่เปิด generated answers; Preview ล่าสุดติด deployment limit; retrieval ยังไม่ใช่ full-document/vector RAG |
| Alert Center | มี workflow และ API draft; มี Draft threshold candidate ครบ 77 จังหวัด | คำนวณ Watch=P75 / Alert=P90 จาก 26 สัปดาห์รายจังหวัด; dual-implementation, temporal split 18/8, leave-one-week-out และเทียบ forecast/persistence ผ่าน technical review อัตโนมัติ; โหลด Candidate ให้ Admin editor ได้โดยไม่อนุมัติ | ค่าคำนวณยังเป็น Draft, ต้องมี independent epidemiological/clinical review และผู้มีอำนาจรับรอง; Snapshot เป็น `review_only`, ไม่มี actuals รายจังหวัดของสัปดาห์ 46; forecast micro-F1 ต่ำกว่า persistence และ macro Alert recall 9.3%; ระบบคง Dry-run ภายในและปิด external notifications; ยังไม่จัด national risk จริง |
| Authentication / Supabase | มี integration และ migration source | มี Auth routes และ RLS/migration definitions | ต้อง reconcile remote schema/migration history ก่อน apply migrations เพิ่ม |
| References / About | มีหน้าอ้างอิง/ข้อมูลโครงการ | ใช้ประกอบการตรวจสอบแหล่งข้อมูลและขอบเขต | ต้องอัปเดตเมื่อเพิ่มแหล่งข้อมูลหรือรุ่นโมเดลใหม่ |
| Mobile responsive | มี responsive UI | layout ใช้งานได้หลายขนาดหน้าจอจาก design/components | ควรทดสอบอุปกรณ์จริงและเบราว์เซอร์เป้าหมายก่อนส่ง |

## หลักฐานการตรวจสอบโค้ด

- GitHub Actions run [#231](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44865828911)
- Commit: `6effe2b5f0facfc16c1a70b01459cbb07f08cd13`
- ผล: passed, รวม TypeScript, regression tests และ Next.js Production build
- มี Preview deployment จาก commit ก่อนหน้าแล้ว แต่ต้องตรวจว่า SHA ตรงกับ commit ล่าสุด และต้อง smoke test deployment ก่อนใช้อ้างอิง
- PR #4 ยัง Draft/Open และไม่ถูก merge ในเวลาจัดทำเอกสารนี้
- PR #4 head ณ 21 พ.ย. 2026: `b7d8e29dc966ea6735e920bc86e472ca5220fdae` (Dashboard week-46 labelling / Alert governance copy กำลังตรวจ CI)
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

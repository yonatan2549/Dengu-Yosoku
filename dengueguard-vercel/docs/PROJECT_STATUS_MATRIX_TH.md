# ตารางสถานะฟีเจอร์ DengueYosoku

**อัปเดต:** 21 พฤศจิกายน 2026  
ตารางนี้แยกสิ่งที่พัฒนาแล้วออกจากสิ่งที่ยังไม่พร้อมใช้งานจริง เพื่อใช้ประกอบการส่งโครงงาน

| ฟีเจอร์ | สถานะ | สิ่งที่ทำได้ในปัจจุบัน | สิ่งที่ยังขาด/ข้อจำกัด |
|---|---|---|---|
| Dashboard ภาพรวม | มีหน้าใช้งาน | แสดงข้อมูลเฝ้าระวัง แหล่งอ้างอิง และข้อมูลแนวโน้ม | ต้องแสดงวันที่/พื้นที่กำกับ; legacy ODPC4 เป็นข้อมูลประวัติศาสตร์ |
| แผนที่ ODPC4 8 จังหวัด | มีชุดข้อมูลเดิม | แสดงขอบเขต/แนวโน้มตามข้อมูลเก่า | ไม่ใช่ความเสี่ยงปัจจุบันทั่วประเทศ |
| แผนที่ขอบเขต 77 จังหวัด | มีขอบเขตแผนที่ | ใช้อ้างอิงพื้นที่จังหวัด | การมีขอบเขตไม่ใช่ข้อมูลพยากรณ์สด |
| โมเดลพัฒนา 77 จังหวัด | pipeline และการประเมินย้อนหลัง | audit แหล่งข้อมูล, temporal CV, baseline comparison, retrospective holdout | ต้องรับ weekly data ล่าสุด; ผลย้อนหลังไม่ใช่ sealed blind test; ยังไม่ใช่ release ปัจจุบัน |
| Model Snapshot / Operations | มี validation และ readiness gates | ตรวจไฟล์, freshness, integrity และปิดกั้นเมื่อข้อมูลไม่พร้อม | Prediction/Metrics สำหรับ snapshot ปัจจุบันยังไม่พร้อมใน integration ณ วันที่รายงาน; จึงไม่อนุญาตให้นำไปใช้ |
| Prevention | มีหน้าใช้งาน | ความรู้ป้องกันและ checklist 3 เก็บ | เป็นคำแนะนำทั่วไป |
| Symptom Checker | มีแบบประเมินและ regression tests | ประเมินอาการ/สัญญาณเตือนและแสดงคำเตือน | ไม่ใช่ diagnosis; ต้องผ่าน clinical review |
| Health Knowledge | มี Knowledge Registry และค้นคืนหลักฐาน | แสดงความรู้และที่มา | Registry 6 records ยังรอ clinical review |
| Health Assistant | มี evidence-only และ AI Preview implementation | ค้นคืนหลักฐาน; Preview AI draft มี safety/source gates | Production ไม่เปิด generated answers; Preview ล่าสุดติด deployment limit; retrieval ยังไม่ใช่ full-document/vector RAG |
| Alert Center | มี workflow และ API draft | draft rules, readiness, dry-run, events, review controls | Rule Profile ยัง Draft; threshold ที่ approve ครบ 77 จังหวัดยังไม่มี; external notifications ปิดอยู่ |
| Authentication / Supabase | มี integration และ migration source | มี Auth routes และ RLS/migration definitions | ต้อง reconcile remote schema/migration history ก่อน apply migrations เพิ่ม |
| References / About | มีหน้าอ้างอิง/ข้อมูลโครงการ | ใช้ประกอบการตรวจสอบแหล่งข้อมูลและขอบเขต | ต้องอัปเดตเมื่อเพิ่มแหล่งข้อมูลหรือรุ่นโมเดลใหม่ |
| Mobile responsive | มี responsive UI | layout ใช้งานได้หลายขนาดหน้าจอจาก design/components | ควรทดสอบอุปกรณ์จริงและเบราว์เซอร์เป้าหมายก่อนส่ง |

## หลักฐานการตรวจสอบโค้ด

- GitHub Actions run [#228](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44865828911)
- Commit: `92629dad0de4d0fd206e70151e2d6a418a5a1da0`
- ผล: passed, รวม TypeScript, regression tests และ Next.js Production build
- Vercel checks ของ commit เดียวกันไม่ผ่านการ deploy เนื่องจาก daily build/deployment API limit; จึงไม่ถือว่า latest Preview พร้อมใช้งาน
- PR #2 ยัง Draft/Open และไม่ถูก merge ในเวลาจัดทำเอกสารนี้

## เงื่อนไขก่อนประกาศ Production readiness

1. มีข้อมูล 77 จังหวัดชุดล่าสุดพร้อมที่มาและวันตัดข้อมูล
2. ผ่าน data audit, leakage checks, independent temporal evaluation และ freshness gate
3. มี release Prediction/Metrics/manifest ที่สอดคล้องกันและตรวจ hash ได้
4. ได้รับการตรวจสอบทางคลินิกของ Knowledge และ Symptom Checker
5. Rule Profile และ threshold 77 จังหวัดผ่าน independent review
6. ผ่าน security/privacy review และ smoke tests บน deployment SHA ล่าสุด
7. Reconcile Supabase schema และ migration ledger ก่อนเปลี่ยน hosted database

**ข้อสรุป:** โครงงานมีระบบและ workflow หลักสำหรับการสาธิตเชิงวิชาการแล้วหลายส่วน แต่การพยากรณ์ปัจจุบันระดับประเทศ การแจ้งเตือนจริง และ AI ทางการแพทย์ยังไม่ใช่ความสามารถที่อนุญาตให้ใช้งานจริง

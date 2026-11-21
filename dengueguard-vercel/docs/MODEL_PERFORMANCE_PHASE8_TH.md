# DengueYosoku — Phase 8: Model Performance & Error Diagnostics

## เป้าหมาย

Phase 8 เพิ่มการคำนวณ Performance จาก Holdout ที่แนบใน Model Snapshot โดยคำนวณซ้ำจากข้อมูลรายจังหวัด/สัปดาห์ และตรวจเทียบกับ `model_metrics.json` ก่อนแสดงผล

## ตัวชี้วัด

- MAE: ค่าเฉลี่ยของความคลาดเคลื่อนสัมบูรณ์
- RMSE: รากที่สองของค่าเฉลี่ยความคลาดเคลื่อนยกกำลังสอง
- Bias: ค่าเฉลี่ย `prediction - actual`; บวกหมายถึง Over-predicting และลบหมายถึง Under-predicting
- Persistence MAE: Baseline จากผู้ป่วยสัปดาห์ก่อน
- Seasonal Naive MAE และ Climatology MAE: Baseline เพิ่มเติม
- Skill vs Persistence: `(1 - Model MAE / Persistence MAE) * 100`

## Validation

- จังหวัดหลักครบ 77 จังหวัด ไม่ซ้ำ
- จำนวน Holdout rows และ weeks ตรงกับ metadata
- ไม่มีข้อมูลซ้ำ province-week
- ทุกสัปดาห์มีข้อมูลครบ 77 จังหวัด
- วันที่สัปดาห์เป็นวันอาทิตย์
- ทุกค่า actual/prediction/baseline เป็นตัวเลข finite และไม่ติดลบ
- MAE, RMSE และ Baseline MAE ต้องตรงกับ `metrics.json` ภายใน tolerance 0.01

## การตีความ

ผลแยกจังหวัดและรายสัปดาห์เป็นสถิติย้อนหลังจาก Holdout ไม่ใช่ระดับความเสี่ยงปัจจุบัน และไม่ใช่การยืนยันการระบาด

Model Repository ระบุว่า Pipeline เป็น weekly nowcasting ไม่ใช่ multi-week forecast; Autoregressive feature gain ประมาณ 93.7%; shipped setting ปิด Optuna; holdout ถูกใช้ตรวจสอบมากกว่าหนึ่ง configuration จึงควรเปิดเผยข้อจำกัดเหล่านี้เมื่อนำเสนอผล

## ข้อจำกัดของ Patch

- ไม่มีการเปลี่ยน Model Predictions/Metrics JSON หรือข้อมูลต้นทาง
- ไม่มีการ Train โมเดลใหม่
- ไม่มีการเปลี่ยน Threshold หรือ Rule Profile
- ไม่มี Migration SQL ใหม่
- ไม่เปิด External Notifications
- ต้องรัน Unit Tests, Typecheck และ Production Build ในเครื่องจริงหลังติดตั้ง

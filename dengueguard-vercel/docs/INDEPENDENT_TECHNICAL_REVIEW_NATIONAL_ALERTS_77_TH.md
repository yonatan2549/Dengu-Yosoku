# Independent Technical Review — National Alert Thresholds 77 จังหวัด

**วันที่ตรวจ:** 21 พฤศจิกายน 2026  
**ฐานโค้ดที่ตรวจ:** `integration/phase9-12-final-review` · `c979fcd777f3b789eda280e0de0ed78f8150e935`  
**Candidate:** `dengueyosoku-national-alerts / 0.1.0-draft`  
**ผลตรวจ:** **ไม่อนุมัติให้เปิดใช้จริง (HOLD / NOT APPROVED)**

> ขอบเขตผู้ตรวจ: การตรวจทางเทคนิคและสถิติของซอร์สโค้ด สัญญาข้อมูล การคำนวณ และผล validation โดยผู้ช่วย AI ซึ่งแยกจากผู้เขียนสคริปต์ใน repository การตรวจนี้ไม่ใช่การลงนามของนักระบาดวิทยา แพทย์ หรือ Reviewer ที่ผ่านการยืนยันตัวตนในระบบ และไม่สามารถแทนการอนุมัติทางคลินิก/สาธารณสุขได้

## 1. สิ่งที่ตรวจและหลักฐาน

- Model Snapshot: `public/data/model_predictions.json`, model revision `fc3c09362fb4ee5391ab29cc4b98132f681c7529`, status `review_only`.
- Threshold candidate: `public/data/alert_threshold_candidates_77.json`; 77 รายการและชื่อจังหวัดไม่ซ้ำ 77 จังหวัด
- Generator: `scripts/build_alert_threshold_draft.py`; ตรวจ data coverage, duplicate province/week, Type-7 quantiles, fallback, leave-one-week-out sensitivity และ temporal split
- Regression suite: `scripts/test_alert_threshold_draft.py`; ทดสอบความสามารถสร้างซ้ำและ governance invariants
- CI ของฐานที่ตรวจ: GitHub Actions run [44877600671](https://github.com/yonatan2549/Dengu-Yosoku/actions/runs/44877600671) ผ่าน 34 ขั้นตอนหลัก รวม TypeScript, model artifact/release regressions, Production build และ built-app safety smoke tests

## 2. ผลตรวจที่ผ่าน

| หัวข้อ | ผล |
|---|---|
| Coverage | ผ่าน: 77/77 จังหวัด ไม่ซ้ำ |
| Historical panel | ผ่านตาม schema: 26 สัปดาห์ × 77 จังหวัด = 2,002 province-week rows |
| Threshold ordering | ผ่าน: Watch < Alert ครบทุกจังหวัด |
| Quantile implementation | ผ่าน: Type-7 สอง implementation ตรงกันภายใน 1e-9 |
| Tie fallback | เปิดเผย 3 จังหวัด: ลพบุรี, ลำพูน และสิงห์บุรี |
| Temporal split | ตรวจแยก 18 สัปดาห์แรก / 8 สัปดาห์ท้าย |
| Safety/governance | ผ่าน: candidate เป็น Draft, ไม่มี approval reference, ไม่สร้าง Alert candidate, ไม่จำแนกความเสี่ยงประเทศ และปิด external notifications |

ผลเหล่านี้ยืนยันความครบถ้วนและความสามารถในการสร้างซ้ำของ **Draft candidate** เท่านั้น ไม่ยืนยันความเหมาะสมของเกณฑ์สำหรับการตรวจจับการระบาดจริง

## 3. ข้อค้นพบที่ขัดขวางการใช้งานจริง

### 3.1 ระยะข้อมูลไม่ครบรอบฤดูกาล

มีข้อมูลเพียง 26 สัปดาห์ (ประมาณ 6 เดือน) ไม่ครบรอบ 52 สัปดาห์ จึงยังประเมิน seasonality และความคงทนของ P75/P90 ข้ามฤดูกาลไม่ได้

### 3.2 ตัวชี้วัดเป็นจำนวนผู้ป่วยดิบ

Threshold ใช้ absolute weekly case counts ไม่ได้ปรับประชากร ความครอบคลุมการตรวจ ความครบถ้วน/ความล่าช้าของรายงาน และบริบทพื้นที่ จึงไม่ควรตีความเป็นระดับความเสี่ยงที่เปรียบเทียบกันระหว่างจังหวัด หรือเป็นนิยามการระบาด

### 3.3 โมเดลยังทำนายการเกิน threshold ได้ไม่ดีพอ

ใน temporal validation 8 สัปดาห์ (616 province-week observations):

| ระดับ | ตัวทำนาย | Micro F1 | Macro recall |
|---|---|---:|---:|
| Watch | Model forecast | 59.8% | 17.0% |
| Watch | Persistence | 61.6% | 24.8% |
| Alert | Model forecast | 53.1% | 9.3% |
| Alert | Persistence | 60.6% | 15.7% |

โมเดลมี micro precision สูงกว่า persistence แต่ recall และ F1 ต่ำกว่า โดยเฉพาะ Alert recall ระดับจังหวัด ผลนี้เป็นการทำนาย **การเกินเกณฑ์สถิติ** ไม่ใช่ sensitivity ต่อการระบาดจริง อย่างไรก็ดีถือเป็นสัญญาณไม่ผ่านสำหรับการนำไปเปิด Alert โดยอัตโนมัติ

### 3.4 ความไวต่อจำนวนสัปดาห์ที่ใช้คำนวณ

Leave-one-week-out พบ maximum Alert threshold span 20.8 ราย/สัปดาห์ และจังหวัดที่มี span มากกว่า 10 ได้แก่ กรุงเทพมหานครและสงขลา แสดงว่าค่าเกณฑ์บางจังหวัดไวต่อการเลือกช่วงข้อมูล

### 3.5 Holdout ไม่ใช่ blind prospective validation

เอกสาร metrics ระบุว่าเป็น retrospective rolling-origin holdout จากข้อมูลย้อนหลังสาธารณะ ไม่ใช่ sealed independent blind test จึงห้ามอธิบายผลนี้ว่าเป็นการทดสอบอิสระในภาคสนาม หรือหลักฐานยืนยันประสิทธิภาพระบบเฝ้าระวังจริง

### 3.6 อายุของ Snapshot

Snapshot สร้างวันที่ 21 พ.ย. 2026 เป้าหมายสัปดาห์ 15 พ.ย. 2026 และข้อมูลจริงถึง 8 พ.ย. 2026 โดย metadata ระบุว่าสัปดาห์ 15 พ.ย. เป็นสัปดาห์ปัจจุบันขณะสร้าง จึงต้องสร้าง Snapshot ใหม่สำหรับสัปดาห์ที่เริ่ม 22 พ.ย. 2026 ห้ามนำผลสัปดาห์ 15 พ.ย. ไปแสดงเป็น forecast ปัจจุบันหลังเปลี่ยนสัปดาห์

## 4. คำวินิจฉัยทางเทคนิค

**ผ่านเฉพาะการสร้าง Draft และการตรวจความครบถ้วนเชิงซอฟต์แวร์ — ไม่ผ่าน operational alert readiness**

ไม่พบเหตุผลให้ลบ candidate 77 จังหวัดหรือทิ้ง pipeline แต่ไม่ควรนำค่าดังกล่าวไปเป็น Watch/Alert จริงใน Dashboard, Prevention หรือระบบแจ้งเตือน และไม่ควรเปิด LINE, Email, SMS หรือช่องทางภายนอก

## 5. เงื่อนไขก่อนพิจารณาอนุมัติ

1. เติมข้อมูลย้อนหลังอย่างน้อยให้ครบหนึ่งฤดูกาล 52 สัปดาห์ และควรทดสอบข้ามหลายฤดูกาล
2. ระบุ case definition, reporting cut-off, reporting lag และตรวจ missing/late reporting
3. ประเมินตัวชี้วัดแบบ population-adjusted หรือ incidence rate ตามความเหมาะสม พร้อมทบทวนความสามารถในการเทียบกับ forecast
4. ทำ prospective หรือ temporally held-out validation ที่แยกจากการเลือก threshold และรายงาน per-province recall, precision, false-alert burden, calibration และ baseline comparison
5. ให้ Reviewer ที่เป็นบุคคลอิสระและมีคุณสมบัติเหมาะสมตรวจ methodology, evidence, fallback และจังหวัดที่ไวต่อข้อมูล พร้อมบันทึกเหตุผล/แหล่งอ้างอิง
6. จึงค่อยกำหนด effective epidemiological week และอนุมัติ Rule Profile ผ่าน workflow ที่บังคับสิทธิ์ Reviewer

## 6. Governance คงเดิม

- `human_independent_review_status = not_performed`
- `clinical_review_status = not_performed`
- `approval_status = not_approved`
- `may_create_alert_candidates = false`
- `may_classify_national_risk = false`
- `external_notifications_enabled = false`

รายงานนี้เป็นการตรวจทางเทคนิค ไม่ได้เปลี่ยนสถานะในฐานข้อมูล Supabase ไม่ได้ส่ง Expert Review Request ในนาม Reviewer และไม่ได้อนุมัติ threshold แทนผู้เชี่ยวชาญ

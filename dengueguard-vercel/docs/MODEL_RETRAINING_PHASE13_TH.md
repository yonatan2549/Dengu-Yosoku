# Phase 13 — สายงานโมเดลไข้เลือดออก 77 จังหวัด

## จุดประสงค์

จัดเตรียมสายงานตรวจข้อมูล ฝึก และประเมินโมเดลรายสัปดาห์ 77 จังหวัด โดยใช้ repository `johnlovepizza/DenguYosoku` เป็นฐาน และบันทึกที่มาของข้อมูล/ผลลัพธ์อย่างตรวจสอบย้อนกลับได้ งานนี้ยังเป็น **Model Development / Preview** ไม่ใช่การรับรองผลเพื่อใช้งานสาธารณสุขจริง

## บทบาทของไฟล์สองชุด

- `dengue_cut_allweeks_2003-18_Oct_2026.csv` เป็น modelling panel ที่ใช้ฝึก/ประเมิน และจบที่สัปดาห์ 18 ต.ค. 2026
- `dengue_full.csv` เป็นไฟล์ต้นฉบับที่มีข้อมูลมากกว่า รวมสัปดาห์เป้าหมายที่จะพยากรณ์ (ตาม snapshot ใน repository คือ 25 ต.ค. 2026) และอาจมีคอลัมน์อื่นที่ไม่ใช่ feature ของโมเดล
- สายงานจะเปรียบเทียบคีย์ `province + week_start` และค่าของ `cases` กับ `w_apparent_temperature_mean` ที่ซ้อนทับกันระหว่างสองไฟล์ ต้องตรงกัน
- สัปดาห์เป้าหมายใน `dengue_full.csv` อาจมี `cases` จริงอยู่เพื่อใช้ audit/ประเมินย้อนหลัง แต่ pipeline จะตั้ง target-week `cases` เป็น `None` ก่อนสร้าง feature ทุกครั้ง ห้ามใช้ target สัปดาห์เดียวกันเป็น input
- โมเดลใช้ lagged cases, lagged apparent temperature และ calendar seasonality เท่านั้น; ไม่ใช้ `cases` ปัจจุบัน, `cases_per_100k`, `population` หรือ weather ของสัปดาห์เป้าหมายเป็น feature

## แหล่งข้อมูลและการระบุที่มา

เจ้าของโครงการแจ้งว่าไฟล์ผู้ป่วยมาจากแพลตฟอร์ม **ทันระบาด (TanRabad)** และได้รับอนุญาตจากเจ้าของ repository ให้นำไฟล์ใน repository มาใช้พัฒนาต่อ เว็บไซต์กรมควบคุมโรคอธิบายว่า TanRabad-Watch แสดงข้อมูลระบาดวิทยาที่เชื่อมโยงจากสำนักระบาดวิทยา พร้อมข้อมูลสำรวจลูกน้ำจาก TanRabad-Survey: <https://trb.ddc.moph.go.th/> 

ให้เก็บ snapshot date, report cut-off, source file SHA-256 และ Git commit ของชุดไฟล์ทุกครั้งที่ train ใหม่ ห้ามบันทึก token/บัญชีผู้ใช้ของ TanRabad ใน repository และห้ามใช้การเข้าถึงที่ไม่ได้รับอนุญาต

## คำสั่งตรวจข้อมูล

```bash
python scripts/national_model_pipeline.py audit \
  --train-csv path/to/dengue_cut_allweeks_2003-18_Oct_2026.csv \
  --full-csv path/to/dengue_full.csv \
  --output artifacts/data_audit.json
```

การตรวจจะยืนยัน 77 จังหวัด, Sunday-start weekly grid, ไม่มี duplicate province-week, ไม่มีจำนวนผู้ป่วยติดลบ, ทุกสัปดาห์มีครบทุกจังหวัด, ไฟล์ full มีสัปดาห์เป้าหมายต่อจาก training cut 1 สัปดาห์ และค่าข้อมูลที่ซ้อนทับกันตรงกัน

## คำสั่งฝึกและประเมิน

```bash
pip install -r scripts/requirements-model-pipeline.txt
python scripts/national_model_pipeline.py train \
  --train-csv path/to/dengue_cut_allweeks_2003-18_Oct_2026.csv \
  --full-csv path/to/dengue_full.csv \
  --source-commit <40-character-source-commit-sha> \
  --output-dir artifacts/national-model
```

ขั้นตอน model selection เปรียบเทียบ LightGBM Quantile 0.5 และ Poisson ด้วย MAE ผ่าน expanding time-ordered CV folds โดยคำนวณ `province baseline` ใหม่จาก train portion ของแต่ละ fold ไม่ reuse ค่าเฉลี่ยจากอนาคตของ fold อื่น จากนั้นประเมิน retrospective temporal holdout 26 สัปดาห์ที่ไม่ได้ใช้เลือก candidate และฝึกโมเดลสุดท้ายด้วย labelled training panel ทั้งชุดเพื่อสร้างผลพยากรณ์ 1 สัปดาห์ถัดไป

Holdout ใน repository เป็นข้อมูลย้อนหลังที่เปิดเผยแล้ว จึงต้องระบุว่าเป็น **retrospective rolling-origin holdout** ไม่ใช่ sealed independent blind test และหนึ่งสัปดาห์ใน holdout ใช้ actual ของสัปดาห์ก่อนหน้าเป็นข้อมูลสำหรับ nowcast สัปดาห์ถัดมา (rolling one-week-ahead evaluation) ไม่ใช่การพยากรณ์หลายสัปดาห์แบบ recursive

ใช้ `--require-current` เพื่อหยุดการสร้างผลเมื่อ target week ไม่ตรงกับสัปดาห์ระบาดวิทยาปัจจุบันใน Asia/Bangkok สัปดาห์เก่าจะถูกระบุเป็น `stale_historical_rehearsal` และห้ามนำไปแสดงว่าเป็นสถานการณ์ปัจจุบัน

## Outputs

- `data_audit.json`: ผลตรวจ source pair
- `holdout_predictions.csv`: ผลจริง/ผลทำนาย/naive baselines ในช่วง retrospective holdout
- `predictions.csv`: ผลพยากรณ์ 77 จังหวัดสำหรับ target week หนึ่งสัปดาห์
- `metrics.json`: metrics, CV, holdout, per-province errors, source hashes และ provenance
- `training_manifest.json`: manifest ของการ run ฝึก (ไม่ใช่ website `source_manifest.json`)
- `model.txt`: LightGBM model ที่ฝึกแล้ว

ไฟล์ผลลัพธ์เป็น artifacts สำหรับตรวจทานเท่านั้น ไม่ได้ถูกส่งเข้า `public/data`, ไม่ได้ถูก deploy และไม่เปิด Alert Center โดยอัตโนมัติ การนำผลไปยังเว็บไซต์ต้องผ่าน release contract, provenance check, validation และการอนุมัติของผู้ดูแลก่อน

## Known limitations / next gate

1. Snapshot ใน upstream repository ที่ตรวจสอบล่าสุดสิ้นสุดที่ 18 ต.ค. 2026 สำหรับ training cut และ 25 ต.ค. 2026 สำหรับ forecast target จึงไม่ใช่ข้อมูลปัจจุบัน ณ 21 พ.ย. 2026
2. ก่อนสร้าง current nowcast ต้องได้ TanRabad export ที่ครอบคลุม 77 จังหวัดจนถึงสัปดาห์ก่อนหน้า และมี target-week input row ครบ 77 จังหวัด
3. ถ้ารูปแบบ export ของ TanRabad เปลี่ยน ต้องทำ schema adapter และทดสอบ mapping ก่อน ห้ามเดาชื่อคอลัมน์/นิยามจำนวนผู้ป่วย
4. การแปลงจำนวนผู้ป่วยเป็นสีหรือ risk tier ยังไม่อยู่ใน scope ของโมเดลนี้ ต้องมีเกณฑ์ทางระบาดวิทยาและผู้เชี่ยวชาญอนุมัติแยกต่างหาก

## Phase 14 — ตรวจรับข้อมูล TanRabad สัปดาห์ล่าสุด (2026-11-21)

### ผลการรับข้อมูล

- GitHub Actions run: `44849116293`
- Branch: `integration/phase9-12-final-review`
- TanRabad source ZIP SHA-256: `f6e9a4bc7115a2e0b2435372f20dc15e3421efcb68b0902bf00c9bf8be324105`
- ZIP มี CSV จากเขตสุขภาพ 1–12 และเขตเมือง รวม 13 ไฟล์
- Schema ของทุกไฟล์ตรงกัน: `จังหวัด`, `ปี`, `สัปดาห์`, `จำนวนผู้ป่วย`
- แถวข้อมูลรวม 154 แถว เป็น 77 จังหวัด × 2 สัปดาห์
- ปี 2026 สัปดาห์ 44: ครบ 77 จังหวัด, ยอดรวม 1,437 ราย
- ปี 2026 สัปดาห์ 45: ครบ 77 จังหวัด, ยอดรวม 1,298 ราย
- Duplicate province-week keys: 0
- Parse errors / missing numeric values / negative cases: 0
- Possible direct patient-identifier columns: ไม่พบจากหัวคอลัมน์ที่ตรวจ
- ไฟล์ aggregate สำหรับ downstream ถูกสร้างเฉพาะใน ephemeral GitHub runner; ไม่มีการ upload ข้อมูลดิบหรือแถวข้อมูลผู้ป่วยเป็น Artifact

### การตีความช่วงสัปดาห์

ตามปฏิทิน CDC MMWR ปี 2026:
- Week 44 = 1–7 พ.ย. 2026
- Week 45 = 8–14 พ.ย. 2026
- Week 46 = 15–21 พ.ย. 2026

ดังนั้นชุดข้อมูลที่ส่งมาครอบคลุมสองสัปดาห์ที่ปิดรอบแล้วถึง 14 พ.ย. 2026 และยังไม่มีสัปดาห์ 46 ซึ่งเป็นสัปดาห์ปัจจุบัน ณ วันที่ตรวจ 21 พ.ย. 2026

### สถานะการเชื่อมโมเดล

**Data intake และ 77-province completeness audit: ผ่าน**

**Current-model training / prediction: ยังไม่ผ่าน release gate**

เหตุผล: TanRabad export นี้มีเฉพาะจำนวนผู้ป่วยรายจังหวัด-สัปดาห์ 4 คอลัมน์ ขณะที่ Phase 13 model contract ใช้ lagged cases ร่วมกับ lagged apparent-temperature feature `w_apparent_temperature_mean` และ calendar seasonality จึงยังต้องจัดหาและตรวจอากาศรายจังหวัดสำหรับสัปดาห์ 44–45 ให้สอดคล้องกับนิยาม/แหล่งข้อมูลของ training data ก่อน ห้ามเติมอุณหภูมิด้วยค่าเดา, forward-fill โดยไม่มีหลักฐาน, หรือใช้ข้อมูลสัปดาห์เป้าหมายเป็น feature

ชุดข้อมูลนี้จึงเป็น **validated aggregate case panel** ที่พร้อมสำหรับขั้น schema adapter และ weather join แต่ยังไม่ใช่ model-ready input และไม่ได้สร้าง Forecast, เปลี่ยน public data, เปิด alerts หรือ deploy

### ขั้นตอนถัดไป

1. จับคู่ชื่อจังหวัด 77 จังหวัดกับ canonical province keys ของ Phase 13 source
2. จัดหา apparent-temperature weekly series ที่ใช้วิธีคำนวณและหน่วยเดียวกับ training source สำหรับสัปดาห์ 44–45
3. ตรวจความต่อเนื่องของ weekly grid, weather coverage และ leakage ก่อนต่อท้าย historical panel
4. ฝึก/ประเมินโมเดลด้วย temporal validation ตาม contract เดิม จากนั้นตรวจ target week และ stale/current status ก่อนเสนอ release

### Compatibility check against the current upstream model source

- Upstream commit checked: `ff45ff1f16232c8e32b3748646cea46486c49da3`
- Historical `dengue_full.csv` ends at `week_start=2026-10-25` and contains 77 provinces.
- All 77 incoming TanRabad province labels match the historical source exactly (77/77).
- Required weather field in the existing 12-feature model: `w_apparent_temperature_mean_L1`.
- Historical source weather coverage for incoming weeks 44 and 45: 0/77 provinces for each week.
- Result: the original 12-feature model cannot consume the new panel without obtaining a compatible apparent-temperature series for weeks 44–45.

The upstream model README currently describes the weather column as a weather source but leaves the provider/version/date as a placeholder. Before importing an alternate weather provider, the project must confirm the intended source, units, calculation window, and provenance. Do not substitute a different weather series silently.


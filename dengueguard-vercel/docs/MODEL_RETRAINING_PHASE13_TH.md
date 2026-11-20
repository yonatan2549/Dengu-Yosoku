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
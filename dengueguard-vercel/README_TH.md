# DengueYosoku — Next.js + Vercel

เว็บเวอร์ชันใหม่ของ **DengueYosoku: Proactive Dengue Prevention and Early Warning System** ที่ย้ายการแสดงผลจาก Streamlit มาเป็น Next.js (App Router) และเตรียม Deploy บน Vercel

## ระบบที่อยู่ในเวอร์ชันเริ่มต้น

1. **System 1 — Forecast Dashboard**
   - เลือกปี สัปดาห์เป้าหมาย และจังหวัดสำหรับกราฟแนวโน้ม
   - แผนที่ประเทศไทย 77 จังหวัด โดยเน้นระดับพยากรณ์ใน 8 จังหวัด สคร.4 (ชั้นแผนที่พื้นฐานใช้ OpenStreetMap tiles จึงต้องเชื่อมต่ออินเทอร์เน็ต)
   - ตารางระดับความเสี่ยงรายจังหวัด
   - กราฟผู้ป่วยจริง / AI Prediction / Baseline
   - แสดง MAE, RMSE, Recall และ Precision จาก `meta.json`
   - ดาวน์โหลดผลพยากรณ์เป็น CSV
2. **System 2 — Proactive Prevention**
   - ภาพรวมการแจ้งเตือนรายจังหวัด
   - แสดงเกณฑ์เฝ้าระวัง เกณฑ์เตือนระบาด และเปรียบเทียบสัปดาห์ก่อนหน้า
   - คำแนะนำป้องกันจาก `prevention_actions.csv`
   - Popup ภาพรวม 8 จังหวัดเมื่อเปิดเว็บครั้งแรกของ browser session พร้อมปุ่มปิดและปุ่มเปิดดูซ้ำ
   - Popup แสดงผู้ป่วยที่คาดการณ์ จังหวัดเตือนระบาด ปริมาณฝนเฉลี่ย อุณหภูมิเฉลี่ย และแนวโน้มผู้ป่วยรวม
3. **System 3 — Dengue Symptom Checker**
   - แบบสอบถาม 3 หน้า (ข้อ 1 / ข้อ 2–7 / ผลตรวจทางห้องปฏิบัติการข้อ 8)
   - เก็บคำตอบไว้ใน React state เมื่อกดย้อนกลับ/ถัดไป
   - แยกความเร่งด่วนออกจากข้อมูลที่สนับสนุนความสงสัยไข้เลือดออก
   - แปลผล NS1, IgM, IgG และแสดง CBC ประกอบ โดยไม่ให้ค่า CBC เดี่ยว ๆ วินิจฉัยโรคหรือความรุนแรง
   - หน้าผลมีปุ่ม “ทำแบบประเมินใหม่” เพียงปุ่มเดียว

## ข้อจำกัดข้อมูลที่ต้องทราบก่อนเผยแพร่

ไฟล์ที่ได้รับในชุดต้นทางมีผลพยากรณ์ตั้งแต่ปี 2019 ถึงสัปดาห์เป้าหมาย **25 ธันวาคม 2022** และข้อมูลอากาศรายวันถึง **31 ธันวาคม 2022** ดังนั้นหน้าเว็บจะระบุว่าข้อมูลเป็นข้อมูลย้อนหลัง ไม่ควรนำไปเรียกว่าเป็นสถานการณ์ปัจจุบันหรือใช้ส่งคำเตือนปัจจุบันแก่ประชาชนจนกว่าจะอัปเดตข้อมูลและตรวจสอบโมเดลใหม่

ข้อมูลอากาศใน `weather_daily.csv` เป็นข้อมูลรายวันจากอดีต ไม่ใช่พยากรณ์อากาศ ระบบ Popup จึงระบุว่าเป็นข้อมูลตรวจวัดย้อนหลัง และสรุปฝนสะสม/อุณหภูมิเฉลี่ย 7 วันของสัปดาห์เป้าหมาย หากไม่มีข้อมูลจะขึ้น “ไม่มีข้อมูล” ไม่สร้างค่าทดแทน

แบบประเมินอาการเป็นเครื่องมือคัดกรองเพื่อให้ข้อมูลเบื้องต้น ไม่ใช่การวินิจฉัย ควรให้แพทย์/ผู้เชี่ยวชาญตรวจสอบกฎทางคลินิกก่อนนำไปใช้กับผู้ป่วยจริง ข้อมูลคำตอบในเวอร์ชันนี้อยู่ในหน่วยความจำของ browser ระหว่างใช้งานและไม่ได้ส่งไปเก็บในฐานข้อมูล

## โครงสร้างโฟลเดอร์

```text
DengueYosoku/
├── app/
│   ├── dashboard/page.tsx
│   ├── prevention/page.tsx
│   ├── symptom-checker/page.tsx
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── AppShell.tsx
│   ├── DataProvider.tsx
│   ├── SupportingPopup.tsx
│   ├── ThailandMap.tsx
│   └── MapLoader.tsx
├── lib/
│   ├── types.ts
│   └── utils.ts
├── public/data/            # JSON ที่เว็บอ่านขณะทำงาน
├── source-data/            # CSV/GeoJSON ต้นฉบับและไฟล์ Streamlit เพื่ออ้างอิง
├── scripts/convert_data.py # แปลง CSV ต้นฉบับเป็น JSON สำหรับเว็บ
├── package.json
└── README_TH.md
```

## รันบนเครื่องก่อน Deploy

ต้องใช้ Node.js **20.9 ขึ้นไป** (แนะนำ Node.js 22 รุ่น LTS ที่ Vercel รองรับ)

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000`

ตรวจสอบ production build ก่อนเผยแพร่:

```bash
npm run typecheck
npm run build
```

## Deploy บน Vercel

1. แตก ZIP นี้เป็นโฟลเดอร์โปรเจกต์ `DengueYosoku`
2. สร้าง GitHub repository (แนะนำ Private) แล้วอัปโหลดไฟล์/โฟลเดอร์ทั้งหมดในโปรเจกต์ โดยไม่ต้องอัปโหลด `node_modules` หรือ `.next`
3. เข้า Vercel แล้วเลือก **Add New → Project** จากนั้น Import GitHub repository
4. เลือก Framework Preset เป็น **Next.js**; Build Command ใช้ `npm run build` และ Output Directory ให้ Vercel จัดการอัตโนมัติ
5. กด Deploy — เวอร์ชันนี้ไม่ต้องตั้ง Environment Variables

หลังแก้ไขโค้ดและ push commit ไปยัง branch ที่เชื่อมกับ Vercel ระบบจะสร้าง deployment ใหม่

## การอัปเดตข้อมูลจาก Google Colab

1. ดาวน์โหลดไฟล์ CSV/GeoJSON รุ่นใหม่จาก Colab
2. แทนที่ไฟล์ต้นฉบับใน `source-data/data/` และ `source-data/questionnaire/` ตามชื่อไฟล์
3. รันจาก root project:

```bash
python scripts/convert_data.py
```

4. ตรวจสอบข้อมูลใน `public/data/` แล้ว commit/push ไป GitHub เพื่อ Deploy ใหม่

อย่านำข้อมูลสุขภาพส่วนบุคคลหรือ API keys ใส่ใน `public/` เพราะไฟล์ใน `public/` สามารถเข้าถึงผ่าน URL ได้โดยตรง

## การตรวจสอบที่ยังต้องทำก่อนใช้งานจริง

- ตรวจสอบการแสดงแผนที่บนเครือข่ายที่อนุญาต OpenStreetMap tiles
- ตรวจสอบชื่อจังหวัด/วันเป้าหมายหลังอัปเดตข้อมูล
- ทดสอบกรณีไม่มีข้อมูลอากาศและไม่มีข้อมูลผู้ป่วยจริง
- ให้ผู้เชี่ยวชาญตรวจสอบ Assessment Rules ของ Symptom Checker
- อัปเดต Prediction และ Weather ให้เป็นปัจจุบันก่อนเผยแพร่การแจ้งเตือนประชาชน
- ทดสอบบนมือถือและอุปกรณ์จริงหลัง Deploy

## เอกสารทางการ

- Next.js Installation: https://nextjs.org/docs/app/getting-started/installation
- Next.js Deploying: https://nextjs.org/docs/app/getting-started/deploying
- Vercel Next.js: https://vercel.com/docs/frameworks/full-stack/nextjs




## เชื่อมต่อโมเดลใหม่ DenguYosoku (77 จังหวัด)

เว็บไซต์มีสคริปต์ดึงผลลัพธ์จาก Model Repository โดยบันทึก Commit SHA และ SHA-256 ของไฟล์ต้นทางไว้ใน `source_manifest.json` จากนั้นตรวจสอบและแปลงผลลัพธ์เป็น JSON แยกจากข้อมูลเดิม

จากโฟลเดอร์โปรเจกต์ `dengueguard-vercel` ให้รัน:

```bash
python scripts/fetch_model_outputs.py
python scripts/convert_model_outputs.py
```

สคริปต์จะนำเข้าเฉพาะผล Holdout, ผลพยากรณ์สัปดาห์ล่าสุด และ Metrics จาก https://github.com/johnlovepizza/DenguYosoku โดยไม่ดาวน์โหลด `answer_key.csv`, ข้อมูลดิบ หรือ `model.txt` เข้าเว็บไซต์ ผลลัพธ์จะอยู่ใน `public/data/model_predictions.json` และ `public/data/model_metrics.json` แยกจาก `predictions.json` รุ่นเดิม

**ข้อจำกัด:** โมเดลส่งออกค่าพยากรณ์จำนวนผู้ป่วย แต่ไม่ได้ส่งเกณฑ์เตือน (`thr_watch`, `thr_alert`) หรือระดับความเสี่ยง (`level`) มาให้ จึงยังไม่ควรนำผลใหม่ไปสร้างสถานะเตือนใน Prevention จนกว่าจะกำหนดและทบทวนเกณฑ์ดังกล่าวแยกต่างหาก ข้อมูลสภาพอากาศต้องอัปเดตจากแหล่งข้อมูลใหม่ด้วย

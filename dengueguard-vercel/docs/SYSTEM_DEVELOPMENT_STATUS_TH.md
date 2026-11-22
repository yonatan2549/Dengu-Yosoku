# DengueYosoku — สถานะและแผนพัฒนาระบบหลัก

## งานที่ทำแล้วในชุดนี้

- เพิ่ม Assessment Engine ที่ประเมินผลจาก `public/data/assessment_rules.json` แทนการคำนวณด้วยกฎ hard-code แยกจากไฟล์ JSON
- แยกผล `urgency` และ `dengue_evidence` ออกจากกัน และเก็บกฎที่เข้าเงื่อนไขร่วมเพื่ออธิบายผล
- เพิ่มการคัดกรอง warning signs ที่ CDC ระบุเพิ่มเติม ได้แก่ hepatomegaly และ progressive increase in hematocrit ที่บุคลากรทางการแพทย์แจ้ง
- เพิ่มคำถาม Tourniquet test (เลือกเฉพาะเมื่อมีผลตรวจจากบุคลากรทางการแพทย์)
- เพิ่ม D006 เป็นข้อมูลแนวโน้ม CBC เมื่อยืนยันว่าเป็นผู้ป่วยรายเดียวกันและเปรียบเทียบผลอย่างเหมาะสม
- เพิ่มการแจ้งเตือนเมื่อกฎที่จำเป็นขาดหายหรือมี condition code ที่ Engine ยังไม่รองรับ
- เพิ่ม unit tests 21 กรณี; ทดสอบ Engine แยกผ่านทั้งหมด

## สถานะระบบหลักจากการทบทวน repository

### 1. Forecast Dashboard / Model Integration

- มีการแยกข้อมูลโมเดล 77 จังหวัดออกจากข้อมูล legacy 8 จังหวัด
- `DataProvider` ตรวจรูปแบบข้อมูล ความครบถ้วนของจังหวัด สัปดาห์พยากรณ์ ประวัติ holdout และ metadata provenance/freshness ก่อนยอมรับชุดโมเดล
- ต้องทดสอบกับไฟล์โมเดลชุดล่าสุดในเครื่องของเจ้าของโปรเจกต์อีกครั้ง เพราะไฟล์ผลโมเดลในเครื่องอาจยังไม่ถูก push ขึ้น branch ที่ตรวจได้
- ไม่ควรนำค่าพยากรณ์จำนวนผู้ป่วยไปสร้าง Watch/Alert โดยไม่มีเกณฑ์ที่ผ่านการทบทวนและอนุมัติ

### 2. Prevention

- คงคำแนะนำป้องกันไว้ได้แม้ Alert module ยังไม่เปิดใช้งาน
- ข้อมูลพยากรณ์ที่ล้าสมัยต้องมีคำเตือนและไม่ควรสื่อสารเป็นสถานการณ์ปัจจุบัน
- ห้ามนำ thresholds ของ legacy ODPC4/8 จังหวัดมาใช้กับโมเดล 77 จังหวัดโดยตรง

### 3. Alert Center

- ปัจจุบันมี dry-run evaluator, provenance/audit และ event lifecycle
- Rule profile ระดับประเทศยังเป็น Draft และ thresholds ยังว่าง
- Event lifecycle ใน UI ยังเก็บใน browser localStorage; schema PostgreSQL/RLS เตรียมไว้แต่ยังไม่มี server-side repository/RPC สำหรับเขียน event transitions
- ยังปิดการส่ง LINE, Email, SMS และการแจ้งเตือนภายนอก
- งานต่อไป: สร้าง RPC แบบ transaction ที่ตรวจ `auth.uid()` และ role `reviewer`/`administrator`, เชื่อม API ฝั่ง server, ย้าย event history จาก localStorage ไปฐานข้อมูล และทดสอบ RLS/สิทธิ์ก่อนเปิดใช้
- ห้ามเปิด nationwide alerts จนกว่าจะมี surveillance observations, วิธีคำนวณ thresholds ที่ผ่านการทบทวน, backtesting และผู้รับผิดชอบอนุมัติ

### 4. Authentication / Roles

- ผู้ใช้ยืนยันแล้วว่าหลังติดตั้ง Auth patch แถบด้านบนแสดง `ผู้ดูแลระบบ` ทันทีหลัง Login โดยไม่ต้องกด F5
- Session และ role ตรวจผ่าน `/api/auth/session`; ยังคงต้องทดสอบ logout, token refresh และ role-based access ในทุก API ที่เขียนข้อมูล

## ลำดับงานถัดไป

1. ติดตั้ง Assessment patch นี้และทดสอบหน้า `/symptom-checker` ด้วยข้อมูลตัวอย่างที่ไม่มีข้อมูลระบุตัวบุคคล
2. เพิ่ม role-aware server-side API/RPC สำหรับ Alert Center; ยังไม่สร้างหรือส่ง alert อัตโนมัติ
3. ตรวจ Dashboard/Prevention กับ model exports ล่าสุดและยืนยัน freshness, coverage, commit SHA และ metrics จากไฟล์ชุดเดียวกัน
4. ทดสอบ responsive layout, loading/error/empty states และ accessibility ในทุกระบบหลัก
5. ทำ end-to-end tests และ security review ก่อน deploy

## ข้อจำกัด

ผลคัดกรองเป็นเพียงข้อมูลประกอบ ไม่ใช่การวินิจฉัยหรือการจัดระดับความรุนแรงโดยอัตโนมัติ กฎและข้อความต้องผ่านการตรวจสอบจากแพทย์/ผู้เชี่ยวชาญด้านเวชศาสตร์เขตร้อนหรือระบาดวิทยาก่อนใช้งานกับผู้ป่วยจริง

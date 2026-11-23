import Link from "next/link";
import {
  ArrowUpRight,
  Activity,
  BrainCircuit,
  LineChart,
  Code2,
  Database,
  FileCheck2,
  HeartHandshake,
  ShieldCheck,
  Stethoscope,
  Target,
  Users,
  BellRing,
} from "lucide-react";

const systems = [
  {
    icon: LineChart,
    title: "Forecast Dashboard",
    status: "ข้อมูลย้อนหลัง + งานวิจัยระดับประเทศ",
    desc: "หน้า Dashboard แยกชุดข้อมูลย้อนหลังของ สคร.4 ออกจาก snapshot โมเดล 77 จังหวัดที่แสดงในโหมด Review-only พร้อมวันอ้างอิงและที่มาของข้อมูล ผลนี้ใช้ตรวจทานการเชื่อมต่อและประเมินโมเดลเท่านั้น ไม่ใช่ระดับความเสี่ยงหรือผลที่อนุมัติสำหรับการตัดสินใจสาธารณสุข",
  },
  {
    icon: ShieldCheck,
    title: "Prevention & Protection",
    status: "ใช้งานได้บางส่วน",
    desc: "มีคำแนะนำป้องกันจากระบบข้อมูลเดิม เช็กลิสต์ 3 เก็บและป้องกันยุงกัดรายสัปดาห์ รวมถึงข้อมูลเฝ้าระวังระดับประเทศที่ระบุแหล่งที่มา คำแนะนำระดับจังหวัดของโมเดลใหม่ยังไม่เปิดใช้เป็นคำสั่งตามระดับความเสี่ยง",
  },
  {
    icon: Stethoscope,
    title: "Symptom Checker",
    status: "ระบบคัดกรองเบื้องต้น",
    desc: "ประเมินข้อมูลอาการและสัญญาณเตือนด้วยกฎที่กำหนดไว้ พร้อมแนะแนวทางความเร่งด่วน ไม่ใช่เครื่องมือวินิจฉัย และยังต้องผ่านการทบทวนและตรวจสอบความปลอดภัยทางคลินิก",
  },
  {
    icon: BrainCircuit,
    title: "AI Health Assistant",
    status: "ค้นคืนหลักฐาน · ยังไม่สร้างคำตอบ AI ใน Production",
    desc: "ค้นคืนเนื้อหาความรู้และแสดงแหล่งอ้างอิง ระบบ Production ใช้โหมด evidence-only และยังไม่สังเคราะห์คำตอบทางการแพทย์จากโมเดลภาษา เนื้อหาความรู้ยังรอผู้เชี่ยวชาญทบทวน",
  },
  {
    icon: Database,
    title: "Dengue Knowledge Hub",
    status: "โครงสร้างพร้อม · เนื้อหาอยู่ระหว่างเติม",
    desc: "มีหมวดหมู่ค้นหาความรู้และรวบรวมแหล่งอ้างอิงจากหน่วยงานสาธารณสุข แต่บทความภายใน แบบทดสอบ และสื่อการเรียนรู้ยังไม่ครบถ้วน",
  },
  {
    icon: BellRing,
    title: "Alert Center",
    status: "Dry-run และ Draft เท่านั้น",
    desc: "มีระบบตรวจความพร้อม ทดลองประเมิน กำหนดร่างเกณฑ์ และขั้นตอนทบทวนโดยผู้เชี่ยวชาญ แต่ยังไม่มีการปล่อยการแจ้งเตือนจริงหรือการส่ง notification ภายนอก",
  },
  {
    icon: Activity,
    title: "Model Operations",
    status: "ระบบตรวจสอบและกำกับดูแล",
    desc: "ตรวจสอบความสดใหม่ ความครบถ้วน ความถูกต้องของ artifact ที่เผยแพร่ และความพร้อมของ consumer ได้ แต่การฝึก/อัปเดตข้อมูลรายสัปดาห์ยังไม่ใช่งาน cron ที่ทำงานอัตโนมัติ",
  },
  {
    icon: Users,
    title: "Account & Roles",
    status: "มีโครงสร้างการยืนยันตัวตน",
    desc: "มีหน้าเข้าสู่ระบบและการแยกบทบาท Viewer, Reviewer และ Administrator การใช้งานจริงขึ้นกับการตั้งค่า Supabase และ environment ของแต่ละ deployment",
  },
];

const objectives = [
  "สนับสนุนการเฝ้าระวังแนวโน้มโรคไข้เลือดออกด้วยข้อมูลที่ระบุแหล่งที่มาและช่วงเวลา",
  "ส่งเสริมการป้องกันโรคเชิงรุกในระดับบุคคล ครอบครัว และชุมชน",
  "ให้ประชาชนเข้าถึงข้อมูลการคัดกรองอาการและสัญญาณเตือนที่เข้าใจง่าย",
  "รวบรวมองค์ความรู้ด้านไข้เลือดออกจากแหล่งข้อมูลที่ตรวจสอบได้",
  "พัฒนาเครื่องมือดิจิทัลที่แยกงานวิจัย การทดลอง และระบบที่อนุมัติให้ใช้งานจริงออกจากกัน",
];

export default function AboutPage() {
  return (
    <div className="dg-page">
      <section className="dg-hero">
        <div className="dg-hero-grid">
          <div>
            <span className="dg-eyebrow"><HeartHandshake size={14} /> ABOUT THE PROJECT</span>
            <h1>About DengueYosoku</h1>
            <p className="dg-lede">
              DengueYosoku เป็นแพลตฟอร์มสุขภาพดิจิทัลสำหรับการเฝ้าระวัง การป้องกัน
              การคัดกรองเบื้องต้น และการเรียนรู้เกี่ยวกับโรคไข้เลือดออก
              โดยให้ความสำคัญกับที่มาของข้อมูล ข้อจำกัดของโมเดล และการใช้ AI อย่างรับผิดชอบ
            </p>
          </div>
          <div className="dg-hero-art"><ShieldCheck size={58} strokeWidth={1.35} /></div>
        </div>
      </section>

      <section className="dg-stat-strip">
        <div className="dg-stat"><strong>8</strong><span>จังหวัดในระบบพยากรณ์เดิมของ สคร.4</span></div>
        <div className="dg-stat"><strong>77</strong><span>จังหวัดในขอบเขตงานวิจัยและพัฒนาโมเดลระดับประเทศ</span></div>
        <div className="dg-stat"><strong>Preview</strong><span>โมเดลและระบบแจ้งเตือนยังต้องผ่าน release review</span></div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>ที่มาและเป้าหมายของโครงการ</h2><p>Project Overview & Objectives</p></div>
        </div>
        <div className="dg-grid-2">
          <article className="dg-card">
            <div className="dg-card-icon"><Target size={19} /></div>
            <h3>Vision</h3>
            <p>สนับสนุนให้ประชาชนและผู้เกี่ยวข้องเข้าถึงข้อมูลเพื่อเฝ้าระวัง ป้องกัน และทำความเข้าใจโรคไข้เลือดออกได้สะดวก โดยตรวจสอบแหล่งอ้างอิงและช่วงเวลาของข้อมูลได้</p>
          </article>
          <article className="dg-card">
            <div className="dg-card-icon"><Activity size={19} /></div>
            <h3>Mission</h3>
            <p>เชื่อมโยงข้อมูลเฝ้าระวัง การพยากรณ์ คำแนะนำป้องกัน การคัดกรองเบื้องต้น และองค์ความรู้ด้านสุขภาพให้อยู่ในแพลตฟอร์มเดียว พร้อมแยกข้อมูลทดลองออกจากข้อมูลที่อนุมัติให้ใช้งาน</p>
          </article>
        </div>
        <article className="dg-card">
          <h3>วัตถุประสงค์</h3>
          <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "#627783", fontSize: 11, lineHeight: 2 }}>
            {objectives.map((objective) => <li key={objective}>{objective}</li>)}
          </ul>
        </article>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>องค์ประกอบของแพลตฟอร์ม</h2><p>Platform Modules & Development Status</p></div>
        </div>
        <div className="dg-grid">
          {systems.map((system) => {
            const Icon = system.icon;
            return (
              <article className="dg-card" key={system.title}>
                <div className="dg-card-icon"><Icon size={19} /></div>
                <div className="dg-source-meta">{system.status}</div>
                <h3>{system.title}</h3>
                <p>{system.desc}</p>
              </article>
            );
          })}
          <article className="dg-card">
            <div className="dg-card-icon"><FileCheck2 size={19} /></div>
            <div className="dg-source-meta">ข้อมูลโครงการ</div>
            <h3>About & Transparency</h3>
            <p>เปิดเผยขอบเขต วิธีการ แหล่งข้อมูล สถานะการพัฒนา และข้อจำกัด เพื่อให้ผู้ใช้แยกข้อมูลย้อนหลัง ผลทดลอง และระบบที่ผ่านการอนุมัติได้</p>
          </article>
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>เทคโนโลยีและแนวทางการพัฒนา</h2><p>Technology & Methodology</p></div>
        </div>
        <div className="dg-grid">
          <article className="dg-card"><div className="dg-card-icon"><Code2 size={19} /></div><h3>Web Application</h3><p>พัฒนาด้วย Next.js, React และ TypeScript พร้อมระบบทดสอบก่อนเผยแพร่ผ่าน Vercel</p></article>
          <article className="dg-card"><div className="dg-card-icon"><Database size={19} /></div><h3>Data Integration</h3><p>รองรับข้อมูลรายจังหวัดและสัปดาห์ ข้อมูลอากาศ ข้อมูลเชิงพื้นที่ และแหล่งเฝ้าระวังจากหน่วยงานที่เกี่ยวข้อง โดยต้องตรวจสอบความครบถ้วนและ provenance ก่อนใช้งาน</p></article>
          <article className="dg-card"><div className="dg-card-icon"><BrainCircuit size={19} /></div><h3>AI & Machine Learning</h3><p>โมเดลพยากรณ์จำนวนผู้ป่วยและผู้ช่วยความรู้เป็นคนละระบบ ต้องประเมินตามวัตถุประสงค์ของแต่ละระบบ และไม่แปลงผลพยากรณ์เป็นระดับความเสี่ยงโดยไม่มีเกณฑ์ที่ได้รับอนุมัติ</p></article>
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>ทีมพัฒนาและความร่วมมือ</h2><p>Development Team & Acknowledgements</p></div>
        </div>
        <article className="dg-card">
          <div className="dg-card-icon"><Users size={19} /></div>
          <h3>Development Team</h3>
          <p>พื้นที่นี้จัดเตรียมไว้สำหรับแนะนำสมาชิกโครงการ บทบาทความรับผิดชอบ อาจารย์ที่ปรึกษา และหน่วยงานที่เกี่ยวข้อง โดยจะเผยแพร่ชื่อและรายละเอียดเมื่อได้รับการยืนยันจากทีมงาน</p>
        </article>
      </section>

      <section className="dg-note">
        <FileCheck2 size={18} />
        <div>
          <strong>ขอบเขตและข้อจำกัดที่ควรทราบ</strong>
          <p>
            Dashboard แบบเดิมของ สคร.4 ใช้ข้อมูลพยากรณ์ย้อนหลังถึงวันที่ 25 ธันวาคม 2022
            และข้อมูลสภาพอากาศย้อนหลังถึงวันที่ 31 ธันวาคม 2022 จึงไม่ใช่ข้อมูลความเสี่ยงปัจจุบัน
            ส่วนโมเดลระดับประเทศ 77 จังหวัดมี snapshot เป้าหมายสัปดาห์เริ่ม 15 พฤศจิกายน 2569
            โดยใช้ข้อมูลผู้ป่วยถึง 8 พฤศจิกายน 2569 แสดงใน Dashboard เพื่อทบทวนในสถานะ Review-only เท่านั้น
            ไม่ใช่ผลพยากรณ์ที่อนุมัติให้ใช้กับงานสาธารณสุขหรือการแจ้งเตือนจริง
          </p>
          <p>
            รายงานเฝ้าระวังระดับประเทศบน Dashboard เป็น snapshot จากแหล่งอ้างอิงตามวันที่กำกับ
            ไม่ใช่ feed แบบ real-time และไม่ใช่ผลจากโมเดล DengueYosoku
            Alert Center ยังอยู่ในโหมด dry-run/draft ไม่มีการส่งแจ้งเตือนภายนอก
          </p>
          <p>
            Health Assistant ใน Production ค้นคืนหลักฐานและแสดงแหล่งอ้างอิง แต่ยังไม่สร้างคำตอบทางการแพทย์ด้วย AI
            เนื้อหาความรู้ยังรอผู้เชี่ยวชาญทบทวน และ Symptom Checker ไม่ใช่เครื่องมือวินิจฉัย
          </p>
        </div>
      </section>

      <div className="dg-source-meta">
        <Link href="/references" className="dg-source-link">ดูแหล่งข้อมูลและเอกสารอ้างอิง <ArrowUpRight size={13} /></Link>
      </div>
    </div>
  );
}

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
} from "lucide-react";

const systems = [
  { icon: LineChart, title: "Forecast Dashboard", status: "ระบบต้นแบบ", desc: "นำเสนอข้อมูลพยากรณ์จำนวนผู้ป่วยและแนวโน้มความเสี่ยงในระดับจังหวัด โดยต้องแสดงช่วงเวลาของข้อมูลอย่างชัดเจน" },
  { icon: ShieldCheck, title: "Prevention & Protection", status: "ระบบต้นแบบ", desc: "แสดงแนวทางป้องกันและควบคุมโรคที่สอดคล้องกับบริบทความเสี่ยงและข้อมูลที่มีอยู่" },
  { icon: Stethoscope, title: "Symptom Checker", status: "ระบบคัดกรองเบื้องต้น", desc: "แบบประเมินเพื่อให้ข้อมูลเบื้องต้น ไม่ใช่เครื่องมือวินิจฉัยหรือใช้แทนการตรวจโดยบุคลากรทางการแพทย์" },
  { icon: BrainCircuit, title: "AI Health Assistant", status: "อยู่ระหว่างพัฒนา", desc: "ผู้ช่วยให้ความรู้เฉพาะด้านไข้เลือดออก โดยมีแผนเชื่อมคำตอบกับฐานความรู้และแหล่งอ้างอิงที่ตรวจสอบได้" },
  { icon: Database, title: "Dengue Knowledge Hub", status: "อยู่ระหว่างพัฒนา", desc: "ศูนย์รวมบทความ สื่อการเรียนรู้ แบบทดสอบ และเอกสารจากหน่วยงานสาธารณสุข" },
];

const objectives = [
  "สนับสนุนการเฝ้าระวังแนวโน้มโรคไข้เลือดออกด้วยข้อมูลและการพยากรณ์",
  "ส่งเสริมการป้องกันโรคเชิงรุกในระดับบุคคล ครอบครัว และชุมชน",
  "ให้ประชาชนเข้าถึงข้อมูลการคัดกรองอาการและสัญญาณเตือนที่เข้าใจง่าย",
  "รวบรวมองค์ความรู้ด้านไข้เลือดออกจากแหล่งข้อมูลที่ตรวจสอบได้",
  "พัฒนาเครื่องมือดิจิทัลที่ช่วยสื่อสารข้อมูลสุขภาพอย่างรับผิดชอบ",
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
              DengueYosoku เป็นแพลตฟอร์มต้นแบบด้านสุขภาพดิจิทัลที่มุ่งสนับสนุนการเฝ้าระวัง
              การป้องกัน การคัดกรองเบื้องต้น และการเรียนรู้เกี่ยวกับโรคไข้เลือดออก
              โดยผสานข้อมูล เทคโนโลยีเว็บ และแนวคิดการใช้ AI อย่างรับผิดชอบ
            </p>
          </div>
          <div className="dg-hero-art"><ShieldCheck size={82} strokeWidth={1.2} /></div>
        </div>
      </section>

      <section className="dg-stat-strip">
        <div className="dg-stat"><strong>3</strong><span>ระบบต้นแบบเดิม: Forecast · Prevention · Screening</span></div>
        <div className="dg-stat"><strong>8</strong><span>จังหวัดในพื้นที่ สคร.4 ตามขอบเขตโครงการ</span></div>
        <div className="dg-stat"><strong>Next.js</strong><span>เทคโนโลยีเว็บที่ใช้ใน Vercel Edition</span></div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>ที่มาและเป้าหมายของโครงการ</h2><p>Project Overview & Objectives</p></div>
        </div>
        <div className="dg-grid-2">
          <article className="dg-card">
            <div className="dg-card-icon"><Target size={19} /></div>
            <h3>Vision</h3>
            <p>สนับสนุนให้ประชาชนและผู้เกี่ยวข้องเข้าถึงข้อมูลเพื่อเฝ้าระวัง ป้องกัน และทำความเข้าใจโรคไข้เลือดออกได้สะดวกและมีหลักฐานอ้างอิง</p>
          </article>
          <article className="dg-card">
            <div className="dg-card-icon"><Activity size={19} /></div>
            <h3>Mission</h3>
            <p>เชื่อมโยงข้อมูลพยากรณ์ คำแนะนำป้องกัน การคัดกรองเบื้องต้น และองค์ความรู้ด้านสุขภาพให้อยู่ในแพลตฟอร์มเดียว</p>
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
            <p>เปิดเผยขอบเขต วิธีการ แหล่งข้อมูล ข้อจำกัด และสถานะการพัฒนาของระบบอย่างโปร่งใส</p>
          </article>
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>เทคโนโลยีและแนวทางการพัฒนา</h2><p>Technology & Methodology</p></div>
        </div>
        <div className="dg-grid">
          <article className="dg-card"><div className="dg-card-icon"><Code2 size={19} /></div><h3>Web Application</h3><p>พัฒนาด้วย Next.js, React และ TypeScript พร้อมเผยแพร่ผ่าน Vercel</p></article>
          <article className="dg-card"><div className="dg-card-icon"><Database size={19} /></div><h3>Data Integration</h3><p>จัดการข้อมูลพยากรณ์ ข้อมูลสภาพอากาศ และข้อมูลเชิงพื้นที่ในรูปแบบ CSV, JSON และ GeoJSON</p></article>
          <article className="dg-card"><div className="dg-card-icon"><BrainCircuit size={19} /></div><h3>AI & Machine Learning</h3><p>ระบบพยากรณ์และ AI ผู้ช่วยเป็นคนละองค์ประกอบ และต้องผ่านการประเมินแยกตามวัตถุประสงค์ก่อนใช้งาน</p></article>
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
          ชุดข้อมูลพยากรณ์ที่อยู่ในโปรเจกต์ปัจจุบันมีข้อมูลล่าสุดถึงวันที่ 25 ธันวาคม 2022 และข้อมูลสภาพอากาศถึงวันที่ 31 ธันวาคม 2022
          จึงเป็นข้อมูลย้อนหลังสำหรับการศึกษาและทดสอบ ไม่ใช่สถานการณ์ความเสี่ยงปัจจุบัน โมเดลพยากรณ์รุ่นใหม่ยังอยู่ระหว่างพัฒนา
          ส่วน AI Health Assistant ในเวอร์ชันนี้ยังไม่เชื่อมต่อบริการ AI และ Symptom Checker ไม่ใช่เครื่องมือวินิจฉัยทางการแพทย์
        </div>
      </section>

      <div className="dg-source-meta">
        <Link href="/references" className="dg-source-link">ดูแหล่งข้อมูลและเอกสารอ้างอิง <ArrowUpRight size={13} /></Link>
      </div>
    </div>
  );
}

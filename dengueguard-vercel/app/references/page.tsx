import { ArrowUpRight, BookOpen, Building2, Globe2, ShieldCheck } from "lucide-react";

const references = [
  {
    organization: "กรมควบคุมโรค กระทรวงสาธารณสุข",
    title: "แนวทางและคู่มือปฏิบัติงานโรคไข้เลือดออก",
    detail: "หน้ารวมแนวทางและคู่มือ เช่น แนวทางวินิจฉัย ดูแลรักษา มาตรการเฝ้าระวัง และเอกสารสำหรับประชาชน",
    accessed: "เข้าถึงเมื่อ 21 พฤศจิกายน 2569",
    href: "https://ddc.moph.go.th/dvb/pagecontent.php?page=17",
  },
  {
    organization: "World Health Organization (WHO)",
    title: "Dengue and severe dengue",
    detail: "ข้อมูลภาพรวม อาการ สัญญาณของโรครุนแรง การวินิจฉัย การรักษา และการป้องกัน",
    accessed: "เข้าถึงเมื่อ 14 พฤศจิกายน 2569",
    href: "https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue",
  },
  {
    organization: "World Health Organization · South-East Asia Region",
    title: "23rd (2026) Epidemiological Bulletin · Thailand dengue situation",
    detail: "รายงานสถานการณ์ ณ 16 พฤศจิกายน 2569: ผู้ป่วยสงสัยรายใหม่ 694 รายในสัปดาห์ที่ 46 ลดลง 52% จากสัปดาห์ก่อน และไม่มีผู้เสียชีวิตรายใหม่ในสัปดาห์นั้น",
    accessed: "เผยแพร่ 18 พฤศจิกายน 2569 · ช่วงรายงาน 2–15 พฤศจิกายน 2569",
    href: "https://cdn.who.int/media/docs/default-source/searo/whe/wherepib/2026_23_searo_epi_bulletin.pdf",
  },
  {
    organization: "Open-Meteo · Historical Weather API",
    title: "Historical Weather API · Archive endpoint",
    detail: "ข้อมูล reanalysis ย้อนหลังที่ใช้สร้าง feature อุณหภูมิปรากฏย้อนหลังรายสัปดาห์ของโมเดล 77 จังหวัด โดยใช้ best_match และตรวจความสอดคล้องกับ weather source เดิม 52 สัปดาห์ (4,004 province-week pairs) ก่อนนำไปสร้าง input; ไม่ใช่พยากรณ์อากาศแบบ real-time",
    accessed: "เข้าถึงเมื่อ 21 พฤศจิกายน 2569 · ข้อมูลภายใต้ CC BY 4.0",
    href: "https://open-meteo.com/en/docs/historical-weather-api",
    licenseHref: "https://creativecommons.org/licenses/by/4.0/",
  },
  {
    organization: "TRENDS · Zenodo research dataset",
    title: "Thailand province-level weekly surveillance dataset (2016–2025)",
    detail: "ชุดข้อมูลย้อนหลัง 77 จังหวัด × 527 สัปดาห์ รวม 40,579 ระเบียน ครอบคลุมถึง 31 ธันวาคม 2568 ใช้ศึกษาแนวโน้มย้อนหลังและวิจัย ไม่ใช่ข้อมูลปัจจุบันปี 2569",
    accessed: "เผยแพร่ 19 พฤษภาคม 2569 · DOI: 10.5281/zenodo.20269896",
    href: "https://zenodo.org/records/20269896",
  },
  {
    organization: "กรมควบคุมโรค กระทรวงสาธารณสุข",
    title: "โรคไข้เลือดออก: ข้อมูลสำหรับประชาชน",
    detail: "ข้อมูลพื้นฐานเกี่ยวกับโรคและแนวทางป้องกันการถูกยุงกัดและการเกิดแหล่งเพาะพันธุ์ยุง",
    accessed: "หน้าเอกสารระบุอัปเดต 10 สิงหาคม 2565",
    href: "https://www.ddc.moph.go.th/disease_detail.php?d=44%2F",
  },
  {
    organization: "กรมควบคุมโรค กระทรวงสาธารณสุข",
    title: "ข้อมูลเตือนภัยโรคไข้เลือดออก",
    detail: "เอกสารประชาสัมพันธ์เรื่องอาการสำคัญ การไปพบแพทย์ และข้อควรระวังเกี่ยวกับยา",
    accessed: "เอกสารเผยแพร่ปี 2569",
    href: "https://ddc.moph.go.th/uploads/publish/1770320260126135522.pdf",
  },
];

export default function ReferencesPage() {
  return (
    <div className="dg-page">
      <section className="dg-hero">
        <div className="dg-hero-grid">
          <div>
            <span className="dg-eyebrow"><BookOpen size={14} /> SOURCES & TRANSPARENCY</span>
            <h1>References & Sources</h1>
            <p className="dg-lede">
              รวมแหล่งข้อมูลทางการแพทย์และสาธารณสุขที่ใช้ประกอบการจัดทำเนื้อหา DengueYosoku
              เพื่อให้ผู้ใช้งานตรวจสอบเอกสารต้นทางและบริบทของข้อมูลได้ด้วยตนเอง
            </p>
          </div>
          <div className="dg-hero-art"><ShieldCheck size={58} strokeWidth={1.35} /></div>
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div><h2>แหล่งข้อมูลที่คัดเลือก</h2><p>Official health information and guidance</p></div>
        </div>
        <div className="dg-grid-2">
          {references.map((reference) => (
            <article className="dg-card dg-source-card" key={reference.title}>
              <div className="dg-card-icon"><Building2 size={19} /></div>
              <div className="dg-source-meta">{reference.organization}</div>
              <h3>{reference.title}</h3>
              <p>{reference.detail}</p>
              <span className="dg-source-meta">{reference.accessed}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <a className="dg-source-link" href={reference.href} target="_blank" rel="noreferrer">
                  เปิดแหล่งข้อมูล <ArrowUpRight size={14} />
                </a>
                {"licenseHref" in reference && reference.licenseHref && (
                  <a className="dg-source-link" href={reference.licenseHref} target="_blank" rel="noreferrer">
                    ใบอนุญาต CC BY 4.0 <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dg-grid-2">
        <article className="dg-card">
          <div className="dg-card-icon"><Globe2 size={19} /></div>
          <h3>การใช้ข้อมูลอย่างเหมาะสม</h3>
          <p>เอกสารแต่ละฉบับอาจมีวันที่เผยแพร่และขอบเขตการใช้งานแตกต่างกัน ควรเลือกแนวทางที่เป็นปัจจุบันและเหมาะกับบริบทของประเทศไทย โดยเฉพาะข้อมูลด้านการวินิจฉัยและการดูแลรักษา</p>
        </article>
        <article className="dg-card">
          <div className="dg-card-icon"><ShieldCheck size={19} /></div>
          <h3>การทบทวนเนื้อหา</h3>
          <p>ก่อนนำเนื้อหาไปใช้ประกอบการดูแลผู้ป่วยหรือการตัดสินใจทางคลินิก ต้องตรวจสอบเอกสารฉบับเต็มและให้ผู้มีคุณวุฒิที่เกี่ยวข้องทบทวน ไม่ใช้บทสรุปบนเว็บไซต์นี้แทนแนวทางวิชาชีพ</p>
        </article>
      </section>

      <div className="dg-source-meta">รายการนี้เป็นจุดเริ่มต้นของคลังอ้างอิง และจะเพิ่มเติมเมื่อมีการจัดทำบทความหรือสื่อการเรียนรู้แต่ละหมวด</div>
    </div>
  );
}

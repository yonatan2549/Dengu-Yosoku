"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  Bug,
  ClipboardList,
  Droplets,
  GraduationCap,
  HeartPulse,
  Microscope,
  Search,
  ShieldCheck,
  Users,
  ArrowUpRight,
  FileText,
} from "lucide-react";

const categories = [
  { id: "intro", title: "รู้จักโรคไข้เลือดออก", en: "Dengue fundamentals", desc: "เชื้อไวรัสเดงกี พาหะนำโรค การติดต่อ และวงจรชีวิตยุงลาย", icon: Bug },
  { id: "symptoms", title: "อาการและการดำเนินโรค", en: "Symptoms & progression", desc: "อาการทั่วไป ระยะของโรค และการเปลี่ยนแปลงหลังไข้ลด", icon: Activity },
  { id: "warning", title: "สัญญาณเตือนและภาวะแทรกซ้อน", en: "Warning signs", desc: "อาการอันตรายที่ควรได้รับการประเมินทางการแพทย์ทันที", icon: HeartPulse },
  { id: "lab", title: "การตรวจทางห้องปฏิบัติการ", en: "Laboratory diagnosis", desc: "CBC, Platelet, Hematocrit, NS1, IgM และ IgG", icon: Microscope },
  { id: "care", title: "การดูแลและการรักษา", en: "Care & treatment", desc: "การดูแลทั่วไป การติดตามอาการ และการใช้ยาอย่างปลอดภัย", icon: Droplets },
  { id: "prevention", title: "การป้องกันและควบคุมโรค", en: "Prevention & protection", desc: "ลดแหล่งเพาะพันธุ์ยุง ป้องกันยุงกัด และมาตรการในบ้าน", icon: ShieldCheck },
  { id: "community", title: "สุขภาพชุมชน", en: "Community health", desc: "บทบาทครอบครัว โรงเรียน ชุมชน และบุคลากรสาธารณสุข", icon: Users },
  { id: "quiz", title: "คำถามที่พบบ่อยและแบบทดสอบ", en: "FAQ & knowledge quiz", desc: "ทบทวนความรู้ พร้อมคำอธิบายหลังตอบคำถาม", icon: GraduationCap },
  { id: "surveillance", title: "ระบาดวิทยาและงานวิจัย", en: "Surveillance & research", desc: "ข้อมูลเฝ้าระวัง สถิติ งานวิจัย และการพยากรณ์", icon: ClipboardList },
];

const resources = [
  {
    id: "who-dengue",
    category: "intro",
    title: "Dengue and severe dengue",
    description: "เอกสารภาพรวมจาก WHO ครอบคลุมการติดต่อ อาการ การวินิจฉัย การรักษา และการป้องกัน",
    source: "World Health Organization",
    type: "Fact sheet",
    href: "https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue",
  },
  {
    id: "who-warning",
    category: "warning",
    title: "อาการของไข้เลือดออกรุนแรงและสัญญาณเตือน",
    description: "ทำความเข้าใจสัญญาณอันตรายที่อาจเกิดหลังไข้ลดลง และความสำคัญของการเข้ารับการดูแลทันที",
    source: "World Health Organization",
    type: "Health guidance",
    href: "https://www.who.int/en/news-room/fact-sheets/detail/dengue-and-severe-dengue",
  },
  {
    id: "ddc-manual",
    category: "care",
    title: "แนวทางและคู่มือปฏิบัติงานโรคไข้เลือดออก",
    description: "หน้ารวมแนวทาง คู่มือสำหรับบุคลากร ครอบครัว ประชาชน และมาตรการเฝ้าระวังจากกรมควบคุมโรค",
    source: "กรมควบคุมโรค",
    type: "Guidelines & manuals",
    href: "https://ddc.moph.go.th/dvb/pagecontent.php?page=17",
  },
  {
    id: "ddc-prevention",
    category: "prevention",
    title: "การป้องกันไม่ให้ป่วยเป็นโรคไข้เลือดออก",
    description: "ข้อมูลสำหรับประชาชนเกี่ยวกับการป้องกันยุงกัดและลดแหล่งเพาะพันธุ์ยุงลาย",
    source: "กรมควบคุมโรค",
    type: "Public education",
    href: "https://www.ddc.moph.go.th/disease_detail.php?d=44%2F",
  },
  {
    id: "ddc-family",
    category: "community",
    title: "ข้อมูลเตือนภัยและการดูแลตนเองเมื่อสงสัยไข้เลือดออก",
    description: "เอกสารประชาสัมพันธ์ของกรมควบคุมโรคที่สรุปอาการสำคัญและข้อควรระวังในการใช้ยา",
    source: "กรมควบคุมโรค",
    type: "Public health notice",
    href: "https://ddc.moph.go.th/uploads/publish/1770320260126135522.pdf",
  },
];

export default function KnowledgePage() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter((resource) => {
      const categoryMatch = selectedCategory === "all" || resource.category === selectedCategory;
      const textMatch =
        !query ||
        [resource.title, resource.description, resource.source, resource.type]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return categoryMatch && textMatch;
    });
  }, [selectedCategory, search]);

  return (
    <div className="dg-page">
      <section className="dg-hero">
        <div className="dg-hero-grid">
          <div>
            <span className="dg-eyebrow"><BookOpen size={14} /> LEARNING CENTER</span>
            <h1>Dengue Knowledge Hub</h1>
            <p className="dg-lede">
              ศูนย์รวมความรู้โรคไข้เลือดออกสำหรับประชาชน นักเรียน นักศึกษา และผู้สนใจ
              เรียนรู้ผ่านบทความ สื่อภาพ วิดีโอ และแบบทดสอบ โดยยึดแหล่งข้อมูลทางการแพทย์ที่ตรวจสอบได้
            </p>
            <div className="dg-pill" style={{ marginTop: 17 }}>9 หมวดความรู้ · เรียนรู้ได้ตามหัวข้อที่สนใจ</div>
          </div>
          <div className="dg-hero-art"><BookOpen size={82} strokeWidth={1.2} /></div>
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div>
            <h2>ค้นหาความรู้ที่ต้องการ</h2>
            <p>ค้นจากชื่อบทความ คำอธิบาย หรือชื่อหน่วยงานต้นทาง</p>
          </div>
          <Link href="/references" className="dg-card-link">ดูแหล่งอ้างอิงทั้งหมด <ArrowUpRight size={14} /></Link>
        </div>
        <input
          className="dg-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหา เช่น อาการ, เกล็ดเลือด, NS1, การป้องกัน..."
          aria-label="ค้นหาความรู้เกี่ยวกับไข้เลือดออก"
        />
        <div className="dg-chip-row" aria-label="ตัวกรองหมวดความรู้">
          <button type="button" className={"dg-chip" + (selectedCategory === "all" ? " active" : "")} onClick={() => setSelectedCategory("all")}>ทั้งหมด</button>
          {categories.map((category) => (
            <button
              type="button"
              className={"dg-chip" + (selectedCategory === category.id ? " active" : "")}
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.title}
            </button>
          ))}
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div>
            <h2>สำรวจ 9 หมวดความรู้</h2>
            <p>เลือกหมวดเพื่อกรองแหล่งอ่านที่เกี่ยวข้อง</p>
          </div>
        </div>
        <div className="dg-grid">
          {categories.map((category, index) => {
            const Icon = category.icon;
            const active = selectedCategory === category.id;
            return (
              <button
                type="button"
                key={category.id}
                className={"dg-category-card" + (active ? " active" : "")}
                onClick={() => setSelectedCategory(active ? "all" : category.id)}
              >
                <span className="dg-category-icon"><Icon size={19} /></span>
                <span>
                  <strong>{String(index + 1).padStart(2, "0")} · {category.title}</strong>
                  <small>{category.en}<br />{category.desc}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="dg-page">
        <div className="dg-section-head">
          <div>
            <h2>แหล่งเรียนรู้และเอกสารแนะนำ</h2>
            <p>รายการเริ่มต้นจาก WHO และกรมควบคุมโรค เนื้อหาเต็มของแต่ละหมวดจะทยอยจัดทำและทบทวน</p>
          </div>
          <span className="dg-pill">{filteredResources.length} รายการ</span>
        </div>
        {filteredResources.length ? (
          <div className="dg-grid-2">
            {filteredResources.map((resource) => (
              <article className="dg-card dg-article-card" key={resource.id}>
                <div className="dg-source-meta">
                  <span className="dg-pill dg-pill-muted">{resource.type}</span>
                  <span>{resource.source}</span>
                </div>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
                <a className="dg-source-link" href={resource.href} target="_blank" rel="noreferrer">
                  เปิดเอกสารต้นทาง <ArrowUpRight size={14} />
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="dg-empty">
            ไม่พบแหล่งเรียนรู้ในหมวดหรือคำค้นนี้ ลองเปลี่ยนตัวกรอง หรือดูหมวดอื่นได้
          </div>
        )}
      </section>

      <section className="dg-note">
        <FileText size={17} />
        <div>
          <strong>หมายเหตุเกี่ยวกับเนื้อหา</strong>
          หน้านี้เป็นโครงสร้างศูนย์ความรู้ระยะเริ่มต้น รายการที่แสดงเป็นแหล่งข้อมูลต้นทาง ไม่ใช่บทความที่ DengueYosoku ตรวจทานและรับรองเนื้อหาแล้ว
          ก่อนเผยแพร่บทความเชิงคลินิกหรือเนื้อหาสำหรับการดูแลผู้ป่วย ควรให้ผู้มีความรู้ทางการแพทย์ตรวจสอบและระบุวันที่ทบทวน
        </div>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { HealthAssistantKnowledgePanel } from "@/components/HealthAssistantKnowledgePanel";
import { HealthAssistantGovernancePanel } from "@/components/HealthAssistantGovernancePanel";

export function HealthAssistantMoreTools() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="ha-more-tools">
      <button
        type="button"
        className="ha-more-tools-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="ha-more-tools-icon"><SlidersHorizontal size={17} /></span>
        <span className="ha-more-tools-copy">
          <strong>คลังความรู้และหลักฐาน (Evidence-only)</strong>
          <small>ค้นคืนแหล่งอ้างอิง ดูหลักฐาน และสถานะการทบทวน</small>
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {expanded && (
        <div className="ha-more-tools-content">
          <HealthAssistantKnowledgePanel />
          <HealthAssistantGovernancePanel />
        </div>
      )}
    </section>
  );
}

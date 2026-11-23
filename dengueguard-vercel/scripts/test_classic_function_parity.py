"""Static regression contract for classic DengueYosoku feature parity.

This checks that the single-bundle UI completion keeps the legacy ODPC4 systems
available alongside the national model and preserves the old questionnaire advice.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ClassicFunctionParityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dashboard = (ROOT / "app/dashboard/page.tsx").read_text(encoding="utf-8")
        cls.prevention = (ROOT / "app/prevention/page.tsx").read_text(encoding="utf-8")
        cls.symptom = (ROOT / "app/symptom-checker/page.tsx").read_text(encoding="utf-8")
        cls.popup = (ROOT / "components/SupportingPopup.tsx").read_text(encoding="utf-8")
        cls.product_hero = (ROOT / "components/ProductHero.tsx").read_text(encoding="utf-8")
        cls.health_assistant = (ROOT / "app/health-assistant/page.tsx").read_text(encoding="utf-8")
        cls.health_runtime = (ROOT / "lib/health-assistant/runtime-policy.ts").read_text(encoding="utf-8")
        cls.symptom_css = (ROOT / "app/globals.css").read_text(encoding="utf-8")
        cls.platform_css = (ROOT / "app/platform.css").read_text(encoding="utf-8")
        cls.knowledge = (ROOT / "app/knowledge/page.tsx").read_text(encoding="utf-8")
        cls.about = (ROOT / "app/about/page.tsx").read_text(encoding="utf-8")
        cls.references = (ROOT / "app/references/page.tsx").read_text(encoding="utf-8")
        cls.model_operations = (ROOT / "components/ModelOperationsPanel.tsx").read_text(encoding="utf-8")

    def test_dashboard_exposes_both_legacy_and_model_views(self):
        self.assertIn("ระบบเดิม · สคร.4 (8 จังหวัด)", self.dashboard)
        self.assertIn("โมเดลใหม่ · 77 จังหวัด", self.dashboard)
        self.assertIn("<LegacyDashboardPage />", self.dashboard)
        self.assertIn("<ModelDashboard />", self.dashboard)

    def test_validated_national_model_is_selected_by_default_without_effect_delay(self):
        self.assertIn('useState<DashboardDatasetPreference>("model")', self.dashboard)
        self.assertIn("resolveDashboardDatasetView(viewPreference, hasModel)", self.dashboard)
        self.assertNotIn("useEffect(", self.dashboard)
        self.assertIn("if (!data) return null", self.dashboard)
        self.assertIn("disabled={!hasModel}", self.dashboard)

    def test_dashboard_auto_selection_prefers_validated_model_but_preserves_legacy_fallback(self):
        selector = (ROOT / "lib/dashboard-view.ts").read_text(encoding="utf-8")
        self.assertIn('if (preference === "legacy") return "legacy";', selector)
        self.assertIn('return hasValidatedModel ? "model" : "legacy";', selector)

    def test_prevention_exposes_both_legacy_and_model_views(self):
        self.assertIn("ระบบเดิม · สคร.4 (8 จังหวัด)", self.prevention)
        self.assertIn("โมเดลใหม่ · 77 จังหวัด", self.prevention)
        self.assertIn("<LegacyPreventionPage />", self.prevention)
        self.assertIn("<ModelPreventionPage />", self.prevention)

    def test_prevention_auto_selects_only_a_current_model_and_keeps_manual_review(self):
        self.assertIn('useState<DashboardDatasetPreference>("auto")', self.prevention)
        self.assertIn("const isApprovedModel = data.modelPredictions?.release_status === \"approved\"", self.prevention)
        self.assertIn("resolvePreventionDatasetView(viewPreference, hasModel, isCurrentModelWeek, isApprovedModel)", self.prevention)
        self.assertIn("Snapshot 77 จังหวัดนี้ยังเป็น Review-only", self.prevention)
        self.assertNotIn("useEffect(", self.prevention)
        self.assertIn("disabled={!hasModel}", self.prevention)

    def test_prevention_hero_is_at_page_top_and_uses_dashboard_icon_scale(self):
        hero_index = self.prevention.index("<ProductHero")
        selector_index = self.prevention.index('<section className="panel dy-mode-switcher">')
        self.assertLess(hero_index, selector_index)
        self.assertIn('icon={ShieldCheck}', self.prevention)
        self.assertNotIn('iconPosition="top"', self.prevention)
        self.assertIn('<Icon size={58} strokeWidth={1.35} />', self.product_hero)
        self.assertNotIn("dy-product-hero-brand-lockup", self.product_hero)

    def test_all_module_hero_icons_match_dashboard_scale(self):
        self.assertIn('<Icon size={58} strokeWidth={1.35} />', self.product_hero)
        self.assertIn('<ClipboardCheck size={58} strokeWidth={1.35} />', self.symptom)
        self.assertIn('<Bot size={58} strokeWidth={1.35} />', self.health_assistant)
        self.assertIn('<BookOpen size={58} strokeWidth={1.35} />', self.knowledge)
        self.assertIn('<ShieldCheck size={58} strokeWidth={1.35} />', self.about)
        self.assertIn('<ShieldCheck size={58} strokeWidth={1.35} />', self.references)
        self.assertIn('<Activity size={58} strokeWidth={1.35} />', self.model_operations)
        self.assertIn('.heading-icon-card svg { width: 58px; height: 58px;', self.symptom_css)
        self.assertIn('.ha-page-heading-icon svg { width: 48px; height: 48px;', self.platform_css)
        self.assertIn('.dg-hero-art svg { width: 58px; height: 58px;', self.platform_css)

    def test_health_assistant_ai_is_paused_and_evidence_tools_remain_available(self):
        self.assertNotIn("HealthAssistantChatPanel", self.health_assistant)
        self.assertIn("AI พักการพัฒนา", self.health_assistant)
        self.assertIn("<HealthAssistantMoreTools />", self.health_assistant)
        self.assertIn("HEALTH_ASSISTANT_PAUSED", self.health_runtime)
        self.assertIn('env.HEALTH_ASSISTANT_PAUSED !== "false"', self.health_runtime)
        env_example = (ROOT / ".env.example").read_text(encoding="utf-8")
        self.assertIn("HEALTH_ASSISTANT_PAUSED=true", env_example)
        self.assertIn("HEALTH_ASSISTANT_ENABLE_DRAFT_ANSWERS=false", env_example)

    def test_legacy_prevention_shows_selected_province_weather(self):
        self.assertIn("สภาพอากาศจังหวัดที่เลือก", self.prevention)
        self.assertIn("selectedRainfall", self.prevention)
        self.assertIn("selectedTemperature", self.prevention)
        self.assertIn("selectedWeatherDays", self.prevention)
        self.assertIn("normalizeProvince(row.province)", self.prevention)

    def test_supporting_popup_shows_latest_snapshot_forecast_week_and_remains_reopenable(self):
        self.assertIn('const forecastWeek = model?.coverage.forecast_week ?? "";', self.popup)
        self.assertIn("formatEpiWeekLabel(forecastWeek)", self.popup)
        self.assertIn('className="floating-info-button"', self.popup)
        self.assertIn("row.week_start === forecastWeek", self.popup)
        self.assertIn("forecastRows.length === EXPECTED_PROVINCES", self.popup)
        self.assertIn("ยังไม่มีข้อมูลผู้ป่วยจริงรายจังหวัด", self.popup)
        self.assertNotIn("addSevenDays", self.popup)
        self.assertNotIn("isCurrentModelSnapshot", self.popup)

    def test_symptom_checker_validates_optional_lab_numbers_before_results(self):
        self.assertIn("numericSpecs: Array<[string, number, number, string]>", self.symptom)
        self.assertIn("parseOptionalNumber(answers[key], label, minimum, maximum)", self.symptom)
        self.assertIn("setNavigationError(numericErrors.join", self.symptom)

    def test_symptom_checker_restores_self_care_and_emergency_guidance(self):
        self.assertIn("คำแนะนำทั่วไปหลังการประเมิน", self.symptom)
        self.assertIn("โทร 1669", self.symptom)
        self.assertIn("หลีกเลี่ยง aspirin", self.symptom)
        self.assertIn("ibuprofen", self.symptom)
        self.assertIn("ไม่ควรใช้การดูแลตนเองแทนการรักษา", self.symptom)


if __name__ == "__main__":
    unittest.main(verbosity=2)

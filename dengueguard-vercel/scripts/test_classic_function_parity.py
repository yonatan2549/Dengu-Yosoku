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

    def test_dashboard_exposes_both_legacy_and_model_views(self):
        self.assertIn("ระบบเดิม · สคร.4 (8 จังหวัด)", self.dashboard)
        self.assertIn("โมเดลใหม่ · 77 จังหวัด", self.dashboard)
        self.assertIn("<LegacyDashboardPage />", self.dashboard)
        self.assertIn("<ModelDashboard />", self.dashboard)

    def test_validated_national_model_is_selected_by_default_without_effect_delay(self):
        self.assertIn('useState<DashboardDatasetPreference>("auto")', self.dashboard)
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
        self.assertIn("resolvePreventionDatasetView(viewPreference, hasModel, isCurrentModelWeek)", self.prevention)
        self.assertNotIn("useEffect(", self.prevention)
        self.assertIn("disabled={!hasModel}", self.prevention)

    def test_legacy_prevention_shows_selected_province_weather(self):
        self.assertIn("สภาพอากาศจังหวัดที่เลือก", self.prevention)
        self.assertIn("selectedRainfall", self.prevention)
        self.assertIn("selectedTemperature", self.prevention)
        self.assertIn("selectedWeatherDays", self.prevention)
        self.assertIn("normalizeProvince(row.province)", self.prevention)

    def test_classic_supporting_popup_is_available_when_model_snapshot_is_not_current(self):
        self.assertIn("getCurrentEpiWeekStart", self.popup)
        self.assertIn("isCurrentModelSnapshot", self.popup)
        self.assertIn("if (!summary || !data || isCurrentModelSnapshot) return null", self.popup)

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

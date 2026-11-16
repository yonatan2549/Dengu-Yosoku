export type RiskLevel = "ปกติ" | "เฝ้าระวัง" | "เตือนระบาด" | "ไม่มีข้อมูล";

export interface ForecastRow {
  province: string;
  year: number;
  target_week_start: string;
  target: number | null;
  cases_now: number | null;
  cases_roll4: number | null;
  pred: number;
  thr_watch: number;
  thr_alert: number;
  level: RiskLevel;
}

export interface ModelMapRow {
  province: string;
  prediction: number;
  actual_cases: number | null;
  persistence: number | null;
}

export interface ModelHistoryRow {
  province: string;
  week_start: string;
  year: number;
  actual_cases: number;
  prediction: number;
  persistence: number;
  seasonal_naive: number;
  climatology: number;
  residual: number;
}

export interface ModelForecastRow {
  province: string;
  week_start: string;
  year: number;
  prediction: number;
}

export interface ModelPredictionsPayload {
  schema_version: number;
  model_name: string;
  source_repository: string;
  model_revision: string | null;
  generated_at_utc: string;
  province_count: number;
  provinces: string[];
  history: ModelHistoryRow[];
  forecast: ModelForecastRow[];
  coverage: {
    history_rows: number;
    history_week_count: number;
    history_start_week: string;
    history_end_week: string;
    forecast_rows: number;
    forecast_week: string;
    forecast_is_after_history: boolean;
  };
  freshness?: {
    timezone: string;
    source_retrieved_at_utc: string | null;
    converted_at_utc: string;
    current_week_start_at_conversion: string;
    forecast_is_current_or_future_at_conversion: boolean;
    forecast_lag_weeks_at_conversion: number;
  };
  semantic_notes: Record<string, string>;
}

export interface ModelMetricsPayload {
  schema_version: number;
  model_name: string;
  source_repository: string;
  model_revision: string | null;
  generated_at_utc: string;
  metrics: Record<string, unknown>;
}

export interface WeatherRow {
  province: string;
  date: string;
  temperature_2m_mean: number | null;
  temperature_2m_max: number | null;
  temperature_2m_min: number | null;
  precipitation_sum: number | null;
  precipitation_hours: number | null;
  humidity_mean: number | null;
  humidity_min: number | null;
}

export interface PreventionAction {
  level: string;
  priority: number;
  action: string;
  frequency: string;
  target_group: string;
  source: string;
}

export interface QuestionRow {
  section_id: string;
  section_title: string;
  section_order: number;
  question_order: number;
  field_key: string;
  question_th: string;
  input_type: "radio" | "select" | "checkbox" | "text";
  options_key: string;
  required: string;
  placeholder: string;
  help_text: string;
}

export interface OptionRow {
  options_key: string;
  option_value: string;
  option_label: string;
  display_order: number;
}

export interface RecommendationRow {
  group_code: string;
  result_code: string;
  title_th: string;
  message_th: string;
  action_th: string;
}

export interface RuleRow {
  rule_id: string;
  domain: string;
  condition_code: string;
  logic_summary_th: string;
  output_code: string;
  priority: number;
  reference_url: string;
  clinical_note_th: string;
}

export interface ModelMeta {
  test_year: number;
  horizon_weeks: number;
  metrics: Record<string, { MAE: number; RMSE: number }>;
  alert: { n_real: number; recall: number; precision: number };
}

export interface GeoFeature {
  type: string;
  properties: Record<string, any>;
  geometry: any;
}

export interface GeoJsonData {
  type: "FeatureCollection";
  features: GeoFeature[];
}

export interface DengueData {
  predictions: ForecastRow[];
  weather: WeatherRow[];
  preventionActions: PreventionAction[];
  questions: QuestionRow[];
  options: OptionRow[];
  rules: RuleRow[];
  recommendations: RecommendationRow[];
  meta: ModelMeta;
  thailandGeo: GeoJsonData;
  odpcGeo: GeoJsonData;
  modelPredictions: ModelPredictionsPayload | null;
  modelMetrics: ModelMetricsPayload | null;
}

export interface RegionalSummary {
  week: string;
  totalPredicted: number;
  alertCount: number;
  watchCount: number;
  normalCount: number;
  rainfallAverage: number | null;
  temperatureAverage: number | null;
  weatherProvinceCount: number;
  weatherDays: number;
  trend: "เพิ่มขึ้น" | "ลดลง" | "ค่อนข้างคงที่" | "ไม่มีข้อมูลเปรียบเทียบ";
  trendDelta: number | null;
  trendPercent: number | null;
  previousTotal: number | null;
}

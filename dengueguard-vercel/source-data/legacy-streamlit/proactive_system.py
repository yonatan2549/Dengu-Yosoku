"""DengueYosoku proactive prevention and early-warning panel.

This module uses the existing forecast output (pred, thr_watch, thr_alert, level)
and displays a province-level, in-app early warning plus prevention actions.
It does not estimate an individual person's infection probability and does not
send external notifications (LINE/email/SMS).
"""

from pathlib import Path
from typing import Optional, Any

import pandas as pd
import streamlit as st


EXPECTED_LEVELS = ("ปกติ", "เฝ้าระวัง", "เตือนระบาด")


def _to_number(value: Any) -> Optional[float]:
    """Convert a value to float; return None for missing or invalid values."""
    try:
        if pd.isna(value):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_cases(value: Optional[float]) -> str:
    if value is None:
        return "ไม่มีข้อมูล"
    return f"{value:,.1f} ราย"


def _first_value(row: pd.Series, candidates) -> Any:
    """Return the first non-empty value found among candidate columns."""
    for column in candidates:
        if column in row.index:
            value = row[column]
            if pd.notna(value) and str(value).strip() != "":
                return value
    return None


def _load_weather_row(
    weather_path: Optional[Path], province: str, selected_week
) -> Optional[pd.Series]:
    """Load weather context for an exact province and target week.

    Expected columns: province, target_week_start, and one or more of
    rainfall_mm, rainfall_level, temp_avg_c, weather_data_type, source.
    """
    if weather_path is None:
        return None

    path = Path(weather_path)
    if not path.exists():
        return None

    try:
        weather = pd.read_csv(path, encoding="utf-8-sig")
    except (OSError, UnicodeError, pd.errors.ParserError):
        return None

    required = {"province", "target_week_start"}
    if not required.issubset(weather.columns):
        return None

    weather = weather.copy()
    weather["province"] = weather["province"].astype(str).str.strip()
    weather["target_week_start"] = pd.to_datetime(
        weather["target_week_start"], errors="coerce"
    ).dt.normalize()
    target = pd.to_datetime(selected_week, errors="coerce")
    if pd.isna(target):
        return None
    target = target.normalize()

    matched = weather.loc[
        (weather["province"] == str(province).strip())
        & (weather["target_week_start"] == target)
    ]
    if matched.empty:
        return None
    return matched.iloc[0]


def _load_actions(actions_path: Optional[Path]) -> pd.DataFrame:
    """Load preventive actions from CSV and validate the required columns."""
    if actions_path is None:
        return pd.DataFrame()

    path = Path(actions_path)
    if not path.exists():
        st.warning(
            f"ไม่พบไฟล์คำแนะนำ {path}. "
            "กรุณาตรวจสอบตำแหน่ง prevention_actions.csv"
        )
        return pd.DataFrame()

    try:
        actions = pd.read_csv(path, encoding="utf-8-sig", dtype=str).fillna("")
    except (OSError, UnicodeError, pd.errors.ParserError) as exc:
        st.warning(f"อ่านไฟล์คำแนะนำไม่สำเร็จ: {exc}")
        return pd.DataFrame()

    required = {"level", "priority", "action", "frequency", "target_group"}
    missing = required.difference(actions.columns)
    if missing:
        st.warning(
            "ไฟล์ prevention_actions.csv ขาดคอลัมน์: "
            + ", ".join(sorted(missing))
        )
        return pd.DataFrame()

    actions["priority_num"] = pd.to_numeric(
        actions["priority"], errors="coerce"
    ).fillna(9999)
    return actions.sort_values("priority_num")



def _mark_supporting_info_dismissed() -> None:
    """Remember that the initial supporting-information dialog was dismissed."""
    st.session_state["proactive_supporting_info_dismissed"] = True


@st.dialog(
    "ข้อมูลประกอบการประเมินความเสี่ยง",
    width="large",
    dismissible=True,
    on_dismiss=_mark_supporting_info_dismissed,
)
def _show_supporting_info_dialog(
    province: str,
    week_label: str,
    forecast_display: str,
    rainfall_display: str,
    temperature_display: str,
    trend_label: str,
    trend_delta_label: Optional[str],
    weather_type: Optional[Any],
    weather_source_name: Optional[Any],
    weather_is_missing: bool,
) -> None:
    """Show supporting information in a modal dialog."""
    st.caption(f"จังหวัด{province} | สัปดาห์เป้าหมาย {week_label}")
    st.write(
        "ข้อมูลต่อไปนี้ใช้ประกอบการทำความเข้าใจผลพยากรณ์ "
        "ไม่ใช่การยืนยันว่าจะเกิดการระบาดหรือเป็นความเสี่ยงเฉพาะบุคคล"
    )

    context1, context2, context3, context4 = st.columns(4)
    context1.metric("จำนวนผู้ป่วยที่คาดการณ์", forecast_display)
    context2.metric("ปริมาณน้ำฝน", rainfall_display)
    context3.metric("อุณหภูมิเฉลี่ย", temperature_display)
    context4.metric(
        "แนวโน้มผู้ป่วย",
        trend_label,
        delta=trend_delta_label,
        delta_color="inverse",
    )

    if weather_is_missing:
        st.caption(
            "ยังไม่มีข้อมูลสภาพอากาศสำหรับจังหวัดและสัปดาห์นี้ "
            "กรุณาเติม data/weather_data.csv โดยใช้โครงสร้างใน "
            "data/weather_data_template.csv"
        )
    else:
        weather_notes = []
        if weather_type is not None:
            weather_notes.append(f"ประเภทข้อมูลอากาศ: {weather_type}")
        if weather_source_name is not None:
            weather_notes.append(f"แหล่งข้อมูล: {weather_source_name}")
        if weather_notes:
            st.caption(" | ".join(weather_notes))

    st.caption(
        "แนวโน้มคำนวณจากค่าพยากรณ์ของสัปดาห์เป้าหมายที่เลือก "
        "เทียบกับสัปดาห์เป้าหมายก่อนหน้าในปีเดียวกัน "
        "ไม่ใช่แนวโน้มจากจำนวนผู้ป่วยจริง"
    )
    st.caption(
        "หมายเหตุ: ควรระบุว่าเป็นข้อมูลสภาพอากาศตรวจวัดจริงหรือพยากรณ์อากาศ "
        "และต้องตรงกับจังหวัดและสัปดาห์เป้าหมาย ห้ามใช้ค่าตัวอย่างแทนข้อมูลจริง"
    )

    if st.button(
        "ปิดและเข้าสู่เว็บไซต์",
        type="primary",
        use_container_width=True,
        key="proactive_close_supporting_info",
    ):
        st.session_state["proactive_supporting_info_dismissed"] = True
        st.rerun()

def render_proactive_system(
    current_week: pd.DataFrame,
    all_predictions: pd.DataFrame,
    selected_year: int,
    selected_week,
    default_province: Optional[str] = None,
    actions_path: Optional[Path] = None,
    weather_path: Optional[Path] = None,
) -> None:
    """Render the proactive prevention and early-warning system.

    Args:
        current_week: Forecast rows for the selected target week (one row/province).
        all_predictions: Full forecast dataframe used for week-to-week context.
        selected_year: Selected forecast year from the dashboard sidebar.
        selected_week: Selected target_week_start (date/Timestamp).
        default_province: Optional province selected in the dashboard sidebar.
        actions_path: Path to prevention_actions.csv.
        weather_path: Optional weather_data.csv for rainfall and mean temperature.
    """
    st.subheader("ระบบป้องกันโรคเชิงรุกและแจ้งเตือนล่วงหน้า")
    st.caption(
        "ระบบใช้ผลพยากรณ์รายจังหวัดเพื่อแจ้งเตือนและเสนอแนวทางป้องกันล่วงหน้า "
        "ระดับที่แสดงเป็นระดับตามเกณฑ์ในโมเดล ไม่ใช่ความน่าจะเป็นที่บุคคลจะติดเชื้อ"
    )

    if current_week is None or current_week.empty:
        st.info("ไม่มีข้อมูลพยากรณ์สำหรับสัปดาห์ที่เลือก")
        return

    required_current = {"province", "pred", "level", "thr_watch", "thr_alert"}
    missing_current = required_current.difference(current_week.columns)
    if missing_current:
        st.error(
            "ข้อมูลพยากรณ์ขาดคอลัมน์ที่จำเป็น: "
            + ", ".join(sorted(missing_current))
        )
        return

    current = current_week.copy()
    current["province"] = current["province"].astype(str)
    current["level"] = current["level"].astype(str)

    # Area-wide overview for the selected target week.
    alert_count = int((current["level"] == "เตือนระบาด").sum())
    watch_count = int((current["level"] == "เฝ้าระวัง").sum())
    normal_count = int((current["level"] == "ปกติ").sum())

    st.markdown("#### ภาพรวมการแจ้งเตือนในพื้นที่ สคร.4")
    col1, col2, col3 = st.columns(3)
    col1.metric("จังหวัดระดับเตือนระบาด", f"{alert_count} จังหวัด")
    col2.metric("จังหวัดระดับเฝ้าระวัง", f"{watch_count} จังหวัด")
    col3.metric("จังหวัดระดับปกติ", f"{normal_count} จังหวัด")

    alert_names = current.loc[
        current["level"] == "เตือนระบาด", "province"
    ].tolist()
    watch_names = current.loc[
        current["level"] == "เฝ้าระวัง", "province"
    ].tolist()

    if alert_names:
        st.error("จังหวัดที่ควรติดตามใกล้ชิด: " + "、".join(alert_names))
    elif watch_names:
        st.warning("จังหวัดที่ควรเพิ่มการเฝ้าระวัง: " + "、".join(watch_names))
    else:
        st.success("ยังไม่มีจังหวัดที่อยู่ในระดับเฝ้าระวังหรือเตือนระบาดตามเกณฑ์พยากรณ์ที่เลือก")

    st.divider()
    st.markdown("#### การแจ้งเตือนรายจังหวัด")

    provinces = sorted(current["province"].dropna().unique().tolist())
    if not provinces:
        st.info("ไม่พบรายชื่อจังหวัดในข้อมูลสัปดาห์นี้")
        return

    if default_province not in provinces:
        default_index = 0
    else:
        default_index = provinces.index(default_province)

    selected_province = st.selectbox(
        "เลือกจังหวัดเพื่อดูการแจ้งเตือนและคำแนะนำ",
        provinces,
        index=default_index,
        key="proactive_selected_province",
    )

    selected_rows = current.loc[current["province"] == selected_province]
    if selected_rows.empty:
        st.warning("ไม่พบข้อมูลพยากรณ์ของจังหวัดที่เลือก")
        return

    row = selected_rows.iloc[0]
    level = str(row["level"])
    pred = _to_number(row["pred"])
    watch_threshold = _to_number(row["thr_watch"])
    alert_threshold = _to_number(row["thr_alert"])

    try:
        week_label = pd.to_datetime(selected_week).strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        week_label = str(selected_week)

    # Persistent in-app alert; no external message is sent.
    if level == "เตือนระบาด":
        st.error(
            f"🚨 แจ้งเตือนล่วงหน้า: จังหวัด{selected_province} "
            f"อยู่ในระดับเตือนระบาดสำหรับสัปดาห์เป้าหมาย {week_label}"
        )
        status_explanation = "ค่าพยากรณ์อยู่ในระดับเตือนระบาดตามเกณฑ์ของโมเดล"
    elif level == "เฝ้าระวัง":
        st.warning(
            f"⚠️ แจ้งเตือนเฝ้าระวัง: จังหวัด{selected_province} "
            f"ควรเพิ่มมาตรการป้องกันสำหรับสัปดาห์เป้าหมาย {week_label}"
        )
        status_explanation = "ค่าพยากรณ์อยู่ในระดับเฝ้าระวังตามเกณฑ์ของโมเดล"
    elif level == "ปกติ":
        st.success(
            f"จังหวัด{selected_province} อยู่ในระดับปกติตามเกณฑ์พยากรณ์ "
            f"สำหรับสัปดาห์เป้าหมาย {week_label}"
        )
        status_explanation = "ค่าพยากรณ์ยังไม่ถึงเกณฑ์เฝ้าระวังของโมเดล แต่ยังควรป้องกันยุงลายต่อเนื่อง"
    else:
        st.info("ไม่สามารถระบุระดับการแจ้งเตือนของจังหวัดนี้ได้จากข้อมูลที่มี")
        status_explanation = "โปรดตรวจสอบค่า level ในไฟล์ predictions_h2.csv"

    st.caption(status_explanation)
    st.caption(
        f"เกณฑ์เฝ้าระวัง: {_format_cases(watch_threshold)} | "
        f"เกณฑ์เตือนระบาด: {_format_cases(alert_threshold)}"
    )

    if level == "เตือนระบาด" and pred is not None and alert_threshold is not None:
        st.write(
            f"เหตุผล: ค่าพยากรณ์ {pred:,.1f} ราย เทียบกับเกณฑ์เตือนระบาด "
            f"{alert_threshold:,.1f} ราย"
        )
    elif level == "เฝ้าระวัง" and pred is not None and watch_threshold is not None:
        st.write(
            f"เหตุผล: ค่าพยากรณ์ {pred:,.1f} ราย เทียบกับเกณฑ์เฝ้าระวัง "
            f"{watch_threshold:,.1f} ราย"
        )

    # Compare against the previous target week if available.
    previous_pred = None
    trend_label = "ไม่มีข้อมูลเปรียบเทียบ"
    trend_delta_label = None

    if all_predictions is not None and not all_predictions.empty:
        needed_history = {"province", "year", "target_week_start", "pred", "level"}
        if needed_history.issubset(all_predictions.columns):
            history = all_predictions.copy()
            history["target_week_start"] = pd.to_datetime(
                history["target_week_start"], errors="coerce"
            )
            target_dt = pd.to_datetime(selected_week, errors="coerce")
            history = history.loc[
                (history["province"].astype(str) == selected_province)
                & (pd.to_numeric(history["year"], errors="coerce") == int(selected_year))
                & (history["target_week_start"] < target_dt)
            ].sort_values("target_week_start")

            if not history.empty:
                previous = history.iloc[-1]
                previous_pred = _to_number(previous["pred"])
                previous_level = str(previous["level"])

                if pred is not None and previous_pred is not None:
                    difference = pred - previous_pred
                    if difference > 0:
                        trend_label = "เพิ่มขึ้น"
                    elif difference < 0:
                        trend_label = "ลดลง"
                    else:
                        trend_label = "คงที่"
                    trend_delta_label = f"{difference:+,.1f} ราย"
                    if previous_pred > 0:
                        pct_change = (difference / previous_pred) * 100
                        st.metric(
                            "เปรียบเทียบกับสัปดาห์เป้าหมายก่อนหน้า",
                            _format_cases(pred),
                            delta=f"{difference:+,.1f} ราย ({pct_change:+.1f}%)",
                        )
                    else:
                        st.metric(
                            "เปรียบเทียบกับสัปดาห์เป้าหมายก่อนหน้า",
                            _format_cases(pred),
                            delta=f"{difference:+,.1f} รายจากสัปดาห์ก่อน",
                        )

                if previous_level != level:
                    st.info(
                        f"ระดับพยากรณ์เปลี่ยนจาก '{previous_level}' "
                        f"เป็น '{level}' เมื่อเทียบกับสัปดาห์เป้าหมายก่อนหน้า"
                    )
            else:
                st.caption("ยังไม่มีข้อมูลสัปดาห์เป้าหมายก่อนหน้าในปีที่เลือกสำหรับเปรียบเทียบ")

    # Supporting context: prediction, weather, and trend.
    weather_row = _load_weather_row(weather_path, selected_province, selected_week)

    # Also accept weather columns already merged into predictions_h2.csv.
    weather_source = weather_row if weather_row is not None else row
    rainfall_level = _first_value(
        weather_source,
        ["rainfall_level", "rain_level", "precipitation_level", "rain_category"],
    )
    rainfall_mm = _first_value(
        weather_source,
        ["rainfall_mm", "rain_mm", "precipitation_mm", "precip_mm", "rainfall", "precipitation"],
    )
    mean_temp = _first_value(
        weather_source,
        ["temp_avg_c", "avg_temp_c", "temp_mean", "tmean", "tavg", "avg_temp", "temperature_mean"],
    )
    weather_type = _first_value(
        weather_source,
        ["weather_data_type", "data_type", "weather_type"],
    )
    weather_source_name = _first_value(weather_source, ["source", "weather_source"])

    if rainfall_level is not None:
        rainfall_display = str(rainfall_level)
    elif rainfall_mm is not None:
        numeric_rain = _to_number(rainfall_mm)
        rainfall_display = (
            f"{numeric_rain:,.1f} มม."
            if numeric_rain is not None
            else str(rainfall_mm)
        )
    else:
        rainfall_display = "ไม่มีข้อมูล"

    numeric_temp = _to_number(mean_temp)
    temperature_display = (
        f"{numeric_temp:.1f} °C"
        if numeric_temp is not None
        else (str(mean_temp) if mean_temp is not None else "ไม่มีข้อมูล")
    )

    # Show supporting information as a modal when the user first enters the app.
    # The dialog is dismissed by the close button or the built-in X.
    weather_is_missing = (
        weather_row is None
        and rainfall_level is None
        and rainfall_mm is None
        and mean_temp is None
    )

    if "proactive_supporting_info_dismissed" not in st.session_state:
        st.session_state["proactive_supporting_info_dismissed"] = False

    if not st.session_state["proactive_supporting_info_dismissed"]:
        _show_supporting_info_dialog(
            province=selected_province,
            week_label=week_label,
            forecast_display=_format_cases(pred),
            rainfall_display=rainfall_display,
            temperature_display=temperature_display,
            trend_label=trend_label,
            trend_delta_label=trend_delta_label,
            weather_type=weather_type,
            weather_source_name=weather_source_name,
            weather_is_missing=weather_is_missing,
        )
    elif st.button("ดูข้อมูลประกอบ", key="proactive_reopen_supporting_info"):
        _show_supporting_info_dialog(
            province=selected_province,
            week_label=week_label,
            forecast_display=_format_cases(pred),
            rainfall_display=rainfall_display,
            temperature_display=temperature_display,
            trend_label=trend_label,
            trend_delta_label=trend_delta_label,
            weather_type=weather_type,
            weather_source_name=weather_source_name,
            weather_is_missing=weather_is_missing,
        )

    # Prevention actions loaded from CSV.
    st.divider()
    st.markdown("#### สิ่งที่ควรปฏิบัติ")
    actions = _load_actions(actions_path)
    level_actions = actions.loc[actions["level"] == level] if not actions.empty else pd.DataFrame()

    if not level_actions.empty:
        for _, action_row in level_actions.iterrows():
            action_text = str(action_row["action"]).strip()
            frequency = str(action_row["frequency"]).strip()
            target_group = str(action_row["target_group"]).strip()
            if action_text:
                st.markdown(f"- {action_text}")
                details = []
                if frequency:
                    details.append(frequency)
                if target_group:
                    details.append(f"กลุ่มเป้าหมาย: {target_group}")
                if details:
                    st.caption(" | ".join(details))
    else:
        st.info("ยังไม่มีคำแนะนำสำหรับระดับนี้ใน prevention_actions.csv")

    st.info(
        "หากมีไข้หรืออาการผิดปกติ ควรเข้ารับการประเมินจากบุคลากรทางการแพทย์ "
        "ไม่ควรรอการแจ้งเตือนจาก Dashboard และหลีกเลี่ยงการซื้อยาแอสไพริน "
        "หรือยา NSAIDs เช่น ibuprofen รับประทานเองเมื่อสงสัยไข้เลือดออก"
    )

    st.caption(
        "หมายเหตุ: การแจ้งเตือนนี้แสดงภายในเว็บไซต์ โดยอ้างอิงค่าพยากรณ์รายจังหวัด "
        "ไม่ใช่การยืนยันว่ามีการระบาดจริง ไม่ใช่ความเสี่ยงเฉพาะบุคคล "
        "และยังไม่ได้ส่งข้อความผ่าน LINE, Email หรือ SMS"
    )

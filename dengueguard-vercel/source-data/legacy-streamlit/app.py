

import json
import sys
import importlib
import urllib.request
from pathlib import Path

import streamlit as st

# ต้องเป็นคำสั่ง Streamlit แรก ก่อน import โมดูลย่อยของโปรเจกต์
st.set_page_config(
    page_title="พยากรณ์ไข้เลือดออก สคร.4",
    layout="wide"
)

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# ==========================================
# APP DIRECTORY
# ==========================================

APP_DIR = Path(__file__).resolve().parent

if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

DATA = APP_DIR / "data"

# GeoJSON ขอบเขตครบ 77 จังหวัดของประเทศไทย
THAILAND_GEOJSON_PATH = DATA / "thailand_provinces.geojson"
THAILAND_GEOJSON_URL = (
    "https://raw.githubusercontent.com/"
    "chingchai/OpenGISData-Thailand/master/provinces.geojson"
)

COLORS = {
    "ปกติ": "#2ecc71",
    "เฝ้าระวัง": "#f1c40f",
    "เตือนระบาด": "#e74c3c",
    "ไม่มีข้อมูล": "#BFC5CC",
}

ALL = "รวม 8 จังหวัด"

# ==========================================
# SYSTEM 3: DENGUE SYMPTOM CHECKER
# ==========================================

render_symptom_checker = None
symptom_import_error = None
try:
    from questionnaire import symptom_checker as symptom_checker_module
    importlib.reload(symptom_checker_module)
    render_symptom_checker = symptom_checker_module.render_symptom_checker
except Exception as exc:
    symptom_import_error = exc

# ==========================================
# SYSTEM 2: PROACTIVE PREVENTION
# ==========================================

render_proactive_system = None
proactive_import_error = None
try:
    import proactive_system as proactive_system_module
    importlib.reload(proactive_system_module)
    render_proactive_system = proactive_system_module.render_proactive_system
except Exception as exc:
    proactive_import_error = exc

# ==========================================
# SIDEBAR MENU
# ==========================================

with st.sidebar:
    st.header("Menu")

    page = st.radio(
        "เลือกหน้าที่ต้องการใช้งาน",
        [
            "Dashboard",
            "Dengue Symptom Checker"
        ],
        index=0
    )

if page == "Dengue Symptom Checker":
    if render_symptom_checker is None:
        st.error("โหลดระบบประเมินอาการไม่สำเร็จ ตรวจสอบข้อผิดพลาดด้านล่าง")
        st.exception(symptom_import_error)
    else:
        render_symptom_checker()
    st.stop()


@st.cache_data
def load():
    df = pd.read_csv(
        DATA / "predictions_h2.csv",
        parse_dates=["target_week_start"]
    )

    # ดาวน์โหลดขอบเขตประเทศไทย 77 จังหวัดอัตโนมัติในครั้งแรก
    DATA.mkdir(parents=True, exist_ok=True)
    if not THAILAND_GEOJSON_PATH.exists():
        try:
            urllib.request.urlretrieve(
                THAILAND_GEOJSON_URL,
                THAILAND_GEOJSON_PATH
            )
        except Exception as exc:
            raise RuntimeError(
                "ดาวน์โหลดไฟล์แผนที่ประเทศไทยไม่สำเร็จ "
                "กรุณาตรวจสอบอินเทอร์เน็ต หรือดาวน์โหลดไฟล์ provinces.geojson "
                "แล้วเปลี่ยนชื่อเป็น thailand_provinces.geojson "
                f"และวางไว้ใน {DATA}"
            ) from exc

    geo = json.loads(
        THAILAND_GEOJSON_PATH.read_text(encoding="utf-8")
    )
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    return df, geo, meta


def normalize_province_name(name):
    """ปรับชื่อจังหวัดให้เทียบกันได้ทั้งชื่อไทยและชื่ออังกฤษ"""
    name = str(name).strip().lower()
    name = name.replace("จังหวัด", "").replace("จ.", "")
    name = "".join(name.split())

    # รองรับชื่อกรุงเทพฯ ที่อาจเขียนต่างกันในไฟล์ข้อมูล
    if name in {"กรุงเทพ", "กรุงเทพฯ", "bangkok"}:
        return "กรุงเทพมหานคร" if name != "bangkok" else "bangkok"

    return name


def format_map_value(value, digits=1):
    if pd.isna(value):
        return "ไม่มีข้อมูล"
    return f"{value:,.{digits}f}"


try:
    df, geo, meta = load()
except Exception as exc:
    st.title("DengueYosoku: Dashboard")
    st.error("โหลดข้อมูล Dashboard ไม่สำเร็จ กรุณาตรวจสอบข้อความผิดพลาดด้านล่าง")
    st.exception(exc)
    st.info(
        "ตรวจสอบว่าในโฟลเดอร์ dashboard/data มี predictions_h2.csv, "
        "meta.json และไฟล์ข้อมูลที่จำเป็นครบถ้วน"
    )
    st.stop()

with st.sidebar:
    prov = st.selectbox(
        "จังหวัดสำหรับกราฟแนวโน้ม",
        [ALL] + sorted(df["province"].unique())
    )
    years = sorted(df["year"].unique())
    year = st.selectbox("ปี", years, index=len(years) - 1)
    weeks = list(
        pd.DatetimeIndex(
            df.loc[df["year"] == year, "target_week_start"].unique()
        ).sort_values()
    )
    week = st.select_slider(
        "สัปดาห์ที่พยากรณ์",
        options=weeks,
        value=weeks[-1],
        format_func=lambda d: d.strftime("%d/%m/%Y")
    )
    if year < meta["test_year"]:
        st.warning(
            f"ปี {year} เป็นข้อมูลที่โมเดลใช้เรียน ผลจะดูแม่นเกินจริง "
            f"ให้ใช้ปี {meta['test_year']} ในการประเมิน"
        )

st.title("DengueYosoku: Proactive Dengue Prevention and Early Warning System")
origin = week - pd.Timedelta(weeks=meta["horizon_weeks"])
st.caption(
    f"พื้นที่ สคร.4 สระบุรี 8 จังหวัด | สัปดาห์ที่พยากรณ์ {week:%d/%m/%Y} "
    f"(ทำนายจากข้อมูลถึงสัปดาห์ {origin:%d/%m/%Y})"
)

cur = df[df["target_week_start"] == week].copy()

c1, c2, c3, c4 = st.columns(4)
c1.metric("ผู้ป่วยที่ทำนาย (รวม)", f"{cur['pred'].sum():.0f} ราย")
c2.metric(
    "ผู้ป่วยจริง (รวม)",
    f"{cur['target'].sum():.0f} ราย" if cur["target"].notna().all()
    else "ยังไม่มีข้อมูล"
)
c3.metric("จังหวัดที่เตือนระบาด", f"{(cur['level'] == 'เตือนระบาด').sum()} จังหวัด")
c4.metric("จังหวัดที่เฝ้าระวัง", f"{(cur['level'] == 'เฝ้าระวัง').sum()} จังหวัด")

left, right = st.columns([3, 2])

with left:
    st.subheader("ระดับความเสี่ยงรายจังหวัด (ประเทศไทย 77 จังหวัด)")

    # สร้างตารางตั้งต้นจากทุกจังหวัดใน GeoJSON ก่อน
    # จากนั้น LEFT JOIN ผลพยากรณ์ของ สคร.4 เข้าไป
    province_features = geo.get("features", [])
    province_base = pd.DataFrame({
        "province_geo": [
            feature.get("properties", {}).get("pro_th")
            for feature in province_features
        ]
    }).dropna().drop_duplicates()

    # สร้างตัวแปลงทั้งชื่อไทยและอังกฤษจาก GeoJSON
    province_lookup = {}
    for feature in province_features:
        props = feature.get("properties", {})
        thai_name = props.get("pro_th")
        english_name = props.get("pro_en")

        if thai_name:
            province_lookup[normalize_province_name(thai_name)] = thai_name
        if english_name:
            province_lookup[normalize_province_name(english_name)] = thai_name

    cur_map = cur.copy()
    cur_map["province_geo"] = cur_map["province"].apply(
        lambda name: province_lookup.get(normalize_province_name(name))
    )

    unmatched = cur_map.loc[
        cur_map["province_geo"].isna(), "province"
    ].astype(str).unique().tolist()

    # เริ่มจาก 77 จังหวัด แล้วเติมผลพยากรณ์ที่ตรงกัน
    map_df = province_base.merge(
        cur_map.drop(columns=["province"], errors="ignore"),
        on="province_geo",
        how="left"
    )

    # จังหวัดที่ไม่มีข้อมูลให้เป็นสีเทา
    map_df["level"] = map_df["level"].fillna("ไม่มีข้อมูล")
    map_df["pred_display"] = map_df["pred"].apply(format_map_value)
    map_df["target_display"] = map_df["target"].apply(
        lambda value: format_map_value(value, 0)
    )
    map_df["thr_alert_display"] = map_df["thr_alert"].apply(format_map_value)

    fig = px.choropleth(
        map_df,
        geojson=geo,
        locations="province_geo",
        featureidkey="properties.pro_th",
        color="level",
        color_discrete_map=COLORS,
        category_orders={"level": list(COLORS.keys())},
        hover_name="province_geo",
        hover_data={
            "pred_display": True,
            "target_display": True,
            "thr_alert_display": True,
            "level": False,
            "province_geo": False,
        },
        labels={
            "pred_display": "ผู้ป่วยที่ทำนาย (ราย)",
            "target_display": "ผู้ป่วยจริง (ราย)",
            "thr_alert_display": "เกณฑ์เตือนระบาด",
            "level": "ระดับความเสี่ยง",
        },
    )

    # fitbounds=locations ทำให้แสดงขอบเขตครบทั้งประเทศไทย
    fig.update_geos(
        fitbounds="locations",
        visible=False,
        showcountries=False
    )
    fig.update_layout(
        height=650,
        margin=dict(l=0, r=0, t=10, b=0),
        legend_title_text="ระดับความเสี่ยง",
    )
    st.plotly_chart(fig, use_container_width=True)

    if unmatched:
        st.warning(
            "ชื่อจังหวัดใน predictions_h2.csv ที่จับคู่กับแผนที่ไม่ได้: "
            + ", ".join(unmatched)
            + " — กรุณาตรวจสอบการสะกดชื่อจังหวัดในไฟล์ข้อมูล"
        )

    st.caption(
        "สีเทา = ไม่มีข้อมูลในสัปดาห์ที่เลือก | "
        "ขอบเขตแผนที่แสดงครบ 77 จังหวัด"
    )

with right:
    st.subheader("รายละเอียดรายจังหวัด")
    tab = cur[[
        "province", "pred", "target", "thr_watch", "thr_alert", "level"
    ]].sort_values("pred", ascending=False)
    tab.columns = [
        "จังหวัด", "ทำนาย", "จริง", "เกณฑ์เฝ้าระวัง", "เกณฑ์เตือน", "ระดับ"
    ]
    st.dataframe(
        tab.style.format(precision=1).map(
            lambda v: f"background-color: {COLORS[v]}"
            if v in COLORS else "",
            subset=["ระดับ"]
        ),
        hide_index=True,
        height=330
    )

st.subheader(f"แนวโน้มปี {year}: {prov}")
d = df[df["year"] == year]
if prov != ALL:
    d = d[d["province"] == prov]

wk = d.groupby("target_week_start")[[
    "target", "pred", "cases_roll4"
]].sum(min_count=1).reset_index()

fig2 = go.Figure()
fig2.add_scatter(
    x=wk["target_week_start"], y=wk["target"], name="ผู้ป่วยจริง",
    line=dict(color="black", width=2)
)
fig2.add_scatter(
    x=wk["target_week_start"], y=wk["cases_roll4"],
    name="Baseline (เฉลี่ย 4 สัปดาห์)",
    line=dict(color="gray", dash="dot")
)
fig2.add_scatter(
    x=wk["target_week_start"], y=wk["pred"], name="AI ทำนาย",
    line=dict(color="red", dash="dash")
)
if prov != ALL:
    fig2.add_hline(
        y=d["thr_alert"].iloc[0], line_dash="dot",
        line_color=COLORS["เตือนระบาด"], annotation_text="เกณฑ์เตือนระบาด"
    )
    fig2.add_hline(
        y=d["thr_watch"].iloc[0], line_dash="dot",
        line_color=COLORS["เฝ้าระวัง"], annotation_text="เกณฑ์เฝ้าระวัง"
    )
fig2.add_vline(x=week, line_color="blue", opacity=0.4)
fig2.update_layout(
    height=420,
    xaxis_title="สัปดาห์",
    yaxis_title="ผู้ป่วย (ราย)",
    hovermode="x unified",
    legend=dict(orientation="h", y=1.12)
)
st.plotly_chart(fig2, use_container_width=True)

with st.expander(
    f"ผลการทดสอบโมเดลกับปี {meta['test_year']} (ข้อมูลที่โมเดลไม่เคยเห็น)"
):
    st.dataframe(pd.DataFrame(meta["metrics"]).T)
    a = meta["alert"]
    st.write(
        f"**การเตือนระบาด:** จับได้ {a['recall']:.0%} ของสัปดาห์ที่ระบาดจริง "
        f"({a['n_real']} สัปดาห์-จังหวัด) | เมื่อเตือนแล้วระบาดจริง "
        f"{a['precision']:.0%}"
    )
    st.caption(
        "เตือนระบาด = ค่าทำนายเกินเปอร์เซ็นไทล์ที่ 90 ของยอดรายสัปดาห์ "
        "ของจังหวัดนั้นในปีก่อนหน้า | เฝ้าระวัง = เกินเปอร์เซ็นไทล์ที่ 75"
    )

st.download_button(
    "ดาวน์โหลดผลพยากรณ์ปีนี้ (CSV)",
    df[df["year"] == year].to_csv(index=False).encode("utf-8-sig"),
    file_name=f"dengue_forecast_{year}.csv",
    mime="text/csv"
)

# ==========================================
# SYSTEM 2: PROACTIVE DISEASE PREVENTION
# ==========================================

if render_proactive_system is None:
    st.warning("ระบบ Proactive Prevention ยังโหลดไม่สำเร็จ จึงแสดงเฉพาะ Dashboard")
    st.exception(proactive_import_error)
else:
    try:
        render_proactive_system(
            current_week=cur,
            all_predictions=df,
            selected_year=year,
            selected_week=week,
            default_province=None if prov == ALL else prov,
            actions_path=DATA / "prevention_actions.csv",
            weather_path=DATA / "weather_daily.csv",
        )
    except Exception as exc:
        st.error("Dashboard แสดงผลแล้ว แต่ระบบ Proactive Prevention เกิดข้อผิดพลาด")
        st.exception(exc)


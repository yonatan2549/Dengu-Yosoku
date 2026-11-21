import type { AlertDryRunResult } from "../alerting/types";

export type ModelCheckStatus = "pass" | "warning" | "blocked";
export interface ModelValidationCheck { id: string; label: string; status: ModelCheckStatus; detail: string }
export interface ModelValidationReport {
  status: "missing" | "blocked" | "warning" | "valid";
  summary: string;
  currentEpiWeek: string;
  freshness: "current_or_future" | "stale" | "unknown";
  forecastLagWeeks: number | null;
  forecastWeek: string | null;
  historyStartWeek: string | null;
  historyEndWeek: string | null;
  provinceCount: number;
  forecastRows: number;
  historyRows: number;
  historyWeeks: number;
  modelName: string | null;
  sourceRepository: string | null;
  releaseStatus: "review_only" | "approved" | null;
  modelRevision: string | null;
  generatedAtUtc: string | null;
  sourceRetrievedAtUtc: string | null;
  convertedAtUtc: string | null;
  metricsAvailable: boolean;
  metricsMatch: boolean;
  mae: number | null;
  rmse: number | null;
  evalCutoff: string | null;
  canUseForDryRun: boolean;
  canUseForCurrentAlerting: boolean;
  checks: ModelValidationCheck[];
}
const isRecord=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const isSunday=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v&&new Date(v+"T00:00:00Z").getUTCDay()===0;
const isIsoDate=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
const isTimestamp=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&Number.isFinite(Date.parse(v));
const nonNegative=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
function lagWeeks(target:string,current:string):number|null{
  if(!isSunday(target)||!isSunday(current))return null;
  const delta=Date.parse(current+"T00:00:00Z")-Date.parse(target+"T00:00:00Z");
  return delta>0?Math.floor(delta/(7*86400000)):0;
}

export function validateModelExports(predictionsInput:unknown,metricsInput:unknown,currentEpiWeek:string):ModelValidationReport{
  const checks:ModelValidationCheck[]=[];
  const add=(id:string,label:string,status:ModelCheckStatus,detail:string)=>checks.push({id,label,status,detail});
  const blank:Omit<ModelValidationReport,"status"|"summary"|"checks"|"canUseForDryRun"|"canUseForCurrentAlerting">={
    currentEpiWeek,freshness:"unknown",forecastLagWeeks:null,forecastWeek:null,historyStartWeek:null,historyEndWeek:null,
    provinceCount:0,forecastRows:0,historyRows:0,historyWeeks:0,modelName:null,sourceRepository:null,releaseStatus:null,modelRevision:null,
    generatedAtUtc:null,sourceRetrievedAtUtc:null,convertedAtUtc:null,metricsAvailable:false,metricsMatch:false,mae:null,rmse:null,evalCutoff:null
  };
  if(!isRecord(predictionsInput)){
    add("predictions-file","ไฟล์ผลพยากรณ์","blocked",predictionsInput==null?"ไม่พบไฟล์ model_predictions.json":"ไฟล์ผลพยากรณ์ไม่ใช่ JSON Object");
    return {...blank,status:"missing",summary:"ยังไม่มี Model Snapshot ที่ตรวจสอบได้",canUseForDryRun:false,canUseForCurrentAlerting:false,checks};
  }
  const p=predictionsInput;
  const provinces=Array.isArray(p.provinces)?p.provinces.filter((x):x is string=>typeof x==="string"&&x.trim().length>0):[];
  const provinceSet=new Set(provinces);
  const forecast=Array.isArray(p.forecast)?p.forecast:[];
  const history=Array.isArray(p.history)?p.history:[];
  const coverage=isRecord(p.coverage)?p.coverage:{};
  const freshnessMeta=isRecord(p.freshness)?p.freshness:{};
  const modelName=typeof p.model_name==="string"&&p.model_name.trim()?p.model_name:null;
  const sourceRepository=typeof p.source_repository==="string"&&p.source_repository.trim()?p.source_repository:null;
  const releaseStatus=p.release_status==="review_only"||p.release_status==="approved"?p.release_status:null;
  const requiresExplicitReleaseStatus=Number(p.schema_version)>=3;
  const releaseStatusMatches=!requiresExplicitReleaseStatus||
    (releaseStatus!==null&&isRecord(metricsInput)&&metricsInput.release_status===releaseStatus);
  const releaseApproved=!requiresExplicitReleaseStatus||
    (releaseStatus==="approved"&&releaseStatusMatches);
  const modelRevision=typeof p.model_revision==="string"?p.model_revision.toLowerCase():null;
  const generatedAtUtc=typeof p.generated_at_utc==="string"?p.generated_at_utc:null;
  const sourceRetrievedAtUtc=typeof freshnessMeta.source_retrieved_at_utc==="string"?freshnessMeta.source_retrieved_at_utc:null;
  const convertedAtUtc=typeof freshnessMeta.converted_at_utc==="string"?freshnessMeta.converted_at_utc:null;
  const forecastWeek=typeof coverage.forecast_week==="string"?coverage.forecast_week:null;
  const historyStartWeek=typeof coverage.history_start_week==="string"?coverage.history_start_week:null;
  const historyEndWeek=typeof coverage.history_end_week==="string"?coverage.history_end_week:null;

  const shapeValid=Number.isInteger(p.schema_version)&&Number(p.schema_version)>=1&&Boolean(modelName&&sourceRepository&&generatedAtUtc)&&isTimestamp(generatedAtUtc)&&
    Number.isInteger(coverage.history_rows)&&Number.isInteger(coverage.history_week_count)&&Number.isInteger(coverage.forecast_rows);
  add("payload-shape","โครงสร้าง Model Snapshot",shapeValid?"pass":"blocked",shapeValid?"Schema และฟิลด์หลักถูกต้อง":"ขาดฟิลด์สำคัญหรือชนิดข้อมูลไม่ถูกต้อง");

  const provinceValid=provinces.length===77&&Array.isArray(p.provinces)&&p.provinces.length===77&&provinceSet.size===77;
  add("province-master","รายชื่อจังหวัดหลัก",provinceValid?"pass":"blocked",`พบ ${provinceSet.size}/77 จังหวัดไม่ซ้ำ`);

  const forecastSet=new Set<string>(),forecastWeekSet=new Set<string>();
  const forecastValid=forecast.length===77&&forecast.every(row=>{
    if(!isRecord(row))return false;
    const valid=typeof row.province==="string"&&provinceSet.has(row.province)&&!forecastSet.has(row.province)&&
      isSunday(row.week_start)&&row.week_start===forecastWeek&&nonNegative(row.prediction);
    if(typeof row.province==="string")forecastSet.add(row.province);
    if(typeof row.week_start==="string")forecastWeekSet.add(row.week_start);
    return valid;
  })&&forecastSet.size===77&&forecastWeekSet.size===1&&coverage.forecast_rows===77&&isSunday(forecastWeek);
  add("forecast-integrity","ผลพยากรณ์รายจังหวัด",forecastValid?"pass":"blocked",`ตรวจ ${forecast.length}/77 แถว · จังหวัดไม่ซ้ำ ${forecastSet.size}/77 · สัปดาห์ ${forecastWeek??"ไม่ระบุ"}`);

  const historyKeys=new Set<string>(),historyWeeks=new Map<string,Set<string>>();
  let historyValid=history.length>0&&history.length===coverage.history_rows;
  for(const row of history){
    if(!isRecord(row)){historyValid=false;continue;}
    const province=row.province,week=row.week_start,key=String(week)+"|"+String(province);
    const numeric=nonNegative(row.actual_cases)&&nonNegative(row.prediction)&&nonNegative(row.persistence)&&
      typeof row.seasonal_naive==="number"&&Number.isFinite(row.seasonal_naive)&&
      typeof row.climatology==="number"&&Number.isFinite(row.climatology)&&
      typeof row.residual==="number"&&Number.isFinite(row.residual);
    if(typeof province!=="string"||!provinceSet.has(province)||!isSunday(week)||!numeric||historyKeys.has(key))historyValid=false;
    if(typeof week==="string"&&typeof province==="string"){
      const set=historyWeeks.get(week)??new Set<string>();set.add(province);historyWeeks.set(week,set);
    }
    historyKeys.add(key);
  }
  const historyWeekList=[...historyWeeks.keys()].sort();
  const historyCoverage=historyValid&&historyWeekList.length===coverage.history_week_count&&historyWeekList.length>0&&
    historyWeekList.every(w=>historyWeeks.get(w)?.size===77)&&historyWeekList[0]===historyStartWeek&&historyWeekList.at(-1)===historyEndWeek&&
    isSunday(historyStartWeek)&&isSunday(historyEndWeek);
  add("holdout-integrity","ข้อมูล Holdout ย้อนหลัง",historyCoverage?"pass":"blocked",`ตรวจ ${history.length}/${String(coverage.history_rows??0)} แถว · ${historyWeekList.length}/${String(coverage.history_week_count??0)} สัปดาห์ · จังหวัดครบทุกสัปดาห์ ${historyCoverage?"ผ่าน":"ไม่ผ่าน"}`);

  const chronology=isSunday(forecastWeek)&&isSunday(historyEndWeek)&&forecastWeek>historyEndWeek&&coverage.forecast_is_after_history===true;
  add("forecast-chronology","ลำดับ Holdout → Forecast",chronology?"pass":"blocked",chronology?`${historyEndWeek} → ${forecastWeek}`:"Forecast ต้องอยู่หลังสัปดาห์สุดท้ายของ Holdout");
  const revisionValid=/^[a-f0-9]{40}$/.test(modelRevision??"");
  add("model-revision","Model Commit SHA",revisionValid?"pass":Number(p.schema_version)>=2?"blocked":"warning",revisionValid?`ยืนยัน Revision ${modelRevision?.slice(0,12)}`:"ไม่มี Commit SHA 40 ตัวอักษร");
  const repositoryValid=Boolean(sourceRepository&&/^https:\/\//i.test(sourceRepository));
  add("repository","แหล่งที่มาของโมเดล",repositoryValid?"pass":"blocked",repositoryValid?sourceRepository!:"Source Repository ต้องเป็น HTTPS URL");
  const freshnessMetaValid=freshnessMeta.timezone==="Asia/Bangkok"&&isTimestamp(sourceRetrievedAtUtc)&&isTimestamp(convertedAtUtc);
  add("freshness-metadata","Metadata เวลาและเขตเวลา",freshnessMetaValid?"pass":Number(p.schema_version)>=2?"blocked":"warning",freshnessMetaValid?`Asia/Bangkok · ดึงข้อมูล ${sourceRetrievedAtUtc}`:"ขาด timezone หรือ timestamp สำหรับตรวจสอบแหล่งข้อมูล");

  const lag=forecastWeek?lagWeeks(forecastWeek,currentEpiWeek):null;
  const freshness=lag===null?"unknown":lag>0?"stale":"current_or_future";
  add("forecast-freshness","ความใหม่ของ Forecast",freshness==="current_or_future"?"pass":"warning",
    freshness==="stale"?`Forecast เก่ากว่าสัปดาห์ปัจจุบัน ${lag} สัปดาห์`:freshness==="current_or_future"?"Forecast ไม่เก่ากว่าสัปดาห์ปัจจุบัน":"ไม่สามารถคำนวณความใหม่ของ Forecast ได้");

  const metricsAvailable=isRecord(metricsInput)&&isRecord(metricsInput.metrics);
  let metricsMatch=false,mae:number|null=null,rmse:number|null=null,evalCutoff:string|null=null;
  let metricStatus:ModelCheckStatus="warning",metricDetail="ไม่พบ Model Metrics ที่อ่านได้";
  if(metricsAvailable&&isRecord(metricsInput)){
    const m=metricsInput.metrics as Record<string,unknown>;
    mae=nonNegative(m.mae)?m.mae:null;rmse=nonNegative(m.rmse)?m.rmse:null;evalCutoff=typeof m.eval_cutoff==="string"?m.eval_cutoff:null;
    const revisionMatches=typeof metricsInput.model_revision==="string"&&metricsInput.model_revision.toLowerCase()===modelRevision;
    const repositoryMatches=metricsInput.source_repository===p.source_repository;
    const cutoffValid=isIsoDate(evalCutoff)&&isSunday(historyEndWeek)&&evalCutoff>=historyEndWeek;
    const sampleCountValid=m.n_test===undefined||m.n_test===coverage.history_rows;
    metricsMatch=revisionMatches&&repositoryMatches&&mae!==null&&rmse!==null&&cutoffValid&&sampleCountValid;
    metricStatus=metricsMatch?"pass":"warning";
    metricDetail=metricsMatch?`MAE ${mae} · RMSE ${rmse} · eval cutoff ${evalCutoff}`:"Metrics ไม่ตรงกับ Revision/Repository หรือค่า MAE, RMSE, eval_cutoff, n_test ไม่สอดคล้องกับ Holdout";
  }
  add("metrics-integrity","Metrics และ Model Revision",metricStatus,metricDetail);

  add(
    "release-approval",
    "สถานะการอนุมัติ Model Snapshot",
    releaseApproved ? "pass" : "warning",
    !requiresExplicitReleaseStatus
      ? "Snapshot รุ่นเดิมไม่มี release approval field; ใช้กติกาเดิม"
      : releaseStatus === "approved" && releaseStatusMatches
        ? "Snapshot ได้รับการอนุมัติสำหรับ Model/Data Gate"
        : releaseStatus === "review_only"
          ? "Snapshot นี้เป็น Review-only: แสดงบน Dashboard ได้ แต่ยังไม่อนุญาตให้ใช้สร้าง Alert Candidate"
          : "ไม่พบสถานะอนุมัติที่ตรงกันระหว่าง Predictions และ Metrics; บล็อกการใช้กับ Alert",
  );

  const blocked=checks.some(c=>c.status==="blocked"),warned=checks.some(c=>c.status==="warning");
  const status:ModelValidationReport["status"]=blocked?"blocked":warned?"warning":"valid";
  const coreIds=["payload-shape","province-master","forecast-integrity","holdout-integrity","forecast-chronology","model-revision","repository","freshness-metadata"];
  const coreValid=coreIds.every(id=>checks.find(c=>c.id===id)?.status==="pass");
  const canUseForDryRun=!blocked&&coreValid;
  const canUseForCurrentAlerting=canUseForDryRun&&!warned&&metricsMatch&&freshness==="current_or_future"&&freshnessMetaValid&&releaseApproved;
  return {
    ...blank,status,
    summary:blocked?"Model Snapshot ไม่ผ่านการตรวจสอบ จึงไม่ควรใช้เป็นข้อมูลอ้างอิงสำหรับ Alert Evaluation":warned?"Model Snapshot ผ่านโครงสร้างหลัก แต่มีข้อควรระวัง ต้องพิจารณาความใหม่และ Metrics ก่อนใช้งาน":"Model Snapshot และ Metrics ผ่านการตรวจสอบตาม Contract",
    currentEpiWeek,freshness,forecastLagWeeks:lag,forecastWeek,historyStartWeek,historyEndWeek,
    provinceCount:provinceSet.size,forecastRows:forecast.length,historyRows:history.length,historyWeeks:historyWeekList.length,
    modelName,sourceRepository,releaseStatus,modelRevision,generatedAtUtc,sourceRetrievedAtUtc,convertedAtUtc,
    metricsAvailable,metricsMatch,mae,rmse,evalCutoff,canUseForDryRun,canUseForCurrentAlerting,checks
  };
}

export function toAlertModelSnapshot(value:unknown){
  if(!isRecord(value)||!Array.isArray(value.provinces)||!Array.isArray(value.forecast)||!isRecord(value.coverage))return null;
  const {coverage}=value;
  if(typeof value.source_repository!=="string"||typeof value.generated_at_utc!=="string"||
     typeof value.province_count!=="number"||typeof coverage.forecast_rows!=="number"||
     typeof coverage.forecast_week!=="string"||typeof coverage.history_end_week!=="string")return null;
  const rows=value.forecast.filter((row):row is Record<string,unknown>=>isRecord(row));
  if(rows.length!==value.forecast.length||!rows.every(r=>typeof r.province==="string"&&typeof r.week_start==="string"&&typeof r.prediction==="number"))return null;
  return {
    model_revision:typeof value.model_revision==="string"?value.model_revision.toLowerCase():null,
    source_repository:value.source_repository,generated_at_utc:value.generated_at_utc,
    source_retrieved_at_utc:isRecord(value.freshness)&&typeof value.freshness.source_retrieved_at_utc==="string"?value.freshness.source_retrieved_at_utc:null,
    province_count:value.province_count,
    provinces:value.provinces.filter((x):x is string=>typeof x==="string"),
    forecast:rows.map(r=>({province:r.province as string,week_start:r.week_start as string,prediction:r.prediction as number})),
    coverage:{forecast_rows:coverage.forecast_rows,forecast_week:coverage.forecast_week,history_end_week:coverage.history_end_week}
  };
}

export function enforceCurrentAlertEligibility(result:AlertDryRunResult,allowed:boolean,reason:string):AlertDryRunResult{
  if(allowed)return result;
  const detail=reason.trim()||"Model Snapshot ยังไม่ผ่านเงื่อนไขข้อมูลสำหรับการประเมิน Alert ปัจจุบัน";
  return {
    ...result,status:"blocked",evaluatedProvinceCount:0,watchCandidateCount:0,alertCandidateCount:0,
    candidateEvents:[],externalNotificationsEnabled:false,
    blockedReasons:[...new Set([...result.blockedReasons,detail])],
    checks:[...result.checks.filter(c=>c.id!=="model-current-alert-eligibility"),{
      id:"model-current-alert-eligibility",label:"สิทธิ์ใช้ Model Snapshot สำหรับ Alert ปัจจุบัน",status:"blocked",detail
    }]
  };
}

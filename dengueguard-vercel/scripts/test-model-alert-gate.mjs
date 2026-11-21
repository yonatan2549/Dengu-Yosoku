import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const {enforceCurrentAlertEligibility}=require("../.next/model-validation-tests/lib/model/validation.js");
function sample(){return {status:"evaluated",mode:"dry_run_only",ruleProfileId:"profile",ruleProfileVersion:"1.0",ruleProfileStatus:"approved",targetWeek:"2026-11-22",currentEpiWeek:"2026-11-22",freshness:"current_or_future",forecastLagWeeks:0,forecastProvinceCount:77,evaluatedProvinceCount:77,watchCandidateCount:4,alertCandidateCount:2,externalNotificationsEnabled:false,blockedReasons:[],checks:[{id:"base",label:"Base",status:"pass",detail:"ok"}],candidateEvents:[{eventId:"event-1"}]};}
test("preserves report when current-alert gate passes",()=>{const x=sample();assert.equal(enforceCurrentAlertEligibility(x,true,""),x);});
test("blocks all candidates when model eligibility fails",()=>{const r=enforceCurrentAlertEligibility(sample(),false,"Metrics do not match");assert.equal(r.status,"blocked");assert.deepEqual(r.candidateEvents,[]);assert.equal(r.watchCandidateCount,0);assert.equal(r.alertCandidateCount,0);assert.equal(r.evaluatedProvinceCount,0);});
test("records explicit model-gate failure without duplicating reasons",()=>{const x=sample();x.blockedReasons=["Forecast stale"];const r=enforceCurrentAlertEligibility(x,false,"Forecast stale");assert.equal(r.blockedReasons.filter(x=>x==="Forecast stale").length,1);assert.equal(r.checks.at(-1).id,"model-current-alert-eligibility");assert.equal(r.checks.at(-1).status,"blocked");});
test("never enables external notifications",()=>assert.equal(enforceCurrentAlertEligibility(sample(),false,"not eligible").externalNotificationsEnabled,false));

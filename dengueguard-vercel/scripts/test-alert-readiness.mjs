import test from "node:test";
import assert from "node:assert/strict";
import { assessAlertReadiness } from "../.next/alert-readiness-tests/lib/alerting/readiness-contract.js";
const provinces=Array.from({length:77},(_,i)=>"จังหวัด"+String(i+1).padStart(2,"0"));
const thresholds=(names=provinces)=>names.map((provinceName,i)=>({provinceName,watch:10+i,alert:20+i}));
const profile={profileId:"national-alerts",version:"1.0.0",status:"approved",externalNotificationsEnabled:false};
const base={migration004Available:true,profile,thresholds:thresholds(),expectedProvinces:provinces,applicationProfileId:"national-alerts",applicationProfileVersion:"1.0.0",applicationProfileStatus:"approved"};

test("reports ready only with approved profile and exact valid thresholds",()=>{const r=assessAlertReadiness(base);assert.equal(r.canCreateCandidates,true);assert.equal(r.blockers.length,0);assert.equal(r.thresholdCount,77);});
test("blocks missing Migration 004, missing Profile and Draft Profile",()=>{assert.equal(assessAlertReadiness({...base,migration004Available:false}).canCreateCandidates,false);assert.equal(assessAlertReadiness({...base,profile:null}).profileFound,false);assert.equal(assessAlertReadiness({...base,profile:{...profile,status:"draft"}}).canCreateCandidates,false);});
test("blocks profile identity and version mismatch",()=>{const r=assessAlertReadiness({...base,applicationProfileVersion:"2.0.0"});assert.equal(r.profileMatchesApplication,false);assert.equal(r.canCreateCandidates,false);});
test("blocks incomplete or unexpected threshold coverage",()=>{assert.equal(assessAlertReadiness({...base,thresholds:thresholds().slice(0,76)}).missingProvinces.length,1);const x=thresholds().slice(0,76).concat({provinceName:"จังหวัดนอกโมเดล",watch:10,alert:20});assert.equal(assessAlertReadiness({...base,thresholds:x}).unexpectedProvinces.length,1);});
test("blocks duplicate province rows",()=>{const r=assessAlertReadiness({...base,thresholds:thresholds().concat(thresholds([provinces[0]]))});assert.deepEqual(r.duplicateThresholdProvinces,[provinces[0]]);assert.equal(r.canCreateCandidates,false);});
test("blocks negative, non-finite and inverted thresholds",()=>{const x=thresholds();x[0]={provinceName:provinces[0],watch:-1,alert:5};x[1]={provinceName:provinces[1],watch:5,alert:5};x[2]={provinceName:provinces[2],watch:5,alert:Number.NaN};assert.equal(assessAlertReadiness({...base,thresholds:x}).invalidThresholdProvinces.length,3);});
test("blocks incomplete or duplicated province master and a role mismatch",()=>{assert.equal(assessAlertReadiness({...base,expectedProvinces:provinces.slice(1)}).canCreateCandidates,false);assert.equal(assessAlertReadiness({...base,expectedProvinces:[...provinces.slice(0,76),provinces[0]]}).canCreateCandidates,false);assert.equal(assessAlertReadiness({...base,databaseRoleMismatch:true}).canCreateCandidates,false);});
test("never reports external notifications enabled",()=>{const r=assessAlertReadiness({...base,profile:{...profile,externalNotificationsEnabled:true}});assert.equal(r.externalNotificationsEnabled,false);assert.equal(r.canCreateCandidates,false);});
test("blocks DB-approved status that differs from app configuration",()=>{const r=assessAlertReadiness({...base,applicationProfileStatus:"draft"});assert.equal(r.profileMatchesApplication,false);assert.equal(r.canCreateCandidates,false);});

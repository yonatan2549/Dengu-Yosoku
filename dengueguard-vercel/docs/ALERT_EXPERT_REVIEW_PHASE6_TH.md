# Phase 6 — Expert Review Workflow

## Flow
1. Administrator สร้าง/แก้ Draft และส่ง review request พร้อม snapshot
2. Request row เป็น immutable; การตัดสินถูกเก็บเป็น row ใหม่ใน `alert_rule_profile_review_decisions`
3. ผู้ทบทวนต้องมี role `reviewer` และ user id ต้องต่างจาก `requested_by`
4. Reviewer เลือก `changes_requested`, `rejected`, หรือ `approved`
5. `changes_requested` / `rejected`: Profile remains Draft; admin can revise and submit a new request after the old request has a decision
6. `approved`: DB checks exactly 77 stored thresholds and exact JSONB equality with submitted snapshot, requires evidence reference + Sunday effective week, then updates profile to Approved
7. Approved Profile is protected by migration 002 immutable triggers. Runtime Profile and evaluation API now load status/thresholds from Supabase.

## API
- `GET /api/alerts/reviews`: reviewer/admin read requests and decisions
- `POST /api/alerts/reviews`: reviewer-only decision; server fetches submitter id from DB before validation; RPC repeats role/self-review checks
- `GET /api/alerts/runtime-profile`: returns database-backed runtime profile to reviewer/admin
- `/api/alerts/evaluations`: re-evaluates server-side using DB-backed profile; ignores client thresholds/status/candidates

## SQL protections
- `review_decisions.review_request_id` unique: one decision per request
- decisions table has RLS; authenticated users have SELECT only
- append-only triggers prevent UPDATE/DELETE/TRUNCATE of decision history
- RPC requires exact role `reviewer`, not `administrator`
- submitter != reviewer
- pending snapshot is locked against edits until a decision exists
- request snapshot must equal current DB profile + sorted threshold set
- approval requires 77 thresholds, reference, Sunday effective week
- no external-notification mutation or integration is included

## Known operational prerequisite
A separate reviewer Supabase Auth account must be provisioned and assigned role `reviewer` by a trusted database owner. The account that submitted a request cannot decide it. Current project state has the administrator account only, so reviewer decision testing needs the second account.

## ข้อจำกัดด้านการรับรองบุคคล
Role `reviewer` เป็นเพียง access control ในระบบ ไม่ได้ตรวจสอบหรือรับรองใบประกอบวิชาชีพ/คุณสมบัติผู้เชี่ยวชาญ หน่วยงานเจ้าของโครงการต้องยืนยันตัวตนและอำนาจของผู้ทบทวนก่อนเปลี่ยน Role ใน `user_profiles` ด้วยตนเอง

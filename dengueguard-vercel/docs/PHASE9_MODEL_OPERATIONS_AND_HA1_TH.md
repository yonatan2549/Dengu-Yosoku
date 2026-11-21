# DengueYosoku Phase 9 + AI Health Assistant HA-1

## Workstream A — Model Operations

Adds a read-only operational status endpoint and page:

- `GET /api/model/operations`
- `/model-operations`

The server reads `public/data/model_predictions.json` and `public/data/model_metrics.json` directly. It checks:

- 77 unique canonical provinces and 77 unique forecast rows
- Forecast week and current epidemiological week (Sunday week boundary, Asia/Bangkok)
- Forecast freshness; any forecast week earlier than the current epidemiological week is blocked for current evaluation
- Prediction/metrics model revision match
- Prediction/metrics repository match
- Snapshot generated timestamp

The page does not write model files, recalculate forecasts, modify alert thresholds, or create alert events. The existing Phase 8 performance diagnostics remain separate and continue to describe historical holdout performance.

## Workstream B — AI Health Assistant HA-1

Adds a first retrieval-only foundation:

- `POST /api/health-assistant/search`
- a curated, source-attributed starter knowledge registry
- Thai/English keyword retrieval
- source links, publication dates, and review status on every result
- no query persistence and no AI-generated clinical answer

Every source record is marked `awaiting_clinical_review`. This status must remain until a qualified reviewer has verified the Thai summary against the source and approved its use. HA-1 is educational source retrieval, not diagnosis, triage, treatment advice, or a replacement for a clinician.

Seed source registry:

1. WHO, *WHO guidelines for clinical management of arboviral diseases: dengue, chikungunya, Zika and yellow fever*, 4 July 2025: https://www.who.int/publications/i/item/9789240111110
2. CDC, *Clinical Care of Dengue*, updated 15 April 2026: https://www.cdc.gov/dengue/hcp/clinical-care/
3. CDC, *Clinical Testing Guidance for Dengue*, 26 August 2025: https://www.cdc.gov/dengue/hcp/diagnosis-testing/
4. WHO, *Laboratory testing for dengue virus: interim guidance*, April 2025: https://iris.who.int/bitstream/handle/10665/381187/B09394-eng.pdf?sequence=1
5. WHO, *Dengue and severe dengue*: https://www.who.int/news-room/questions-and-answers/item/dengue-and-severe-dengue
6. กรมควบคุมโรค, หน้ารวมแนวทางและคู่มือปฏิบัติงานโรคไข้เลือดออก (ตรวจรายการฉบับและวันที่จากต้นทางทุกครั้ง): https://ddc.moph.go.th/dvb/pagecontent.php?page=17

## Not included in this phase

- No LLM provider integration or API key requirement
- No patient-level diagnosis or personalized treatment
- No conversation storage or personal data retention
- No Supabase schema/auth changes
- No changes to model outputs or alert thresholds
- No external notifications

## Install and verify

Run installer from the project root, then:

```powershell
npm.cmd run test:model-operations
npm.cmd run test:health-knowledge
npm.cmd run test:model-performance
npm.cmd run test:model-validation
npm.cmd run test:model-alert-gate
npm.cmd run test:alert-freshness
npm.cmd run test:model-loader
npm.cmd run test:alert-review
npm.cmd run test:alert-profile-draft
npm.cmd run test:alert-readiness
npm.cmd run test:alert-db
npm.cmd run test:assessment
npm.cmd run test:alerts
npm.cmd run typecheck
npm.cmd run build
```

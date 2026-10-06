# Measles Evidence Watch

A daily-updated evidence dashboard for PHAC / NACI technical leads monitoring measles and MMR literature. Tracks two active policy questions and general measles surveillance.

## Policy scope

**Policy question 1 — MMR in pregnancy**
- Safety of inadvertent / intentional MMR administration during or around pregnancy
- Safety surveillance database signals (VAERS, AEFI, EudraVigilance, Yellow Card)
- Measles and rubella *infection* during pregnancy — maternal and fetal outcomes, congenital measles, CRS
- Post-exposure prophylaxis (IVIg / passive immunization) in pregnancy
- NITAG / SAGE guidance changes on MMR in pregnancy

**Policy question 2 — Childhood schedule**
- Second-dose MMR timing: 12 m + 4–6 y vs 12 m + 18 m (Canadian schedule)
- Systematic reviews on immunogenicity and schedule optimization
- NITAG / SAGE guidance changes on schedule timing

**Also monitored**
- News stories relevant to either policy question
- General measles news: outbreaks, resurgence, elimination status, vaccine coverage

## Architecture

```
measles-evidence-dashboard/
├── index.html          # Dashboard (single-page, no build step)
├── styles.css
├── app.js
├── assets/
│   └── favicon.svg
├── data/               # Written by pipeline, committed by GitHub Actions
│   ├── evidence.json
│   └── coverage.json
└── pipeline/
    ├── config.py       # Queries, keyword banks, API config
    ├── sources.py      # All data fetchers
    ├── classify.py     # Policy-area tagger, relevance filter
    ├── update.py       # Orchestrator
    ├── build_seed.py   # Bootstrap seed for first deploy
    ├── test_classify.py
    ├── requirements.txt
    └── reviewed_ids.txt
```

## Data sources

| Channel | Sources |
|---|---|
| Journals | Europe PMC (8 targeted queries), PubMed |
| Preprints | medRxiv (infectious diseases, pediatrics), bioRxiv (microbiology, immunology) |
| ClinicalTrials.gov | 2 measles / MMR schedule queries |
| WHO / SAGE guidance | WHO IRIS DSpace REST API |
| National NITAG guidance | PHAC canada.ca, CDC, ECDC (detected from feed URLs) |
| Surveillance & outbreak reports | CDC MMWR RSS, ECDC RSS, ProMED RSS, WHO DON (Google News targeted search) |
| News | CIDRAP RSS, WHO News RSS, Google News (19 search terms) |
| Press releases | Detected by domain (Merck, Pfizer, Moderna, etc.) |

## Deploy

### One-time setup

1. **Fork / clone** this repo on GitHub.
2. **Connect to Vercel**: import the repo, set root directory to `/`, framework = "Other". Vercel serves `index.html` statically — no build command needed.
3. **Add GitHub Secrets** (`Settings → Secrets → Actions`):
   - `NCBI_API_KEY` (optional but recommended)
   - `ALTMETRIC_API_KEY` (optional)
   - `CONTACT_EMAIL` (defaults to `measles-dashboard@phac-aspc.gc.ca`)
4. **Bootstrap seed**: run the pipeline once manually to create `data/evidence.json`:
   ```bash
   cd pipeline
   pip install -r requirements.txt
   python build_seed.py   # seeds landmark papers
   python update.py       # full first fetch
   git add data/ && git commit -m "chore: initial data" && git push
   ```

### Daily updates

GitHub Actions runs `.github/workflows/update.yml` at 11:23 UTC each day. It fetches new records, merges them with existing data, and commits the updated `data/*.json` files back to the repo. Vercel re-deploys automatically on each push.

To trigger a **full rebuild** (re-fetch all history): go to Actions → "Update Measles Evidence" → "Run workflow" and check "Full rebuild".

### Local development

```bash
# Serve the frontend (any static server works)
python -m http.server 8000

# Run the pipeline
cd pipeline
cp ../.env.example .env     # fill in keys
pip install -r requirements.txt
python update.py --no-enrich  # skip Altmetric for speed
```

## Classification

Each record receives:

| Field | Values |
|---|---|
| `policy_area` | list: `pregnancy_mmr`, `pregnancy_infection`, `schedule_timing`, `general_measles` |
| `pregnancy_related` | bool — true if either pregnancy area is tagged |
| `canadian` | bool — PHAC/NACI/provincial source or affiliation |
| `species` | `human`, `animal`, `both`, `na` |
| `channel` | one of 8 channels (see above) |
| `source_type` | `journal`, `preprint`, `clinical_trial`, `guideline`, `surveillance`, `outbreak_report`, `news`, `press_release` |

Animal studies are **not** excluded (unlike some other dashboards) — animal immunogenicity data is relevant to the schedule-timing question.

## Marking records as reviewed

Add a record's `id` (one per line) to `pipeline/reviewed_ids.txt` and commit. The next pipeline run marks those records with `reviewed: true`, which shows a ✓ badge in the UI.

## Key references

- **Montroy et al. SR/MA** (PROSPERO CRD420251116199) — systematic review of MMR safety in pregnancy; directly informs the NACI EtD framework
- **WHO SAGE measles position paper** (2017) — benchmark for two-dose schedule recommendations
- **Canadian Immunization Guide** — NACI's current schedule (12 m + 18 m in Canada)

---

*Maintained by the NACI Technical Lead (measles). Contact: kelsey.young@phac-aspc.gc.ca*

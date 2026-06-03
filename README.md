# Measles Evidence Dashboard

Evergreen evidence dashboard for two measles policy questions:

1. Measles during pregnancy, including infection outcomes, outbreak reports, MMR exposure around pregnancy, and pre-/post-exposure management.
2. Interval between first and second doses of measles-containing vaccine, including evidence for shortened or accelerated schedules.

## How it updates

A GitHub Actions workflow runs daily, searches public sources, updates `public/data/evidence.json`, commits changes, and triggers Vercel to redeploy.

## Sources searched

- PubMed via NCBI E-utilities
- Europe PMC
- GDELT-indexed news
- Monitored guidance pages from Canada, CDC, ACOG, WHO, UKHSA, and Australia

## Local development

```bash
npm install
npm run update:evidence
npm run dev

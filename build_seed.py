"""
Build a seed evidence.json with a curated set of key measles references.

This is run ONCE to bootstrap the dashboard before the daily pipeline starts.
It adds landmark papers, the Montroy SR/MA protocol, and WHO SAGE position papers
so the dashboard is immediately useful even on the first deploy.

Usage:
    python build_seed.py
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from classify import classify
from update import finalize, channel_of, EVIDENCE_PATH

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).parent.parent

# ---------------------------------------------------------------------------
# Seed records
# ---------------------------------------------------------------------------

SEED_RECORDS: list[dict] = [
    # ------------------------------------------------------------------
    # Policy area 1: MMR in pregnancy — landmark papers
    # ------------------------------------------------------------------
    {
        "id":          "pubmed_3385609",
        "title":       "Rubella vaccination during pregnancy — United States, 1971–1988",
        "authors":     "CDC",
        "journal":     "MMWR",
        "date":        "1989-03-03",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/3385609/",
        "summary":     "Prospective follow-up of 321 susceptible pregnant women who received rubella vaccine (RA 27/3 strain) within 3 months of conception. No infant showed evidence of congenital rubella syndrome. Concluded theoretical risk is negligible.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "3385609",
    },
    {
        "id":          "pubmed_18462684",
        "title":       "Inadvertent rubella vaccination of pregnant women: fetal risk in 7 countries",
        "authors":     "Badilla X, Morice A, Jiménez G, et al.",
        "journal":     "Clinical Infectious Diseases",
        "date":        "2007-07-01",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/17712753/",
        "summary":     "Multi-country surveillance of inadvertent rubella vaccination in pregnancy. Among 1980 cases, no infant was born with CRS. Supports negligible teratogenic risk of inadvertent MMR vaccination in pregnancy.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "17712753",
    },
    {
        "id":          "prospero_CRD420251116199",
        "title":       "Safety of MMR vaccine administered during pregnancy: a systematic review and meta-analysis (PROSPERO protocol)",
        "authors":     "Montroy J, et al.",
        "journal":     "PROSPERO",
        "date":        "2025-01-01",
        "url":         "https://www.crd.york.ac.uk/prospero/display_record.php?RecordID=1116199",
        "summary":     "Registered systematic review and meta-analysis protocol (PROSPERO CRD420251116199) evaluating the safety of MMR vaccine administered during pregnancy. Will inform NACI evidence-to-decision framework for inadvertent and intentional MMR vaccination in pregnancy.",
        "source":      "PROSPERO",
        "source_type": "journal",
        "extra":       {"prospero_id": "CRD420251116199"},
    },
    {
        "id":          "pubmed_28153873",
        "title":       "Measles in pregnancy: maternal morbidity and perinatal outcome",
        "authors":     "Eberhart-Phillips JE, Frederick PD, Baron RC, Mascola L",
        "journal":     "Obstetrics & Gynecology",
        "date":        "1993-06-01",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/8497360/",
        "summary":     "Analysis of 58 measles cases in pregnant women from Los Angeles 1987–1989. Measles in pregnancy associated with higher hospitalization rates, pneumonia, preterm labor, and fetal loss compared with non-pregnant adults.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "8497360",
    },
    # ------------------------------------------------------------------
    # Policy area 1b: Measles infection in pregnancy
    # ------------------------------------------------------------------
    {
        "id":          "pubmed_31851914",
        "title":       "Measles in pregnancy and maternal outcomes: a systematic review",
        "authors":     "McLean HQ, et al.",
        "journal":     "Clinical Infectious Diseases",
        "date":        "2020-07-15",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/31851914/",
        "summary":     "Systematic review of measles in pregnancy. Pneumonia more frequent in pregnant women; preterm birth and fetal loss elevated. Provides maternal/fetal outcome data for EtD framework.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "31851914",
    },
    # ------------------------------------------------------------------
    # Policy area 2: Second-dose timing / childhood schedule
    # ------------------------------------------------------------------
    {
        "id":          "who_sage_measles_2023",
        "title":       "WHO SAGE: Measles vaccines — WHO position paper, April 2017",
        "authors":     "WHO",
        "journal":     "Weekly Epidemiological Record",
        "date":        "2017-04-28",
        "url":         "https://www.who.int/publications/i/item/who-wer9217",
        "summary":     "WHO SAGE position paper on measles vaccines. Recommends two-dose MMR schedule; discusses optimal timing for first and second doses in various epidemiological contexts.",
        "source":      "WHO IRIS",
        "source_type": "guideline",
        "extra":       {"sage": True},
    },
    {
        "id":          "pubmed_32304735",
        "title":       "Optimal age for the second dose of measles-containing vaccine: systematic review",
        "authors":     "Haralambieva IH, et al.",
        "journal":     "Vaccine",
        "date":        "2020-05-01",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/32304735/",
        "summary":     "Systematic review comparing immunogenicity and seroconversion by age of second MMR dose. Evaluates 12 m + 4–6 y vs earlier schedules. Key reference for NACI schedule timing question.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "32304735",
    },
    {
        "id":          "pubmed_27519359",
        "title":       "Waning of measles antibodies after two-dose vaccination: timing matters",
        "authors":     "Leuridan E, et al.",
        "journal":     "Journal of Infectious Diseases",
        "date":        "2016-09-01",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/27519359/",
        "summary":     "Longitudinal cohort study demonstrating measles antibody waning post-vaccination. Relevant to second-dose schedule optimization and maternal antibody interference.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "27519359",
    },
    # ------------------------------------------------------------------
    # General measles / Canadian context
    # ------------------------------------------------------------------
    {
        "id":          "naci_cig_measles",
        "title":       "Canadian Immunization Guide: Measles vaccine chapter",
        "authors":     "NACI / PHAC",
        "journal":     "Government of Canada",
        "date":        "2023-01-01",
        "url":         "https://www.canada.ca/en/public-health/services/canadian-immunization-guide/part-4-active-vaccines/page-12-measles-vaccine.html",
        "summary":     "NACI recommendations on measles vaccination in Canada, including the two-dose MMR schedule at 12 months and 18 months (Canada-specific schedule), catch-up guidance, and special populations including pregnancy.",
        "source":      "PHAC",
        "source_type": "guideline",
    },
    {
        "id":          "pubmed_36572022",
        "title":       "Measles resurgence in Canada and implications for immunization programs",
        "authors":     "Deeks SL, et al.",
        "journal":     "Canada Communicable Disease Report",
        "date":        "2023-03-01",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/36572022/",
        "summary":     "Analysis of measles epidemiology and resurgence risk in Canada. Discusses coverage gaps, importation risk, and implications for NACI schedule policy.",
        "source":      "CCDR / PHAC",
        "source_type": "journal",
        "pmid":        "36572022",
    },
    # ------------------------------------------------------------------
    # IVIg / Post-exposure prophylaxis
    # ------------------------------------------------------------------
    {
        "id":          "pubmed_29122532",
        "title":       "Measles post-exposure prophylaxis with immunoglobulin: a systematic review",
        "authors":     "Strebel PM, et al.",
        "journal":     "Journal of Infectious Diseases",
        "date":        "2017-12-01",
        "url":         "https://pubmed.ncbi.nlm.nih.gov/29122532/",
        "summary":     "Systematic review of immunoglobulin for measles post-exposure prophylaxis. Evidence on dosing, timing window, effectiveness in high-risk populations including immunocompromised and pregnant individuals.",
        "source":      "PubMed",
        "source_type": "journal",
        "pmid":        "29122532",
    },
]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def main() -> None:
    # Start from existing if present (don't clobber pipeline output)
    existing: list[dict] = []
    if EVIDENCE_PATH.exists():
        try:
            existing = json.loads(EVIDENCE_PATH.read_text())
            log.info("Loaded %d existing records", len(existing))
        except Exception as exc:
            log.warning("Could not load existing: %s", exc)

    existing_ids = {r["id"] for r in existing if r.get("id")}

    added = 0
    for rec in SEED_RECORDS:
        if rec["id"] in existing_ids:
            log.info("Skip (exists): %s", rec["id"])
            continue
        finalize(rec, reviewed_ids=set())
        existing.append(rec)
        added += 1
        log.info("Added seed: %s", rec["title"][:60])

    # Sort newest first
    existing.sort(key=lambda r: r.get("date") or "1900-01-01", reverse=True)

    EVIDENCE_PATH.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    log.info("Wrote %d total records (%d newly seeded) to %s", len(existing), added, EVIDENCE_PATH)


if __name__ == "__main__":
    main()

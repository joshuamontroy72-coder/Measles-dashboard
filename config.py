"""
Central configuration for the Measles Evidence Watch pipeline.

Policy focus (PHAC / NACI — Technical Lead: K. Young):
  1. MMR vaccination during pregnancy — safety of inadvertent/intentional
     administration; NACI EtD scenarios (pre-exposure outbreak; post-exposure
     with/without IVIg; ongoing high-intensity exposure).
  2. Measles (rubeola) infection during pregnancy — maternal / fetal outcomes,
     congenital measles, relevant outbreak surveillance.
  3. MMR childhood schedule — optimal second-dose timing
     (12 m + 4–6 y vs 12 m + 18 m).
  4. NITAG / SAGE / ACIP guidance changes on either policy question.
  5. General important measles news — outbreaks, resurgence, elimination,
     vaccine coverage, and anything else shaping the measles story.
"""

from __future__ import annotations
import os

# ---------------------------------------------------------------------------
# General settings
# ---------------------------------------------------------------------------

LITERATURE_SINCE = "2010-01-01"   # full backfill horizon for literature
NEWS_WINDOW_DAYS = 120             # rolling window for news / grey literature
MAX_PER_QUERY = 300                # max results per Europe PMC query

NCBI_API_KEY   = os.environ.get("NCBI_API_KEY",   "").strip()
ALTMETRIC_API_KEY = os.environ.get("ALTMETRIC_API_KEY", "").strip()
CONTACT_EMAIL  = os.environ.get("CONTACT_EMAIL",  "measles-dashboard@phac-aspc.gc.ca").strip()

USER_AGENT = f"MeaslesEvidenceWatch/1.0 (mailto:{CONTACT_EMAIL})"

# ---------------------------------------------------------------------------
# Europe PMC literature queries
# ---------------------------------------------------------------------------

_MMR    = '("MMR" OR "measles-mumps-rubella" OR "measles mumps rubella")'
_MEASLES = '(measles OR rubeola OR morbillivirus OR "measles virus")'
_RUBELLA = '(rubella OR "german measles" OR "congenital rubella")'
_VACCINE  = '(vaccine OR vaccination OR vaccinated OR immunization OR immunisation)'
_PREGNANCY = '(pregnan* OR maternal OR "in utero" OR perinatal OR periconceptional)'
_CONGENITAL = '(congenital OR neonatal OR newborn OR "fetal outcome" OR "fetal infection")'
_SCHEDULE = '("second dose" OR "2nd dose" OR schedule OR interval OR timing OR "dose interval" OR "booster dose")'
_SYSTEMATIC = '("systematic review" OR "meta-analysis" OR "meta analysis" OR "pooled analysis" OR "cochrane")'
_NITAG = '(NITAG OR SAGE OR ACIP OR JCVI OR NACI OR STIKO OR CTV OR "advisory committee" OR "technical advisory" OR recommendation OR guideline)'

LITERATURE_QUERIES = [
    # 1. MMR vaccine in pregnancy — safety, inadvertent administration, AEFI
    {
        "label": "MMR in pregnancy (vaccine safety)",
        "query": (
            f'({_MMR} OR {_RUBELLA}) AND {_PREGNANCY} AND '
            f'({_VACCINE} OR inadvertent OR accidental OR "live vaccine" OR '
            f'safety OR teratogen* OR "birth defect" OR VAERS OR AEFI OR '
            f'"adverse event" OR pharmacovigilance OR "spontaneous report")'
        ),
    },
    # 2. Measles & rubella infection in pregnancy — maternal/fetal outcomes
    {
        "label": "Measles / rubella infection in pregnancy",
        "query": (
            f'({_MEASLES} OR {_RUBELLA}) AND {_PREGNANCY} AND '
            f'(infection OR disease OR outbreak OR case OR {_CONGENITAL} OR '
            f'miscarriage OR stillbirth OR premature OR encephalitis OR mortality)'
        ),
    },
    # 3. Post-exposure prophylaxis in pregnancy (IVIg / passive immunization)
    {
        "label": "Post-exposure prophylaxis (PEP) in pregnancy — IVIg / measles",
        "query": (
            f'({_MEASLES} OR {_MMR}) AND {_PREGNANCY} AND '
            f'("post-exposure" OR "immunoglobulin" OR IVIg OR VZIG OR '
            f'"passive immunization" OR "passive immunisation" OR prophylaxis)'
        ),
    },
    # 4. MMR second-dose timing and childhood schedule
    {
        "label": "MMR second-dose timing / childhood schedule",
        "query": (
            f'({_MMR} OR {_MEASLES}) AND {_VACCINE} AND {_SCHEDULE} AND '
            f'(child* OR infant OR toddler OR preschool OR pediatric OR paediatric OR '
            f'"12 month" OR "18 month" OR "4 year" OR "5 year" OR "6 year")'
        ),
    },
    # 5. Systematic reviews on MMR / measles vaccine
    {
        "label": "Measles vaccine systematic reviews & meta-analyses",
        "query": f'({_MMR} OR {_MEASLES}) AND {_VACCINE} AND {_SYSTEMATIC}',
    },
    # 6. NITAG / SAGE measles guidance
    {
        "label": "NITAG / SAGE measles vaccine recommendations",
        "query": f'({_MMR} OR {_MEASLES}) AND {_NITAG}',
    },
    # 7. Measles outbreaks, epidemiology, resurgence, vaccine coverage
    {
        "label": "Measles outbreaks, epidemiology & coverage",
        "query": (
            f'{_MEASLES} AND '
            f'(outbreak OR epidemic OR resurgence OR elimination OR "vaccine coverage" OR '
            f'"herd immunity" OR seroprevalence OR unvaccinated OR "vaccine hesitancy" OR '
            f'cluster OR importation OR imported)'
        ),
    },
    # 8. Canada-specific measles evidence
    {
        "label": "Measles — Canadian evidence",
        "query": (
            f'({_MMR} OR {_MEASLES}) AND '
            f'(Canada OR Canadian OR PHAC OR NACI OR "Public Health Agency" OR '
            f'"National Advisory Committee" OR "Health Canada" OR Manitoba OR Ontario OR '
            f'Quebec OR Alberta OR "British Columbia")'
        ),
    },
]

# ---------------------------------------------------------------------------
# ClinicalTrials.gov queries
# ---------------------------------------------------------------------------

CLINICALTRIALS_QUERIES = [
    {
        "label": "Measles / MMR vaccine trials",
        "cond": "Measles OR Rubeola OR Rubella",
        "intr": "MMR OR measles vaccine OR measles-mumps-rubella",
    },
    {
        "label": "MMR schedule trials",
        "cond": "Measles OR Rubella",
        "intr": "MMR schedule OR two dose OR second dose OR measles vaccination timing",
    },
]

# ---------------------------------------------------------------------------
# News & grey-literature search terms (Google News RSS)
# ---------------------------------------------------------------------------

NEWS_SEARCH_TERMS = [
    # Pregnancy policy questions
    "MMR vaccine pregnancy safety",
    "measles vaccine pregnancy",
    "measles in pregnancy outcome",
    "congenital measles",
    "MMR pregnancy NACI recommendation",
    "measles post-exposure prophylaxis pregnancy",
    "IVIg measles pregnancy",
    # Schedule policy question
    "MMR second dose age schedule",
    "measles vaccine schedule change",
    "MMR 18 months schedule recommendation",
    # NITAG guidance
    "SAGE measles vaccine recommendation",
    "NACI measles recommendation 2025 2026",
    "ACIP measles vaccine guidance",
    # Outbreaks
    "measles outbreak 2026",
    "measles outbreak Canada",
    "measles outbreak pregnancy",
    "measles resurgence vaccination",
    "measles elimination failure",
]

# ---------------------------------------------------------------------------
# Direct RSS / Atom feeds
# ---------------------------------------------------------------------------

DIRECT_FEEDS = [
    # Outbreak news & surveillance
    {
        "source": "CIDRAP",
        "url": "https://www.cidrap.umn.edu/rss.xml",
        "type": "news",
    },
    {
        "source": "ProMED",
        "url": "https://promedmail.org/promed-rss/",
        "type": "outbreak_report",
    },
    {
        "source": "CDC MMWR",
        "url": "https://www.cdc.gov/mmwr/rss/rss.xml",
        "type": "surveillance",
    },
    {
        "source": "WHO News",
        "url": "https://www.who.int/rss-feeds/news-english.xml",
        "type": "news",
    },
    {
        "source": "ECDC",
        "url": "https://www.ecdc.europa.eu/en/news-events/rss.xml",
        "type": "surveillance",
    },
    # Preprint servers — directly monitored for speed
    {
        "source": "medRxiv",
        "url": "https://connect.medrxiv.org/medrxiv_xml.php?subject=infectious_diseases",
        "type": "preprint",
    },
    {
        "source": "medRxiv",
        "url": "https://connect.medrxiv.org/medrxiv_xml.php?subject=pediatrics",
        "type": "preprint",
    },
    {
        "source": "bioRxiv",
        "url": "https://connect.biorxiv.org/biorxiv_xml.php?subject=microbiology",
        "type": "preprint",
    },
    {
        "source": "bioRxiv",
        "url": "https://connect.biorxiv.org/biorxiv_xml.php?subject=immunology",
        "type": "preprint",
    },
]

# ---------------------------------------------------------------------------
# WHO IRIS guidance repository
# ---------------------------------------------------------------------------

WHO_IRIS_API = "https://iris.who.int/server/api/discover/search/objects"
WHO_IRIS_QUERIES = [
    "measles vaccine",
    "MMR schedule",
    "measles pregnancy",
    "measles outbreak guidance",
    "rubella elimination",
]
WHO_IRIS_SINCE_DAYS = 1825   # ~5 years

# ---------------------------------------------------------------------------
# WHO Disease Outbreak News — targeted Google News searches
# (legacy RSS is retired; see fetch_measles_outbreak_news() in sources.py)
# ---------------------------------------------------------------------------

WHO_DON_SEARCHES = [
    'site:who.int "disease-outbreak-news" measles',
    '"WHO disease outbreak news" measles outbreak',
    'WHO measles outbreak report 2025 OR 2026',
]

# ---------------------------------------------------------------------------
# Source domain → display name
# ---------------------------------------------------------------------------

SOURCE_DOMAIN_MAP = {
    "cbc.ca":          "CBC News",
    "cidrap.umn.edu":  "CIDRAP",
    "statnews.com":    "STAT",
    "reuters.com":     "Reuters",
    "who.int":         "WHO",
    "iris.who.int":    "WHO IRIS",
    "biorxiv.org":     "bioRxiv",
    "medrxiv.org":     "medRxiv",
    "africacdc.org":   "Africa CDC",
    "cdc.gov":         "CDC",
    "ecdc.europa.eu":  "ECDC",
    "promedmail.org":  "ProMED",
    "apnews.com":      "AP News",
    "theguardian.com": "The Guardian",
    "nature.com":      "Nature",
    "science.org":     "Science",
    "thelancet.com":   "The Lancet",
    "nejm.org":        "NEJM",
    "bmj.com":         "The BMJ",
    "canada.ca":       "Government of Canada",
    "phac-aspc.gc.ca": "PHAC",
    "healthycanadians.gc.ca": "Government of Canada",
    "gavi.org":        "Gavi",
    "cepi.net":        "CEPI",
    "merck.com":       "Merck (press release)",
    "modernatx.com":   "Moderna (press release)",
    "pfizer.com":      "Pfizer (press release)",
    "bavarian-nordic.com": "Bavarian Nordic (press release)",
}

PHARMA_HOSTS = {
    "merck.com", "msd.com", "modernatx.com", "pfizer.com",
    "bavarian-nordic.com", "gsk.com", "sanofi.com",
}

# ---------------------------------------------------------------------------
# Classification keyword banks
# ---------------------------------------------------------------------------

# Policy area 1a: MMR vaccine administered during / around pregnancy
PREGNANCY_MMR_KEYWORDS = [
    "mmr vaccine pregnancy", "mmr during pregnancy", "mmr in pregnancy",
    "mmr pregnant", "mmr inadvertent", "inadvertent mmr",
    "inadvertent vaccination pregnancy", "inadvertent immunization pregnancy",
    "measles vaccine pregnancy", "measles vaccination pregnancy",
    "rubella vaccine pregnancy", "rubella vaccination pregnancy",
    "live vaccine pregnancy", "live attenuated pregnancy",
    "maternal vaccination", "maternal immunization", "maternal immunisation",
    "vaccination in pregnancy", "vaccination during pregnancy",
    "immunization in pregnancy", "immunization during pregnancy",
    "vaccine safety pregnancy", "vaccine adverse pregnancy",
    "vaers pregnancy", "aefi pregnancy", "adverse event pregnancy vaccine",
    "teratogen vaccine", "vaccine teratogenicity",
    "registry pregnancy vaccine", "pregnancy registry vaccine",
    "mmr susceptible pregnancy", "rubella susceptibility pregnant",
    "mmr periconceptional", "periconceptional mmr", "periconceptional vaccination",
    "mmr postpartum", "postpartum mmr", "postpartum vaccination",
    "postpartum rubella", "postpartum immunization",
    "congenital rubella syndrome", "crs vaccine",
    "congenital rubella infection",
    "post-exposure prophylaxis pregnancy measles",
    "ivig pregnancy measles", "immunoglobulin pregnancy measles",
    "passive immunization pregnancy", "pep pregnancy measles",
]

# Policy area 1b: Measles / rubella infection as disease in pregnancy
PREGNANCY_INFECTION_KEYWORDS = [
    "measles pregnancy", "measles pregnant", "measles in pregnancy",
    "measles during pregnancy", "measles maternal", "maternal measles",
    "rubeola pregnancy", "rubeola pregnant",
    "congenital measles", "measles neonatal", "measles newborn",
    "measles neonate", "measles fetal", "measles fetus",
    "measles perinatal", "measles vertical transmission",
    "measles miscarriage", "measles abortion", "measles stillbirth",
    "measles pregnancy loss", "measles preterm", "measles premature",
    "measles pregnancy outcome", "measles pregnancy complication",
    "measles pregnant woman",
    # Rubella infection in pregnancy is part of same EtD context
    "rubella pregnancy", "rubella pregnant", "rubella in pregnancy",
    "rubella maternal", "congenital rubella syndrome", "crs",
    "rubella neonatal", "rubella fetal", "rubella perinatal",
]

# Policy area 2: MMR second dose timing / childhood schedule
SCHEDULE_KEYWORDS = [
    "second dose mmr", "mmr second dose", "second mmr dose",
    "2nd dose mmr", "mmr 2nd dose", "mmr two dose",
    "mmr schedule", "measles vaccine schedule", "mmr dosing schedule",
    "dose interval mmr", "mmr dose interval", "dosing interval measles",
    "mmr timing", "measles vaccine timing", "optimal mmr",
    "two dose measles", "two-dose mmr", "two-dose schedule",
    "mmr 12 months", "mmr 18 months", "12 month 18 month mmr",
    "preschool mmr", "mmr age", "optimal age mmr",
    "catch-up vaccination measles", "catch-up mmr",
    "routine immunization schedule measles", "mmr booster",
    "second measles dose", "measles booster", "measles revaccination",
    "first dose second dose measles", "mmr dose 2", "mmr dose1 dose2",
    "school entry vaccination", "pre-school vaccination measles",
    "childhood measles schedule",
]

# Surveillance / safety database signals (tag as surveillance source_type)
SURVEILLANCE_KEYWORDS = [
    "vaers", "aefi", "pharmacovigilance", "spontaneous report",
    "adverse event reporting", "safety database", "safety surveillance",
    "yellow card", "eudravigilance", "meddra", "reporting system",
    "vaccine adverse", "adverse drug reaction",
    "surveillance system", "passive surveillance",
    "active surveillance", "sentinel surveillance",
    "epidemiological bulletin", "epidemiological report",
    "mmwr", "communicable disease", "weekly epidemiological",
    "disease surveillance", "notifiable disease",
]

# General measles relevance scope — must match for a record to be kept
MEASLES_SCOPE_KEYWORDS = [
    "measles", "rubeola", "mmr", "measles-mumps-rubella",
    "measles mumps rubella", "morbillivirus", "morbilli",
    "rubella",  # part of MMR; relevant to same policy question
    "german measles",  # lay term for rubella
]

# Animal study signals (kept in data but flagged)
ANIMAL_KEYWORDS = [
    "mice", "mouse", "murine", "monkey", "macaque", "primate",
    "nonhuman primate", "non-human primate", "nhp", "cynomolgus",
    "rhesus", "ferret", "hamster", "rabbit", "guinea pig",
    "rodent", "animal model", "animal models", "preclinical",
    "pre-clinical", "in vivo",
]

HUMAN_KEYWORDS = [
    "patients", "participants", "healthy adults", "healthy volunteers",
    "clinical trial", "phase 1", "phase 2", "phase 3",
    "vaccinees", "recipients", "human", "adults", "children",
    "infants", "pregnant", "cohort", "randomized", "randomised",
    "case series", "case report", "outbreak", "surveillance",
]

# Canadian relevance signals
CANADA_KEYWORDS = [
    "canada", "canadian", "phac", "public health agency of canada",
    "national microbiology laboratory", "winnipeg", "nml", "manitoba",
    "naci", "national advisory committee on immunization",
    "dalhousie", "university of toronto", "mcmaster", "ubc",
    "université laval", "mcgill", "quebec", "ontario", "alberta",
    "british columbia", "nova scotia", "health canada",
    "canadian immunization guide", "cig", "immunize canada",
    "public health ontario", "bccdc", "inspq",
]

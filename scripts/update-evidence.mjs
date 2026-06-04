#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const OUTFILE = new URL("../public/data/evidence.json", import.meta.url);
const LOOKBACK_DAYS = Number(process.env.EVIDENCE_LOOKBACK_DAYS || 90);
const MAX_ITEMS = Number(process.env.MAX_EVIDENCE_ITEMS || 2000);
const NCBI_EMAIL = process.env.NCBI_EMAIL || "";
const NOW = new Date();
const TOOL_NAME = "measles-evidence-dashboard";

const TOPICS = {
  pregnancy: {
    label: "Measles in pregnancy / pre- or post-exposure management",
    pubmed: [
      '("measles"[Title/Abstract] OR "morbilli"[Title/Abstract]) AND (pregnan*[Title/Abstract] OR maternal[Title/Abstract] OR fetus[Title/Abstract] OR fetal[Title/Abstract] OR foetal[Title/Abstract] OR obstetric*[Title/Abstract] OR neonatal[Title/Abstract] OR congenital[Title/Abstract] OR "post-exposure prophylaxis"[Title/Abstract] OR immunoglobulin[Title/Abstract] OR "immune globulin"[Title/Abstract] OR "MMR"[Title/Abstract])'
    ],
    europepmc: [
      '(TITLE_ABS:measles OR TITLE_ABS:morbilli) AND (TITLE_ABS:pregnan* OR TITLE_ABS:maternal OR TITLE_ABS:fetal OR TITLE_ABS:foetal OR TITLE_ABS:obstetric* OR TITLE_ABS:neonatal OR TITLE_ABS:congenital OR TITLE_ABS:"immune globulin" OR TITLE_ABS:immunoglobulin OR TITLE_ABS:"post-exposure prophylaxis" OR TITLE_ABS:MMR)'
    ],
    news: [
      'measles (pregnancy OR pregnant OR maternal OR fetus OR fetal OR foetal OR obstetric)',
      'measles pregnant women outbreak',
      'MMR pregnancy measles outbreak'
    ],
    include: [
      /measles|morbilli|MMR/i,
      /pregnan|maternal|fetal|foetal|fetus|foetus|obstetric|neonatal|congenital|immunoglobulin|immune globulin|post.?exposure/i
    ]
  },
  interval: {
    label: "Interval between first and second measles-containing vaccine doses",
    pubmed: [
      '("measles vaccine"[Title/Abstract] OR "measles-mumps-rubella vaccine"[Title/Abstract] OR MMR[Title/Abstract] OR MMRV[Title/Abstract]) AND ("second dose"[Title/Abstract] OR interval[Title/Abstract] OR schedule[Title/Abstract] OR accelerated[Title/Abstract] OR "dose spacing"[Title/Abstract] OR "28 days"[Title/Abstract] OR "4 weeks"[Title/Abstract] OR "school entry"[Title/Abstract] OR immunogenicity[Title/Abstract] OR effectiveness[Title/Abstract])'
    ],
    europepmc: [
      '(TITLE_ABS:"measles vaccine" OR TITLE_ABS:"measles-mumps-rubella vaccine" OR TITLE_ABS:MMR OR TITLE_ABS:MMRV) AND (TITLE_ABS:"second dose" OR TITLE_ABS:interval OR TITLE_ABS:schedule OR TITLE_ABS:accelerated OR TITLE_ABS:"dose spacing" OR TITLE_ABS:"28 days" OR TITLE_ABS:"4 weeks" OR TITLE_ABS:immunogenicity OR TITLE_ABS:effectiveness)'
    ],
    news: [
      'measles vaccine "second dose" interval',
      'MMR second dose early outbreak',
      'measles vaccine accelerated schedule'
    ],
    include: [
      /measles|MMR|MMRV/i,
      /second dose|interval|schedule|accelerated|dose spacing|28 days|4 weeks|immunogenicity|effectiveness|school entry|minimum interval|early second/i
    ]
  }
};

const DEFAULT_GUIDANCE_LINK_PATTERNS = [
  /measles|morbilli|masern|rougeole|MMR|MMRV|ROR/i,
  /vaccine|vaccination|immuni[sz]ation|impfung|calendrier|schedule|recommendation|statement|guidance|guideline/i
];

const NITAG_WATCH_SOURCES = [
  {
    name: "STIKO Germany — Standing Committee on Vaccination recommendations",
    jurisdiction: "Germany",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.rki.de/EN/Topics/Infectious-diseases/Immunisation/STIKO/STIKO-recommendations/Downloads/STIKO_Recommendations.pdf?__blob=publicationFile&v=1",
    followLinks: false,
    why: "Monitors STIKO recommendations for changes to measles/MMR schedules, catch-up recommendations, and minimum-dose interval guidance."
  },
  {
    name: "HAS France — Vaccination topic page",
    jurisdiction: "France",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.has-sante.fr/jcms/c_2742985/fr/vaccination",
    followLinks: true,
    linkPatterns: [/rougeole|ROR|vaccination|calendrier|recommandation/i],
    why: "Monitors HAS vaccination recommendation activity, including measles/ROR-related recommendation updates."
  },
  {
    name: "HAS France — Commission technique des vaccinations",
    jurisdiction: "France",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.has-sante.fr/jcms/c_2755844/fr/commission-technique-des-vaccinations-ctv",
    followLinks: true,
    linkPatterns: [/rougeole|ROR|vaccination|calendrier|recommandation|avis/i],
    why: "Monitors the French technical vaccination commission page for new or changed recommendation documents."
  },
  {
    name: "France Ministry of Health — Vaccination calendar",
    jurisdiction: "France",
    topic: "interval",
    sourceScope: "National schedule watch",
    url: "https://sante.gouv.fr/prevention-en-sante/preserver-sa-sante/vaccination/calendrier-vaccinal",
    followLinks: true,
    linkPatterns: [/rougeole|ROR|calendrier|vaccinal|vaccination/i],
    why: "Monitors the French national vaccination calendar for changes to ROR timing and catch-up recommendations."
  },
  {
    name: "HAS France — Measles vaccination before 12 months recommendation",
    jurisdiction: "France",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.has-sante.fr/upload/docs/application/pdf/2018-04/recommandation___vaccination_contre_la_rougeole_avant_lage_de_12_mois_suite_a_larret_de_commercialisation_du_vaccin_monovale.pdf",
    followLinks: false,
    why: "Monitors HAS recommendation content relevant to measles vaccination before 12 months in travel or post-exposure settings."
  },
  {
    name: "NIAC Ireland — Immunisation Guidelines for Ireland",
    jurisdiction: "Ireland",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.hiqa.ie/areas-we-work/national-immunisation-advisory-committee/immunisation-guidelines-ireland",
    followLinks: true,
    linkPatterns: [/measles|MMR|mumps|rubella|immunisation|guidelines|recommendations/i],
    why: "Monitors NIAC guideline landing page for new or changed immunisation guidance."
  },
  {
    name: "NIAC Ireland — Chapter 12 Measles",
    jurisdiction: "Ireland",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.hiqa.ie/sites/default/files/NIAC/Immunisation_Guidelines/Chapter_12_Measles.pdf",
    followLinks: false,
    why: "Monitors NIAC measles chapter for changes to MMR schedule, catch-up, travel, and outbreak recommendations."
  },
  {
    name: "NIAC Ireland — Chapter 2 General Immunisation Procedures",
    jurisdiction: "Ireland",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.hiqa.ie/sites/default/files/NIAC/Immunisation_Guidelines/Chapter_02_General_Immunisation_Procedures.pdf",
    followLinks: false,
    why: "Monitors NIAC general immunisation procedures, including spacing and timing principles relevant to dose interval questions."
  },
  {
    name: "NACI Canada — Statements and publications page",
    jurisdiction: "Canada",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.canada.ca/en/public-health/services/immunization/national-advisory-committee-on-immunization-naci.html",
    followLinks: true,
    linkPatterns: [/measles|rubella|mumps|MMR|MMRV|post-exposure|prophylaxis|vaccin/i],
    why: "Monitors the NACI statements page for new or changed measles/MMR recommendation documents."
  },
  {
    name: "NACI Canada — Updated measles post-exposure prophylaxis recommendations",
    jurisdiction: "Canada",
    topic: "pregnancy",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.canada.ca/en/public-health/services/publications/vaccines-immunization/national-advisory-committee-immunization-summary-updated-recommendations-measles-post-exposure-prophylaxis.html",
    followLinks: false,
    why: "Monitors NACI measles PEP recommendations, including relevance to susceptible pregnant contacts and immunoglobulin use."
  },
  {
    name: "Canada — Canadian Immunization Guide measles vaccines",
    jurisdiction: "Canada",
    topic: "interval",
    sourceScope: "National guidance watch",
    url: "https://www.canada.ca/en/public-health/services/publications/healthy-living/canadian-immunization-guide-part-4-active-vaccines/page-12-measles-vaccine.html",
    followLinks: false,
    why: "Monitors the CIG measles vaccine chapter for changes to routine, catch-up, travel, post-exposure, and outbreak recommendations."
  },
  {
    name: "Canada — Canadian Immunization Guide pregnancy and breastfeeding",
    jurisdiction: "Canada",
    topic: "pregnancy",
    sourceScope: "National guidance watch",
    url: "https://www.canada.ca/en/public-health/services/publications/healthy-living/canadian-immunization-guide-part-3-vaccination-specific-populations/page-4-immunization-pregnancy-breastfeeding.html",
    followLinks: false,
    why: "Monitors Canadian pregnancy and breastfeeding immunization guidance for changes relevant to live vaccines and post-exposure management."
  },
  {
    name: "Canada — Recommended immunization schedules",
    jurisdiction: "Canada",
    topic: "interval",
    sourceScope: "National schedule watch",
    url: "https://www.canada.ca/en/public-health/services/publications/healthy-living/canadian-immunization-guide-part-1-key-immunization-information/page-13-recommended-immunization-schedules.html",
    followLinks: false,
    why: "Monitors national schedule tables for changes to MMR/MMRV first-dose, second-dose, and minimum-interval guidance."
  },
  {
    name: "ACIP / CDC Measles vaccine recommendations",
    jurisdiction: "United States",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.cdc.gov/measles/hcp/vaccine-considerations/index.html",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|second dose|schedule|recommendation|ACIP/i],
    why: "Monitors CDC/ACIP measles vaccine recommendation pages for changes to routine, accelerated, and minimum interval guidance."
  },
  {
    name: "ACOG Measles outbreak guidance for obstetric patients",
    jurisdiction: "United States",
    topic: "pregnancy",
    sourceScope: "Clinical guidance watch",
    url: "https://www.acog.org/clinical/clinical-guidance/practice-advisory/articles/2024/03/management-of-obstetric-gynecologic-patients-during-a-measles-outbreak",
    followLinks: false,
    why: "Monitors obstetric measles outbreak guidance for changes relevant to pregnancy, exposure management, and immune globulin."
  },
  {
    name: "JCVI United Kingdom — Committee page",
    jurisdiction: "United Kingdom",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.gov.uk/government/groups/joint-committee-on-vaccination-and-immunisation",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|childhood immunisation|vaccination schedule|JCVI statement/i],
    why: "Monitors the JCVI page for new statements relevant to MMR/MMRV schedule timing."
  },
  {
    name: "JCVI United Kingdom — Childhood schedule change statement",
    jurisdiction: "United Kingdom",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.gov.uk/government/publications/changes-to-the-childhood-immunisation-schedule-jcvi-statement/joint-committee-on-vaccination-and-immunisation-jcvi-statement-on-changes-to-the-childhood-immunisation-schedule",
    followLinks: false,
    why: "Monitors JCVI statement that includes moving the second MMR dose earlier in the childhood schedule."
  },
  {
    name: "UK Green Book — Measles chapter",
    jurisdiction: "United Kingdom",
    topic: "interval",
    sourceScope: "National guidance watch",
    url: "https://www.gov.uk/government/publications/measles-the-green-book-chapter-21",
    followLinks: true,
    linkPatterns: [/measles|green book|MMR|MMRV|chapter 21/i],
    why: "Monitors UK measles guidance for changes to MMR timing, outbreak response, and post-exposure guidance."
  },
  {
    name: "ATAGI Australia — Statements page",
    jurisdiction: "Australia",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.health.gov.au/committees-and-groups/atagi/statements?language=en",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|immunisation|annual statement|ATAGI/i],
    why: "Monitors ATAGI statements for new or changed vaccine policy advice relevant to measles or MMR."
  },
  {
    name: "ATAGI Australia — Committee page",
    jurisdiction: "Australia",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.health.gov.au/committees-and-groups/atagi?language=en",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|statement|immunisation|recommendation/i],
    why: "Monitors the ATAGI committee page and linked statements for immunisation recommendation changes."
  },
  {
    name: "Australia — Australian Immunisation Handbook measles chapter",
    jurisdiction: "Australia",
    topic: "interval",
    sourceScope: "National guidance watch",
    url: "https://immunisationhandbook.health.gov.au/measles",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|recommendations|post-exposure|pregnancy/i],
    why: "Monitors Australian Handbook measles guidance for changes to routine schedule, early infant doses, travel, and post-exposure guidance."
  },
  {
    name: "Australia — CMO measles vaccination advice referencing ATAGI update",
    jurisdiction: "Australia",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.health.gov.au/news/chief-medical-officer-professor-michael-kidd-measles-vaccination-advice?language=en",
    followLinks: false,
    why: "Monitors Australian Government measles advice reflecting ATAGI update on MMR for infants aged 6 to 11 months before overseas travel."
  },
  {
    name: "WHO — SAGE main page",
    jurisdiction: "Global",
    topic: "interval",
    sourceScope: "SAGE recommendation watch",
    url: "https://www.who.int/groups/strategic-advisory-group-of-experts-on-immunization",
    followLinks: true,
    linkPatterns: [/measles|rubella|MMR|SAGE|meeting|recommendations|position paper/i],
    why: "Monitors WHO SAGE page for new meeting reports, recommendation updates, and vaccine policy material."
  },
  {
    name: "WHO — Vaccine position papers",
    jurisdiction: "Global",
    topic: "interval",
    sourceScope: "SAGE / WHO position paper watch",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/policies/position-papers",
    followLinks: true,
    linkPatterns: [/measles|rubella|MMR|position paper|vaccine/i],
    why: "Monitors WHO vaccine position papers for updates to measles or rubella-containing vaccine recommendations."
  },
  {
    name: "WHO — Measles vaccines position paper",
    jurisdiction: "Global",
    topic: "interval",
    sourceScope: "SAGE / WHO position paper watch",
    url: "https://www.who.int/publications/i/item/who-wer9217-205-227",
    followLinks: true,
    linkPatterns: [/measles|rubella|SAGE|position paper|MCV2|pregnancy/i],
    why: "Monitors WHO measles vaccine position paper page for recommendation changes related to MCV2, early infant doses, and contraindications."
  },
  {
    name: "WHO — Immunization, Vaccines and Biologicals measles page",
    jurisdiction: "Global",
    topic: "interval",
    sourceScope: "WHO measles guidance watch",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/diseases/measles",
    followLinks: true,
    linkPatterns: [/measles|rubella|position paper|schedule|SAGE|vaccination/i],
    why: "Monitors WHO measles immunization page and linked guidance documents."
  }
];

const CANADIAN_PROVINCIAL_SCHEDULE_WATCH_SOURCES = [
  {
    name: "Canada — Provincial and territorial routine and catch-up vaccination schedules",
    jurisdiction: "Canada",
    topic: "interval",
    sourceScope: "Canadian provincial/territorial schedule watch",
    url: "https://www.canada.ca/en/public-health/services/immunization-vaccines/provincial-territorial-routine-vaccination-programs-infants-children.html",
    followLinks: false,
    why: "Monitors PHAC summary table comparing provincial and territorial MMR/MMRV timing across Canada."
  },
  {
    name: "Ontario — Routine immunization schedule",
    jurisdiction: "Ontario, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.ontario.ca/page/ontarios-routine-immunization-schedule",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|immunization schedule|publicly funded/i],
    why: "Monitors Ontario schedule for MMR/MMRV timing and any changes to second-dose timing."
  },
  {
    name: "Quebec — MMR vaccine page",
    jurisdiction: "Quebec, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.quebec.ca/en/health/advice-and-prevention/vaccination/combined-measles-mumps-rubella-vaccine-mmr",
    followLinks: true,
    linkPatterns: [/measles|mumps|rubella|MMR|MMRV|immunization schedule/i],
    why: "Monitors Quebec MMR/MMRV schedule page for timing and catch-up updates."
  },
  {
    name: "Quebec — Immunization program",
    jurisdiction: "Quebec, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.quebec.ca/en/health/advice-and-prevention/vaccination/quebec-immunisation-program",
    followLinks: true,
    linkPatterns: [/measles|mumps|rubella|MMR|MMRV|schedule|calendrier/i],
    why: "Monitors Quebec immunization program page for changes to childhood vaccine schedule information."
  },
  {
    name: "Alberta — Routine immunization schedule",
    jurisdiction: "Alberta, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.alberta.ca/immunization-routine-schedule",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|routine schedule|immunization/i],
    why: "Monitors Alberta schedule page for MMR/MMRV timing changes."
  },
  {
    name: "Alberta Health Services — Routine immunization schedule PDF",
    jurisdiction: "Alberta, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.albertahealthservices.ca/assets/info/hp/cdc/if-hp-cdc-ipsm-routine-imm-schedule.pdf",
    followLinks: false,
    why: "Monitors Alberta schedule PDF for MMR/MMRV schedule changes."
  },
  {
    name: "British Columbia — HealthLinkBC child immunization schedule",
    jurisdiction: "British Columbia, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.healthlinkbc.ca/health-library/immunizations/schedules/children",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|schedule|immunization/i],
    why: "Monitors BC child immunization schedule for MMR/MMRV dose timing."
  },
  {
    name: "British Columbia — Province immunizations page",
    jurisdiction: "British Columbia, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www2.gov.bc.ca/gov/content/health/managing-your-health/immunizations",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|immunization/i],
    why: "Monitors BC provincial immunization page for measles schedule updates."
  },
  {
    name: "British Columbia — BCCDC MMR biological product page",
    jurisdiction: "British Columbia, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.bccdc.ca/resource-gallery/Documents/Guidelines%20and%20Forms/Guidelines%20and%20Manuals/Epid/CD%20Manual/Chapter%202%20-%20Imms/Part4/MMR.pdf",
    followLinks: false,
    why: "Monitors BCCDC MMR product guidance for indications, schedule, and interval language."
  },
  {
    name: "Manitoba — Routine immunization schedules",
    jurisdiction: "Manitoba, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.gov.mb.ca/health/publichealth/cdc/div/schedules.html",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|schedule|immunization/i],
    why: "Monitors Manitoba routine schedule for MMR/MMRV timing changes."
  },
  {
    name: "Saskatchewan — When to get immunized",
    jurisdiction: "Saskatchewan, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.saskatchewan.ca/residents/health/accessing-health-care-services/immunization-services/when-to-get-immunized",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|schedule|immunization/i],
    why: "Monitors Saskatchewan schedule page for MMR/MMRV timing changes."
  },
  {
    name: "Saskatchewan — Immunization Manual",
    jurisdiction: "Saskatchewan, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.ehealthsask.ca/services/Manuals/pages/sim.aspx",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|schedule|chapter/i],
    why: "Monitors Saskatchewan Immunization Manual page for schedule chapter changes."
  },
  {
    name: "Nova Scotia — Routine immunization schedules PDF",
    jurisdiction: "Nova Scotia, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://novascotia.ca/dhw/cdpc/documents/Routine-Immunization-Schedules-for-Children-Youth-Adults.pdf",
    followLinks: false,
    why: "Monitors Nova Scotia schedule PDF for MMR/MMRV timing changes."
  },
  {
    name: "Nova Scotia — Immunization page",
    jurisdiction: "Nova Scotia, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://novascotia.ca/dhw/cdpc/immunization.asp",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|routine immunization|schedule/i],
    why: "Monitors Nova Scotia immunization landing page for updated schedule links."
  },
  {
    name: "New Brunswick — Immunization schedule",
    jurisdiction: "New Brunswick, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.gnb.ca/en/topic/health-wellness/immunization-vaccination/immunization-schedule.html",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|immunization schedule/i],
    why: "Monitors New Brunswick schedule page for MMR/MMRV timing changes."
  },
  {
    name: "Prince Edward Island — Childhood immunizations",
    jurisdiction: "Prince Edward Island, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.princeedwardisland.ca/en/information/health-and-wellness/childhood-immunizations",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|immunization/i],
    why: "Monitors PEI childhood schedule for MMR/MMRV timing changes."
  },
  {
    name: "Newfoundland and Labrador — Immunization schedule PDF",
    jurisdiction: "Newfoundland and Labrador, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.gov.nl.ca/hcs/files/Immunization-Schedule-for-Infants-and-SchoolAged-Children.pdf",
    followLinks: false,
    why: "Monitors Newfoundland and Labrador immunization schedule PDF for MMR/MMRV timing changes."
  },
  {
    name: "Newfoundland and Labrador — Immunization page",
    jurisdiction: "Newfoundland and Labrador, Canada",
    topic: "interval",
    sourceScope: "Canadian provincial schedule watch",
    url: "https://www.gov.nl.ca/hcs/publichealth/cdc/immunizations/",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|schedule|immunization/i],
    why: "Monitors Newfoundland and Labrador immunization landing page for updated schedule links."
  },
  {
    name: "Yukon — Immunization schedules",
    jurisdiction: "Yukon, Canada",
    topic: "interval",
    sourceScope: "Canadian territorial schedule watch",
    url: "https://yukonimmunization.ca/get-immunized/immunization-schedules",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|schedule|immunization/i],
    why: "Monitors Yukon schedule page for MMR/MMRV timing changes."
  },
  {
    name: "Northwest Territories — Immunization schedule PDF",
    jurisdiction: "Northwest Territories, Canada",
    topic: "interval",
    sourceScope: "Canadian territorial schedule watch",
    url: "https://www.hss.gov.nt.ca/sites/hss/files/immunization-schedule-general-public.pdf",
    followLinks: false,
    why: "Monitors NWT immunization schedule PDF for MMR/MMRV timing changes."
  },
  {
    name: "Nunavut — Recommended childhood immunization schedule PDF",
    jurisdiction: "Nunavut, Canada",
    topic: "interval",
    sourceScope: "Canadian territorial schedule watch",
    url: "https://www.gov.nu.ca/sites/default/files/documents/2021-10/nunavut_childhood_immunization_schedule_july_2021.pdf",
    followLinks: false,
    why: "Monitors Nunavut childhood immunization schedule PDF for MMR/MMRV timing changes."
  },
  {
    name: "Nunavut — Childhood and adult immunization schedules and catch-up aids",
    jurisdiction: "Nunavut, Canada",
    topic: "interval",
    sourceScope: "Canadian territorial schedule watch",
    url: "https://www.gov.nu.ca/sites/default/files/documents/2023-12/7.0_nunavut_childhood_and_adult_immunization_schedules_and_catch-up_aids_july_2021.pdf",
    followLinks: false,
    why: "Monitors Nunavut schedule and catch-up aid document for MMR/MMRV timing and minimum interval changes."
  }
];

const CURATED_NEWS_SOURCES = [
  {
    name: "CBC Health",
    jurisdiction: "Canada",
    type: "rss",
    url: "https://www.cbc.ca/webfeed/rss/rss-health"
  },
  {
    name: "CBC Canada",
    jurisdiction: "Canada",
    type: "rss",
    url: "https://www.cbc.ca/webfeed/rss/rss-canada"
  },
  {
    name: "CIDRAP Measles",
    jurisdiction: "International",
    type: "html",
    url: "https://www.cidrap.umn.edu/measles"
  },
  {
    name: "STAT Health",
    jurisdiction: "United States",
    type: "rss",
    url: "https://www.statnews.com/feed/"
  },
  {
    name: "WHO Disease Outbreak News",
    jurisdiction: "Global",
    type: "html",
    url: "https://www.who.int/emergencies/disease-outbreak-news"
  },
  {
    name: "PAHO Epidemiological Alerts",
    jurisdiction: "Americas",
    type: "html",
    url: "https://www.paho.org/en/epidemiological-alerts-and-updates"
  },
  {
    name: "ECDC Measles",
    jurisdiction: "Europe",
    type: "html",
    url: "https://www.ecdc.europa.eu/en/measles"
  },
  {
    name: "ECDC Measles Surveillance",
    jurisdiction: "Europe",
    type: "html",
    url: "https://www.ecdc.europa.eu/en/measles/surveillance-and-disease-data"
  },
  {
    name: "CDC Measles Cases and Outbreaks",
    jurisdiction: "United States",
    type: "html",
    url: "https://www.cdc.gov/measles/data-research/index.html"
  },
  {
    name: "CDC MMWR",
    jurisdiction: "United States",
    type: "html",
    url: "https://www.cdc.gov/mmwr/index.html"
  },
  {
    name: "PHAC Measles and Rubella Monitoring",
    jurisdiction: "Canada",
    type: "html",
    url: "https://health-infobase.canada.ca/measles-rubella/"
  }
];

const GDELT_PRIORITY_DOMAINS = [
  "cbc.ca",
  "cidrap.umn.edu",
  "statnews.com",
  "reuters.com",
  "who.int",
  "paho.org",
  "ecdc.europa.eu",
  "cdc.gov",
  "canada.ca",
  "publichealthontario.ca",
  "bccdc.ca",
  "gov.uk"
];

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return isoDate(d);
}

function sha256(value) {
  const input =
    value instanceof Uint8Array || Buffer.isBuffer(value)
      ? value
      : String(value);
  return createHash("sha256").update(input).digest("hex");
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|fbclid|gclid/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function cleanText(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value = "", max = 900) {
  const s = cleanText(value);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function normalizeDate(value) {
  if (!value) return isoDate(NOW);

  const s = String(value).trim();

  if (/^\d{8}T/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return isoDate(parsed);

  const year = s.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return isoDate(NOW);

  return `${year}-01-01`;
}

function inferJurisdiction(text, fallback = "International") {
  const t = String(text).toLowerCase();

  if (/ontario/.test(t)) return "Ontario, Canada";
  if (/quebec|québec/.test(t)) return "Quebec, Canada";
  if (/alberta/.test(t)) return "Alberta, Canada";
  if (/british columbia|bccdc/.test(t)) return "British Columbia, Canada";
  if (/manitoba/.test(t)) return "Manitoba, Canada";
  if (/saskatchewan/.test(t)) return "Saskatchewan, Canada";
  if (/nova scotia/.test(t)) return "Nova Scotia, Canada";
  if (/new brunswick/.test(t)) return "New Brunswick, Canada";
  if (/newfoundland|labrador/.test(t)) return "Newfoundland and Labrador, Canada";
  if (/prince edward island|pei/.test(t)) return "Prince Edward Island, Canada";
  if (/yukon/.test(t)) return "Yukon, Canada";
  if (/nunavut/.test(t)) return "Nunavut, Canada";
  if (/northwest territories|nwt/.test(t)) return "Northwest Territories, Canada";
  if (/canada|canadian|naci|phac|canada\.ca/.test(t)) return "Canada";
  if (/cdc|acip|united states|u\.s\.|usa/.test(t)) return "United States";
  if (/who|sage|global/.test(t)) return "Global";
  if (/united kingdom|ukhsa|jcvi|green book|gov\.uk/.test(t)) return "United Kingdom";
  if (/australia|atagi/.test(t)) return "Australia";
  if (/france|has-sante|rougeole|sante\.gouv/.test(t)) return "France";
  if (/germany|stiko|rki|masern/.test(t)) return "Germany";
  if (/ireland|niac|hiqa/.test(t)) return "Ireland";
  if (/ecdc|europe/.test(t)) return "Europe";
  if (/paho|americas/.test(t)) return "Americas";

  return fallback;
}

function inferSignal(topic, title, abstract = "") {
  const t = `${title} ${abstract}`.toLowerCase();

  if (topic === "pregnancy") {
    if (/post.?exposure|immune globulin|immunoglobulin|igiv|igim/.test(t)) {
      return "Post-exposure prophylaxis signal for susceptible pregnant contacts";
    }
    if (/mmr|vaccine|vaccination|inadvertent/.test(t) && /pregnan|maternal/.test(t)) {
      return "MMR exposure or vaccination-in-pregnancy evidence signal";
    }
    if (/outbreak|cluster|case series/.test(t)) {
      return "Outbreak or case-series signal involving pregnancy";
    }
    if (/fetal|foetal|neonatal|congenital|miscarriage|stillbirth|preterm/.test(t)) {
      return "Maternal-fetal outcome signal";
    }
    return "Pregnancy-related measles evidence signal";
  }

  if (/28 days|4 weeks|minimum interval|early second|accelerated/.test(t)) {
    return "Minimum or shortened second-dose interval signal";
  }
  if (/immunogenicity|seroconversion|antibody|effectiveness|efficacy/.test(t)) {
    return "Immunogenicity or effectiveness by dose timing signal";
  }
  if (/guidance|recommendation|schedule|school entry|routine|catch-up|catch up/.test(t)) {
    return "Schedule recommendation signal";
  }
  return "Second-dose interval evidence signal";
}

function inferTopicForNews(title = "", description = "") {
  const t = `${title} ${description}`;

  if (/pregnan|maternal|fetal|foetal|fetus|foetus|obstetric|neonatal|congenital|post.?exposure|immune globulin|immunoglobulin/i.test(t)) {
    return "pregnancy";
  }

  return "interval";
}

function sourceTypeFromResult(result) {
  const joined = `${result.source || ""} ${result.journalTitle || ""} ${result.title || ""}`.toLowerCase();
  if (/preprint|medrxiv|biorxiv|\bppr\b/.test(joined)) return "preprint";
  return "publication";
}

function makeItem(raw) {
  const url = normalizeUrl(raw.url);
  const id = sha256(url || `${raw.title}-${raw.date}-${raw.source}`);
  const title = clamp(raw.title, 260);

  return {
    id,
    topic: raw.topic,
    topicLabel: TOPICS[raw.topic]?.label || raw.topic,
    sourceType: raw.sourceType,
    title,
    url,
    source: clamp(raw.source || "Unknown source", 160),
    date: normalizeDate(raw.date),
    jurisdiction: raw.jurisdiction || inferJurisdiction(`${title} ${raw.source} ${url}`),
    evidenceSignal: raw.evidenceSignal || inferSignal(raw.topic, title, raw.abstract),
    whyItMatters: clamp(raw.whyItMatters || inferSignal(raw.topic, title, raw.abstract), 520),
    abstract: clamp(raw.abstract || "", 1200),
    queryTag: raw.queryTag || null,
    sourceFingerprint: raw.sourceFingerprint || null,
    fetchedAt: NOW.toISOString()
  };
}

function parseRssItems(xml) {
  const itemBlocks = [...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);

  return itemBlocks
    .map((block) => {
      const get = (tag) => {
        const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
        return cleanText(match?.[1] || "");
      };

      return {
        title: get("title"),
        url: cleanText(get("link")),
        date: get("pubDate") || get("dc:date"),
        description: get("description")
      };
    })
    .filter((item) => item.title && item.url);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": `${TOOL_NAME}/1.0 ${NCBI_EMAIL}`.trim(),
      "accept": "application/json"
    }
  });

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": `${TOOL_NAME}/1.0 ${NCBI_EMAIL}`.trim(),
      "accept": "text/html,application/xhtml+xml,text/plain,application/pdf,*/*"
    }
  });

  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);

  const buffer = Buffer.from(await res.arrayBuffer());

  return {
    text: buffer.toString("utf8"),
    lastModified: res.headers.get("last-modified"),
    etag: res.headers.get("etag"),
    contentType: res.headers.get("content-type") || "",
    rawFingerprint: sha256(buffer)
  };
}

async function safe(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[warn] ${label}: ${err.message}`);
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchPubMed(topic, query) {
  const from = daysAgo(LOOKBACK_DAYS);
  const to = isoDate(NOW);

  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    retmax: "60",
    sort: "pub_date",
    datetype: "pdat",
    mindate: from,
    maxdate: to,
    tool: TOOL_NAME
  });

  if (NCBI_EMAIL) params.set("email", NCBI_EMAIL);

  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`;
  const search = await fetchJson(searchUrl);
  const ids = search?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  await sleep(350);

  const summaryParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
    tool: TOOL_NAME
  });

  if (NCBI_EMAIL) summaryParams.set("email", NCBI_EMAIL);

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`;
  const summary = await fetchJson(summaryUrl);

  return ids
    .map((id) => summary?.result?.[id])
    .filter(Boolean)
    .map((s) => {
      const title = cleanText(s.title);
      const authors = Array.isArray(s.authors)
        ? s.authors.slice(0, 4).map((a) => a.name).filter(Boolean).join(", ")
        : "";
      const source = [s.fulljournalname || s.source || "PubMed", authors].filter(Boolean).join(" — ");

      return makeItem({
        topic,
        sourceType: "publication",
        title,
        url: `https://pubmed.ncbi.nlm.nih.gov/${s.uid}/`,
        source,
        date: s.pubdate || s.sortpubdate,
        abstract: "",
        queryTag: "PubMed",
        whyItMatters: inferSignal(topic, title)
      });
    });
}

function europePmcUrl(r) {
  if (r.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`;
  if (r.doi) return `https://doi.org/${r.doi}`;
  return `https://europepmc.org/article/${r.source || "MED"}/${r.id}`;
}

async function searchEuropePmc(topic, query) {
  const from = daysAgo(LOOKBACK_DAYS);
  const to = isoDate(NOW);
  const datedQuery = `${query} AND FIRST_PDATE:[${from} TO ${to}]`;

  const params = new URLSearchParams({
    query: datedQuery,
    format: "json",
    pageSize: "75",
    sort_date: "y"
  });

  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`;
  const data = await fetchJson(url);
  const results = data?.resultList?.result || [];

  return results.map((r) => {
    const title = cleanText(r.title);
    const abstract = cleanText(r.abstractText || "");

    return makeItem({
      topic,
      sourceType: sourceTypeFromResult(r),
      title,
      url: europePmcUrl(r),
      source: r.journalTitle || r.source || "Europe PMC",
      date: r.firstPublicationDate || r.firstIndexDate || r.pubYear,
      abstract,
      queryTag: "Europe PMC",
      whyItMatters: inferSignal(topic, title, abstract)
    });
  });
}

async function searchPreprintServer(topic, server) {
  const from = daysAgo(LOOKBACK_DAYS);
  const to = isoDate(NOW);
  const out = [];

  for (const cursor of [0, 100, 200]) {
    const url = `https://api.biorxiv.org/details/${server}/${from}/${to}/${cursor}`;
    const data = await fetchJson(url);
    const records = data?.collection || [];

    if (!records.length) break;

    for (const r of records) {
      const title = cleanText(r.title || "");
      const abstract = cleanText(r.abstract || "");
      const text = `${title} ${abstract}`;

      if (!relevantToTopicText(text, topic)) continue;

      out.push(
        makeItem({
          topic,
          sourceType: "preprint",
          title,
          url: r.doi ? `https://doi.org/${r.doi}` : `https://www.${server}.org/`,
          source: server === "medrxiv" ? "medRxiv" : "bioRxiv",
          date: r.date || r.post_date || isoDate(NOW),
          abstract,
          queryTag: `${server} API`,
          whyItMatters: inferSignal(topic, title, abstract)
        })
      );
    }

    if (records.length < 100) break;
    await sleep(250);
  }

  return out;
}

async function searchGdelt(topic, query) {
  const params = new URLSearchParams({
    query: `${query} sourcelang:english`,
    mode: "ArtList",
    format: "json",
    sort: "DateDesc",
    maxrecords: "75",
    timespan: `${Math.min(LOOKBACK_DAYS, 30)}d`
  });

  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
  const data = await fetchJson(url);
  const articles = data?.articles || [];

  return articles
    .filter((a) => a.url && a.title)
    .map((a) => {
      const title = cleanText(a.title);
      const text = `${title} ${a.domain || ""} ${a.sourcecountry || ""}`;
      const isOutbreak = /outbreak|cluster|exposure|case|surveillance/.test(text.toLowerCase());

      return makeItem({
        topic,
        sourceType: isOutbreak ? "outbreak" : "news",
        title,
        url: a.url,
        source: a.domain || "GDELT-indexed news",
        date: a.seendate,
        jurisdiction: inferJurisdiction(text, a.sourcecountry || "International"),
        queryTag: "GDELT news",
        whyItMatters: inferSignal(topic, title)
      });
    });
}

async function fetchCuratedNewsSources() {
  const items = [];

  for (const source of CURATED_NEWS_SOURCES) {
    const result = await safe(`curated news ${source.name}`, async () => {
      const { text, lastModified } = await fetchText(source.url);

      if (source.type === "rss") {
        const rssItems = parseRssItems(text);

        return rssItems
          .filter((entry) => /measles|MMR|MMRV|morbilli|rubella/i.test(`${entry.title} ${entry.description}`))
          .map((entry) => {
            const topic = inferTopicForNews(entry.title, entry.description);

            return makeItem({
              topic,
              sourceType: /outbreak|case|exposure|cluster|surveillance/i.test(`${entry.title} ${entry.description}`)
                ? "outbreak"
                : "news",
              title: entry.title,
              url: entry.url,
              source: source.name,
              date: entry.date || lastModified || isoDate(NOW),
              jurisdiction: source.jurisdiction,
              abstract: entry.description,
              queryTag: "Curated news source",
              whyItMatters: inferSignal(topic, entry.title, entry.description)
            });
          });
      }

      const links = extractLinksFromHtml(text, source.url)
        .filter((link) => /measles|MMR|MMRV|morbilli|rubella/i.test(`${link.title} ${link.url}`))
        .slice(0, 40);

      return links.map((link) => {
        const topic = inferTopicForNews(link.title, link.url);

        return makeItem({
          topic,
          sourceType: /outbreak|surveillance|disease-outbreak-news|epidemiological-alert|case|cluster/i.test(`${link.title} ${link.url}`)
            ? "outbreak"
            : "news",
          title: link.title || source.name,
          url: link.url,
          source: source.name,
          date: lastModified || isoDate(NOW),
          jurisdiction: source.jurisdiction,
          queryTag: "Curated source page",
          whyItMatters: `Potential high-priority measles item from ${source.name}. Review for relevance to pregnancy, exposure management, vaccine schedule, outbreak response, or dose interval evidence.`
        });
      });
    });

    items.push(...result);
    await sleep(250);
  }

  return items;
}

async function searchPriorityDomainsViaGdelt() {
  const items = [];

  for (const domain of GDELT_PRIORITY_DOMAINS) {
    for (const topic of Object.keys(TOPICS)) {
      const query =
        topic === "pregnancy"
          ? `(measles OR MMR OR morbilli) (pregnancy OR pregnant OR maternal OR fetal OR foetal OR obstetric) domain:${domain}`
          : `(measles OR MMR OR MMRV) ("second dose" OR interval OR accelerated OR schedule OR "28 days" OR "4 weeks") domain:${domain}`;

      const result = await safe(`GDELT priority ${domain} ${topic}`, () =>
        searchGdelt(topic, query)
      );

      items.push(
        ...result.map((item) => ({
          ...item,
          queryTag: `Priority source via GDELT: ${domain}`
        }))
      );

      await sleep(250);
    }
  }

  return items;
}

function extractHtmlTitle(html) {
  const match = String(html).match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? cleanText(match[1]) : "";
}

function normalizeForFingerprint(text, contentType = "") {
  if (/pdf/i.test(contentType)) {
    return String(text);
  }

  return cleanText(
    String(text)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)?/gi, " ")
      .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/gi, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
  );
}

function classifyGuidanceChange(previous, currentFingerprint) {
  if (!previous) return "new_watch_item";

  if (
    previous.currentFingerprint &&
    previous.currentFingerprint !== currentFingerprint
  ) {
    return "changed_since_last_refresh";
  }

  if (
    previous.sourceFingerprint &&
    previous.sourceFingerprint !== currentFingerprint
  ) {
    return "changed_since_last_refresh";
  }

  return "no_change_detected";
}

function extractLinksFromHtml(html, baseUrl) {
  return [...String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => {
      try {
        return {
          url: normalizeUrl(new URL(m[1], baseUrl).toString()),
          title: cleanText(m[2])
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((link) => /^https?:\/\//i.test(link.url));
}

function isRelevantGuidanceLink(link, source) {
  const text = `${link.title || ""} ${link.url || ""}`;
  const patterns = source.linkPatterns || DEFAULT_GUIDANCE_LINK_PATTERNS;
  return patterns.some((pattern) => pattern.test(text));
}

function guidanceFingerprintPayload(fetched) {
  if (/pdf/i.test(fetched.contentType)) {
    return fetched.rawFingerprint;
  }

  return normalizeForFingerprint(fetched.text, fetched.contentType);
}

function makeGuidanceWatchItem({
  source,
  url,
  title,
  fetched,
  existingItems,
  parentName = null,
  queryTag = "Guidance watch"
}) {
  const normalizedUrl = normalizeUrl(url);
  const id = sha256(normalizedUrl);
  const currentFingerprint = sha256(guidanceFingerprintPayload(fetched)).slice(0, 32);
  const previous = existingItems.find((item) => item.id === id);
  const updateStatus = classifyGuidanceChange(previous, currentFingerprint);

  const item = makeItem({
    topic: source.topic,
    sourceType: "guidance",
    title: title || source.name,
    url: normalizedUrl,
    source: parentName ? `${source.name} — linked document` : source.name,
    date: fetched.lastModified || isoDate(NOW),
    jurisdiction: source.jurisdiction,
    sourceFingerprint: currentFingerprint,
    queryTag,
    whyItMatters:
      updateStatus === "changed_since_last_refresh"
        ? `Potential measles/MMR recommendation update detected in ${source.name}. Review for changes related to pregnancy, post-exposure management, accelerated scheduling, catch-up, or minimum dose intervals.`
        : source.why || "Monitored source for measles/MMR guidance and schedule changes."
  });

  return {
    ...item,
    id,
    sourceScope: source.sourceScope || "Guidance watch",
    updateStatus,
    changedAt:
      updateStatus === "changed_since_last_refresh" ||
      updateStatus === "new_watch_item"
        ? NOW.toISOString()
        : previous?.changedAt || null,
    previousFingerprint:
      previous?.currentFingerprint || previous?.sourceFingerprint || null,
    currentFingerprint,
    parentSource: parentName,
    previousFetchedAt: previous?.fetchedAt || null
  };
}

async function fetchGuidanceWatchSources(existingItems = [], sources = []) {
  const items = [];

  for (const source of sources) {
    const result = await safe(`guidance watch ${source.name}`, async () => {
      const fetched = await fetchText(source.url);
      const htmlTitle = extractHtmlTitle(fetched.text);

      const baseItem = makeGuidanceWatchItem({
        source,
        url: source.url,
        title: htmlTitle || source.name,
        fetched,
        existingItems,
        queryTag: source.sourceScope || "Guidance watch"
      });

      const out = [baseItem];

      const shouldFollowLinks =
        source.followLinks &&
        /html|text/i.test(fetched.contentType || "") &&
        fetched.text;

      if (shouldFollowLinks) {
        const links = extractLinksFromHtml(fetched.text, source.url)
          .filter((link) => isRelevantGuidanceLink(link, source))
          .filter((link, index, arr) =>
            arr.findIndex((x) => x.url === link.url) === index
          )
          .slice(0, 25);

        for (const link of links) {
          const linkedItems = await safe(`linked guidance ${link.url}`, async () => {
            const linkedFetched = await fetchText(link.url);

            return [
              makeGuidanceWatchItem({
                source,
                url: link.url,
                title: link.title || `${source.name} linked document`,
                fetched: linkedFetched,
                existingItems,
                parentName: source.name,
                queryTag: "Linked NITAG/guidance document watch"
              })
            ];
          });

          out.push(...linkedItems);
          await sleep(200);
        }
      }

      return out;
    });

    items.push(...result);
    await sleep(300);
  }

  return items;
}

function relevantToTopicText(text, topic) {
  const rules = TOPICS[topic]?.include || [];
  return rules.every((rule) => rule.test(text));
}

function relevantToTopic(item, topic) {
  if (item.sourceType === "guidance") return true;

  const text = `${item.title} ${item.abstract || ""} ${item.source || ""} ${item.queryTag || ""}`;
  return relevantToTopicText(text, topic);
}

async function readExisting() {
  try {
    const raw = await fs.readFile(OUTFILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function main() {
  const existing = await readExisting();
  const fresh = [];

  for (const [topic, config] of Object.entries(TOPICS)) {
    for (const query of config.pubmed) {
      fresh.push(...await safe(`PubMed ${topic}`, () => searchPubMed(topic, query)));
      await sleep(350);
    }

    for (const query of config.europepmc) {
      fresh.push(...await safe(`Europe PMC ${topic}`, () => searchEuropePmc(topic, query)));
      await sleep(350);
    }

    for (const server of ["medrxiv", "biorxiv"]) {
      fresh.push(...await safe(`${server} ${topic}`, () => searchPreprintServer(topic, server)));
      await sleep(350);
    }

    for (const query of config.news) {
      fresh.push(...await safe(`GDELT ${topic}`, () => searchGdelt(topic, query)));
      await sleep(350);
    }
  }

  fresh.push(...await fetchCuratedNewsSources());
  fresh.push(...await searchPriorityDomainsViaGdelt());

  fresh.push(
    ...await fetchGuidanceWatchSources(existing, [
      ...NITAG_WATCH_SOURCES,
      ...CANADIAN_PROVINCIAL_SCHEDULE_WATCH_SOURCES
    ])
  );

  const filteredFresh = fresh.filter((item) => relevantToTopic(item, item.topic));

  const merged = new Map();

  for (const oldItem of existing) {
    merged.set(oldItem.id, oldItem);
  }

  for (const item of filteredFresh) {
    const previous = merged.get(item.id);

    merged.set(item.id, {
      ...previous,
      ...item,
      firstSeenAt: previous?.firstSeenAt || item.fetchedAt,
      reviewStatus: previous?.reviewStatus || "unreviewed",
      reviewerNotes: previous?.reviewerNotes || ""
    });
  }

  const items = [...merged.values()]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_ITEMS);

  const output = {
    updatedAt: NOW.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    itemCount: items.length,
    topics: Object.fromEntries(
      Object.entries(TOPICS).map(([key, value]) => [key, value.label])
    ),
    items
  };

  await fs.mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await fs.writeFile(OUTFILE, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`Wrote ${items.length} evidence items to public/data/evidence.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

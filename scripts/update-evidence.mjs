#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const OUTFILE = new URL("../public/data/evidence.json", import.meta.url);
const LOOKBACK_DAYS = Number(process.env.EVIDENCE_LOOKBACK_DAYS || 90);
const MAX_ITEMS = Number(process.env.MAX_EVIDENCE_ITEMS || 2500);
const NCBI_EMAIL = process.env.NCBI_EMAIL || "";
const NOW = new Date();
const TOOL_NAME = "measles-evidence-dashboard";

const TOPICS = {
  general: {
    label: "All measles intelligence",
    pubmed: [
      '("measles"[Title/Abstract] OR "morbilli"[Title/Abstract] OR "MMR"[Title/Abstract] OR "MMRV"[Title/Abstract] OR "measles vaccine"[Title/Abstract])'
    ],
    europepmc: [
      '(TITLE_ABS:measles OR TITLE_ABS:morbilli OR TITLE_ABS:MMR OR TITLE_ABS:MMRV OR TITLE_ABS:"measles vaccine")'
    ],
    news: [
      'measles outbreak OR measles cases OR measles surveillance OR MMR vaccine',
      'measles vaccine OR MMR OR MMRV',
      'measles misinformation OR vitamin A measles OR cod liver oil measles'
    ]
  },
  pregnancy: {
    label: "Pregnancy / exposure management",
    pubmed: [
      '("measles"[Title/Abstract] OR "morbilli"[Title/Abstract] OR "MMR"[Title/Abstract]) AND (pregnan*[Title/Abstract] OR maternal[Title/Abstract] OR fetus[Title/Abstract] OR fetal[Title/Abstract] OR foetal[Title/Abstract] OR obstetric*[Title/Abstract] OR neonatal[Title/Abstract] OR congenital[Title/Abstract] OR "post-exposure prophylaxis"[Title/Abstract] OR immunoglobulin[Title/Abstract] OR "immune globulin"[Title/Abstract])'
    ],
    europepmc: [
      '(TITLE_ABS:measles OR TITLE_ABS:morbilli OR TITLE_ABS:MMR) AND (TITLE_ABS:pregnan* OR TITLE_ABS:maternal OR TITLE_ABS:fetal OR TITLE_ABS:foetal OR TITLE_ABS:obstetric* OR TITLE_ABS:neonatal OR TITLE_ABS:congenital OR TITLE_ABS:"immune globulin" OR TITLE_ABS:immunoglobulin OR TITLE_ABS:"post-exposure prophylaxis")'
    ],
    news: [
      'measles pregnant OR measles pregnancy OR measles maternal',
      'measles pregnant women outbreak',
      'MMR pregnancy measles outbreak'
    ]
  },
  interval: {
    label: "Dose interval / accelerated schedule",
    pubmed: [
      '("measles vaccine"[Title/Abstract] OR "measles-mumps-rubella vaccine"[Title/Abstract] OR MMR[Title/Abstract] OR MMRV[Title/Abstract]) AND ("second dose"[Title/Abstract] OR interval[Title/Abstract] OR schedule[Title/Abstract] OR accelerated[Title/Abstract] OR "dose spacing"[Title/Abstract] OR "28 days"[Title/Abstract] OR "4 weeks"[Title/Abstract] OR immunogenicity[Title/Abstract] OR effectiveness[Title/Abstract])'
    ],
    europepmc: [
      '(TITLE_ABS:"measles vaccine" OR TITLE_ABS:"measles-mumps-rubella vaccine" OR TITLE_ABS:MMR OR TITLE_ABS:MMRV) AND (TITLE_ABS:"second dose" OR TITLE_ABS:interval OR TITLE_ABS:schedule OR TITLE_ABS:accelerated OR TITLE_ABS:"dose spacing" OR TITLE_ABS:"28 days" OR TITLE_ABS:"4 weeks" OR TITLE_ABS:immunogenicity OR TITLE_ABS:effectiveness)'
    ],
    news: [
      'measles vaccine second dose interval',
      'MMR second dose early outbreak',
      'measles vaccine accelerated schedule'
    ]
  }
};

const CURATED_NEWS_SOURCES = [
  { name: "CBC Health", jurisdiction: "Canada", type: "rss", url: "https://www.cbc.ca/webfeed/rss/rss-health" },
  { name: "CBC Canada", jurisdiction: "Canada", type: "rss", url: "https://www.cbc.ca/webfeed/rss/rss-canada" },
  { name: "CIDRAP Measles", jurisdiction: "International", type: "html", url: "https://www.cidrap.umn.edu/measles" },
  { name: "STAT Health", jurisdiction: "United States", type: "rss", url: "https://www.statnews.com/feed/" },
  { name: "WHO Disease Outbreak News", jurisdiction: "Global", type: "html", url: "https://www.who.int/emergencies/disease-outbreak-news" },
  { name: "PAHO Epidemiological Alerts", jurisdiction: "Americas", type: "html", url: "https://www.paho.org/en/epidemiological-alerts-and-updates" },
  { name: "ECDC Measles", jurisdiction: "Europe", type: "html", url: "https://www.ecdc.europa.eu/en/measles" },
  { name: "ECDC Measles Surveillance", jurisdiction: "Europe", type: "html", url: "https://www.ecdc.europa.eu/en/measles/surveillance-and-disease-data" },
  { name: "CDC Measles Cases and Outbreaks", jurisdiction: "United States", type: "html", url: "https://www.cdc.gov/measles/data-research/index.html" },
  { name: "CDC MMWR", jurisdiction: "United States", type: "html", url: "https://www.cdc.gov/mmwr/index.html" },
  { name: "PHAC Measles and Rubella Monitoring", jurisdiction: "Canada", type: "html", url: "https://health-infobase.canada.ca/measles-rubella/" }
];

const CANADIAN_PUBLIC_HEALTH_SOURCES = [
  { name: "PHAC Measles and Rubella Monitoring", jurisdiction: "Canada", url: "https://health-infobase.canada.ca/measles-rubella/" },
  { name: "Canada.ca Measles", jurisdiction: "Canada", url: "https://www.canada.ca/en/public-health/services/diseases/measles.html" },
  { name: "Public Health Ontario Measles", jurisdiction: "Ontario, Canada", url: "https://www.publichealthontario.ca/en/Diseases-and-Conditions/Infectious-Diseases/Vaccine-Preventable-Diseases/Measles" },
  { name: "Ontario Measles", jurisdiction: "Ontario, Canada", url: "https://www.ontario.ca/page/measles" },
  { name: "Quebec Measles", jurisdiction: "Quebec, Canada", url: "https://www.quebec.ca/en/health/health-issues/a-z/measles" },
  { name: "Alberta Measles", jurisdiction: "Alberta, Canada", url: "https://www.alberta.ca/measles" },
  { name: "Alberta Health Services Measles", jurisdiction: "Alberta, Canada", url: "https://www.albertahealthservices.ca/topics/Page17271.aspx" },
  { name: "BCCDC Measles", jurisdiction: "British Columbia, Canada", url: "https://www.bccdc.ca/health-info/diseases-conditions/measles" },
  { name: "Manitoba Measles", jurisdiction: "Manitoba, Canada", url: "https://www.gov.mb.ca/health/publichealth/diseases/measles.html" },
  { name: "Saskatchewan Immunization Services", jurisdiction: "Saskatchewan, Canada", url: "https://www.saskatchewan.ca/residents/health/accessing-health-care-services/immunization-services" },
  { name: "Nova Scotia Immunization", jurisdiction: "Nova Scotia, Canada", url: "https://novascotia.ca/dhw/cdpc/immunization.asp" },
  { name: "New Brunswick Immunization", jurisdiction: "New Brunswick, Canada", url: "https://www.gnb.ca/en/topic/health-wellness/immunization-vaccination.html" },
  { name: "PEI Immunization", jurisdiction: "Prince Edward Island, Canada", url: "https://www.princeedwardisland.ca/en/topic/immunization" },
  { name: "Newfoundland and Labrador Immunization", jurisdiction: "Newfoundland and Labrador, Canada", url: "https://www.gov.nl.ca/hcs/publichealth/cdc/immunizations/" },
  { name: "Yukon Immunization", jurisdiction: "Yukon, Canada", url: "https://yukonimmunization.ca/" },
  { name: "Northwest Territories Immunization", jurisdiction: "Northwest Territories, Canada", url: "https://www.hss.gov.nt.ca/en/services/immunization" },
  { name: "Nunavut Health", jurisdiction: "Nunavut, Canada", url: "https://www.gov.nu.ca/health" }
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
  "ontario.ca",
  "quebec.ca",
  "alberta.ca",
  "albertahealthservices.ca",
  "bccdc.ca",
  "gov.mb.ca",
  "saskatchewan.ca",
  "novascotia.ca",
  "gnb.ca",
  "princeedwardisland.ca",
  "gov.nl.ca",
  "yukonimmunization.ca",
  "hss.gov.nt.ca",
  "gov.nu.ca",
  "gov.uk"
];

const DEFAULT_GUIDANCE_LINK_PATTERNS = [
  /measles|morbilli|masern|rougeole|MMR|MMRV|ROR/i,
  /vaccine|vaccination|immuni[sz]ation|impfung|calendrier|schedule|recommendation|statement|guidance|guideline/i
];

const GUIDANCE_WATCH_SOURCES = [
  {
    name: "NACI Canada — Statements and publications page",
    jurisdiction: "Canada",
    topic: "general",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.canada.ca/en/public-health/services/immunization/national-advisory-committee-on-immunization-naci.html",
    followLinks: true,
    linkPatterns: [/measles|rubella|mumps|MMR|MMRV|post-exposure|prophylaxis|vaccin/i],
    why: "Monitors NACI statements for new or changed measles/MMR recommendation documents."
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
    name: "Canada — CIG pregnancy and breastfeeding",
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
    name: "Canada — Provincial and territorial routine schedules",
    jurisdiction: "Canada",
    topic: "interval",
    sourceScope: "Canadian provincial/territorial schedule watch",
    url: "https://www.canada.ca/en/public-health/services/immunization-vaccines/provincial-territorial-routine-vaccination-programs-infants-children.html",
    followLinks: false,
    why: "Monitors PHAC provincial and territorial routine schedule table."
  },
  {
    name: "ACIP / CDC Measles vaccine recommendations",
    jurisdiction: "United States",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.cdc.gov/measles/hcp/vaccine-considerations/index.html",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|second dose|schedule|recommendation|ACIP/i],
    why: "Monitors CDC/ACIP measles vaccine recommendation pages."
  },
  {
    name: "ACOG Measles outbreak guidance for obstetric patients",
    jurisdiction: "United States",
    topic: "pregnancy",
    sourceScope: "Clinical guidance watch",
    url: "https://www.acog.org/clinical/clinical-guidance/practice-advisory/articles/2024/03/management-of-obstetric-gynecologic-patients-during-a-measles-outbreak",
    followLinks: false,
    why: "Monitors obstetric measles outbreak guidance for changes relevant to pregnancy and immune globulin."
  },
  {
    name: "STIKO Germany — Recommendations",
    jurisdiction: "Germany",
    topic: "interval",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.rki.de/EN/Topics/Infectious-diseases/Immunisation/STIKO/STIKO-recommendations/Downloads/STIKO_Recommendations.pdf?__blob=publicationFile&v=1",
    followLinks: false,
    why: "Monitors STIKO recommendations for changes to measles/MMR schedules."
  },
  {
    name: "HAS France — Vaccination topic page",
    jurisdiction: "France",
    topic: "general",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.has-sante.fr/jcms/c_2742985/fr/vaccination",
    followLinks: true,
    linkPatterns: [/rougeole|ROR|vaccination|calendrier|recommandation|avis/i],
    why: "Monitors HAS vaccination recommendation activity."
  },
  {
    name: "NIAC Ireland — Immunisation Guidelines",
    jurisdiction: "Ireland",
    topic: "general",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.hiqa.ie/areas-we-work/national-immunisation-advisory-committee/immunisation-guidelines-ireland",
    followLinks: true,
    linkPatterns: [/measles|MMR|mumps|rubella|immunisation|guidelines|recommendations/i],
    why: "Monitors NIAC guideline landing page for new or changed immunisation guidance."
  },
  {
    name: "JCVI United Kingdom — Committee page",
    jurisdiction: "United Kingdom",
    topic: "general",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.gov.uk/government/groups/joint-committee-on-vaccination-and-immunisation",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|childhood immunisation|vaccination schedule|JCVI statement/i],
    why: "Monitors JCVI statements relevant to MMR/MMRV schedule timing."
  },
  {
    name: "UK Green Book — Measles chapter",
    jurisdiction: "United Kingdom",
    topic: "general",
    sourceScope: "National guidance watch",
    url: "https://www.gov.uk/government/publications/measles-the-green-book-chapter-21",
    followLinks: true,
    linkPatterns: [/measles|green book|MMR|MMRV|chapter 21/i],
    why: "Monitors UK measles guidance for changes to MMR timing and post-exposure guidance."
  },
  {
    name: "ATAGI Australia — Statements page",
    jurisdiction: "Australia",
    topic: "general",
    sourceScope: "NITAG recommendation watch",
    url: "https://www.health.gov.au/committees-and-groups/atagi/statements?language=en",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|immunisation|annual statement|ATAGI/i],
    why: "Monitors ATAGI statements for measles/MMR policy advice."
  },
  {
    name: "Australia — Immunisation Handbook measles chapter",
    jurisdiction: "Australia",
    topic: "general",
    sourceScope: "National guidance watch",
    url: "https://immunisationhandbook.health.gov.au/measles",
    followLinks: true,
    linkPatterns: [/measles|MMR|MMRV|recommendations|post-exposure|pregnancy/i],
    why: "Monitors Australian Handbook measles guidance."
  },
  {
    name: "WHO — SAGE main page",
    jurisdiction: "Global",
    topic: "general",
    sourceScope: "SAGE recommendation watch",
    url: "https://www.who.int/groups/strategic-advisory-group-of-experts-on-immunization",
    followLinks: true,
    linkPatterns: [/measles|rubella|MMR|SAGE|meeting|recommendations|position paper/i],
    why: "Monitors WHO SAGE meeting reports and recommendation updates."
  },
  {
    name: "WHO — Vaccine position papers",
    jurisdiction: "Global",
    topic: "general",
    sourceScope: "SAGE / WHO position paper watch",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/policies/position-papers",
    followLinks: true,
    linkPatterns: [/measles|rubella|MMR|position paper|vaccine/i],
    why: "Monitors WHO vaccine position papers for measles or rubella-containing vaccine recommendations."
  }
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

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return isoDate(parsed);

  const year = s.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `${year}-01-01` : isoDate(NOW);
}

function isRecentDate(value, days = LOOKBACK_DAYS) {
  if (!value) return false;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;

  const ageDays = Math.floor((NOW.getTime() - d.getTime()) / 86_400_000);
  return ageDays >= 0 && ageDays <= days;
}

function extractSourceDates(html = "", fallback = null) {
  const text = String(html);

  const dateValue =
    '([^"\\']+|\\d{4}-\\d{2}-\\d{2}|[A-Z][a-z]+ \\d{1,2}, \\d{4})';

  const publishedPatterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']dcterms\.created["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']dcterms\.issued["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']created["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"published"\s*:\s*"([^"]+)"/i,
    /"issued"\s*:\s*"([^"]+)"/i,
    /\b(?:Published|Date posted|Date created|Created|Issued|Publication date|Release date)[:\s]+([A-Z][a-z]+ \d{1,2}, \d{4})/i,
    /\b(?:Published|Date posted|Date created|Created|Issued|Publication date|Release date)[:\s]+(\d{4}-\d{2}-\d{2})/i
  ];

  const modifiedPatterns = [
    /<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']dcterms\.modified["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']modified["'][^>]+content=["']([^"']+)["']/i,
    /"dateModified"\s*:\s*"([^"]+)"/i,
    /"modified"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /\b(?:Updated|Last updated|Modified|Date modified)[:\s]+([A-Z][a-z]+ \d{1,2}, \d{4})/i,
    /\b(?:Updated|Last updated|Modified|Date modified)[:\s]+(\d{4}-\d{2}-\d{2})/i
  ];

  const findDate = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return normalizeDate(match[1]);
    }
    return null;
  };

  return {
    publishedDate: findDate(publishedPatterns),
    modifiedDate: findDate(modifiedPatterns) || (fallback ? normalizeDate(fallback) : null)
  };
}

function chooseSourceDate(dates) {
  return dates.publishedDate || dates.modifiedDate || null;
}

function chooseDateBasis(dates) {
  if (dates.publishedDate) return "published_date";
  if (dates.modifiedDate) return "modified_date";
  return "first_seen_or_fetch_date";
}

function hasMeaslesSignal(text = "") {
  return /measles|morbilli|MMR|MMRV|rougeole|masern|ROR/i.test(text);
}

function hasPregnancySignal(text = "") {
  return /pregnan|maternal|fetal|foetal|fetus|foetus|obstetric|neonatal|congenital|post.?exposure|immune globulin|immunoglobulin/i.test(text);
}

function hasIntervalSignal(text = "") {
  return /second dose|dose interval|minimum interval|accelerated|schedule|dose spacing|28 days|4 weeks|school entry|immunogenicity|effectiveness|early second/i.test(text);
}

function detectSilos(text = "", forcedTopic = "general") {
  const silos = new Set(["general"]);

  if (hasPregnancySignal(text) || forcedTopic === "pregnancy") silos.add("pregnancy");
  if (hasIntervalSignal(text) || forcedTopic === "interval") silos.add("interval");

  return [...silos];
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

function isCanadaJurisdiction(jurisdiction = "") {
  return /canada|ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/i.test(jurisdiction);
}

function isProvincialCanadian(jurisdiction = "") {
  return /ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/i.test(jurisdiction);
}

function shouldDisplayCanadianLinkedItem({ title = "", url = "", dates }) {
  const text = `${title} ${url}`;
  const active = /outbreak|exposure|case|surveillance|epi|summary|report|alert|advisory|notice|dashboard|weekly/i.test(text);

  if (dates.publishedDate) return isRecentDate(dates.publishedDate);
  if (dates.modifiedDate) return isRecentDate(dates.modifiedDate) && active;

  return active;
}

function inferSignal(topic, title, abstract = "") {
  const t = `${title} ${abstract}`.toLowerCase();

  if (hasPregnancySignal(t)) {
    if (/post.?exposure|immune globulin|immunoglobulin|igiv|igim/.test(t)) {
      return "Pregnancy / post-exposure prophylaxis signal";
    }
    return "Pregnancy or maternal-fetal measles signal";
  }

  if (hasIntervalSignal(t)) {
    if (/28 days|4 weeks|minimum interval|early second|accelerated/.test(t)) {
      return "Minimum or shortened second-dose interval signal";
    }
    return "Schedule, interval, immunogenicity, or effectiveness signal";
  }

  if (/outbreak|cluster|exposure|case|surveillance|epi|epidemiolog/.test(t)) {
    return "Measles outbreak, exposure, or surveillance signal";
  }

  if (/misinformation|vitamin a|cod liver|treatment|searches|communication/.test(t)) {
    return "Measles misinformation, treatment narrative, or public communications signal";
  }

  if (/vaccine|vaccination|MMR|MMRV|immunization|immunisation/.test(t)) {
    return "Measles immunization program signal";
  }

  return "General measles intelligence signal";
}

function sourceTypeFromResult(result) {
  const joined = `${result.source || ""} ${result.journalTitle || ""} ${result.title || ""}`.toLowerCase();
  if (/preprint|medrxiv|biorxiv|\bppr\b/.test(joined)) return "preprint";
  return "publication";
}

function priorityScoreFor(item) {
  let score = 0;

  if (item.sourceType === "guidance" && item.updateStatus === "changed_since_last_refresh") score += 120;
  if (isProvincialCanadian(item.jurisdiction)) score += 100;
  else if (isCanadaJurisdiction(item.jurisdiction)) score += 85;

  if (item.silos?.includes("pregnancy")) score += 35;
  if (item.silos?.includes("interval")) score += 35;

  if (item.sourceType === "outbreak") score += 30;
  if (item.sourceType === "news") score += 15;
  if (item.sourceType === "publication" || item.sourceType === "preprint") score += 10;

  return score;
}

function makeItem(raw) {
  const url = normalizeUrl(raw.url);
  const id = sha256(url || `${raw.title}-${raw.date}-${raw.source}`);
  const title = clamp(raw.title, 280);
  const text = `${title} ${raw.abstract || ""} ${raw.source || ""} ${url}`;
  const silos = raw.silos || detectSilos(text, raw.topic || "general");
  const jurisdiction = raw.jurisdiction || inferJurisdiction(`${title} ${raw.source} ${url}`);
  const topic =
    raw.topic ||
    (silos.includes("pregnancy")
      ? "pregnancy"
      : silos.includes("interval")
        ? "interval"
        : "general");

  const normalizedDate = normalizeDate(raw.date);
  const sourceDate = raw.sourceDate ? normalizeDate(raw.sourceDate) : normalizedDate;

  const item = {
    id,
    topic,
    topicLabel: TOPICS[topic]?.label || TOPICS.general.label,
    silos,
    sourceType: raw.sourceType,
    title,
    url,
    source: clamp(raw.source || "Unknown source", 180),
    date: normalizedDate,
    sourceDate,
    publishedDate: raw.publishedDate ? normalizeDate(raw.publishedDate) : null,
    modifiedDate: raw.modifiedDate ? normalizeDate(raw.modifiedDate) : null,
    dateBasis: raw.dateBasis || "source_or_fallback_date",
    jurisdiction,
    evidenceSignal: raw.evidenceSignal || inferSignal(topic, title, raw.abstract),
    whyItMatters: clamp(raw.whyItMatters || inferSignal(topic, title, raw.abstract), 560),
    abstract: clamp(raw.abstract || "", 1200),
    queryTag: raw.queryTag || null,
    sourceFingerprint: raw.sourceFingerprint || null,
    displayInDashboard: raw.displayInDashboard !== false,
    updateStatus: raw.updateStatus || null,
    sourceScope: raw.sourceScope || null,
    currentFingerprint: raw.currentFingerprint || null,
    previousFingerprint: raw.previousFingerprint || null,
    changedAt: raw.changedAt || null,
    parentSource: raw.parentSource || null,
    fetchedAt: NOW.toISOString()
  };

  item.priorityScore = raw.priorityScore ?? priorityScoreFor(item);
  return item;
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
    retmax: "80",
    sort: "pub_date",
    datetype: "pdat",
    mindate: from,
    maxdate: to,
    tool: TOOL_NAME
  });

  if (NCBI_EMAIL) params.set("email", NCBI_EMAIL);

  const search = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`);
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

  const summary = await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`);

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
        dateBasis: "published_date"
      });
    })
    .filter((item) => hasMeaslesSignal(`${item.title} ${item.abstract}`));
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
    pageSize: "90",
    sort_date: "y"
  });

  const data = await fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`);
  const results = data?.resultList?.result || [];

  return results
    .map((r) => {
      const title = cleanText(r.title);
      const abstract = cleanText(r.abstractText || "");

      return makeItem({
        topic,
        sourceType: sourceTypeFromResult(r),
        title,
        url: europePmcUrl(r),
        source: r.journalTitle || r.source || "Europe PMC",
        date: r.firstPublicationDate || r.firstIndexDate || r.pubYear,
        sourceDate: r.firstPublicationDate || r.firstIndexDate || null,
        publishedDate: r.firstPublicationDate || null,
        abstract,
        queryTag: "Europe PMC",
        dateBasis: "published_date"
      });
    })
    .filter((item) => hasMeaslesSignal(`${item.title} ${item.abstract}`));
}

async function searchPreprintServer(topic, server) {
  const from = daysAgo(LOOKBACK_DAYS);
  const to = isoDate(NOW);
  const out = [];

  for (const cursor of [0, 100, 200]) {
    const data = await fetchJson(`https://api.biorxiv.org/details/${server}/${from}/${to}/${cursor}`);
    const records = data?.collection || [];
    if (!records.length) break;

    for (const r of records) {
      const title = cleanText(r.title || "");
      const abstract = cleanText(r.abstract || "");
      const text = `${title} ${abstract}`;

      if (!hasMeaslesSignal(text)) continue;
      if (topic === "pregnancy" && !hasPregnancySignal(text)) continue;
      if (topic === "interval" && !hasIntervalSignal(text)) continue;

      out.push(
        makeItem({
          topic,
          sourceType: "preprint",
          title,
          url: r.doi ? `https://doi.org/${r.doi}` : `https://www.${server}.org/`,
          source: server === "medrxiv" ? "medRxiv" : "bioRxiv",
          date: r.date || r.post_date || isoDate(NOW),
          sourceDate: r.date || r.post_date || null,
          publishedDate: r.date || r.post_date || null,
          abstract,
          queryTag: `${server} API`,
          dateBasis: "published_date"
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
    maxrecords: "100",
    timespan: `${Math.min(LOOKBACK_DAYS, 30)}d`
  });

  const data = await fetchJson(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`);
  const articles = data?.articles || [];

  return articles
    .filter((a) => a.url && a.title)
    .map((a) => {
      const title = cleanText(a.title);
      const text = `${title} ${a.domain || ""} ${a.sourcecountry || ""} ${a.url || ""}`;
      const isOutbreak = /outbreak|cluster|exposure|case|surveillance|epi/.test(text.toLowerCase());

      return makeItem({
        topic,
        sourceType: isOutbreak ? "outbreak" : "news",
        title,
        url: a.url,
        source: a.domain || "GDELT-indexed news",
        date: a.seendate,
        sourceDate: a.seendate,
        publishedDate: a.seendate,
        jurisdiction: inferJurisdiction(text, a.sourcecountry || "International"),
        queryTag: "GDELT news",
        dateBasis: "published_date"
      });
    })
    .filter((item) => hasMeaslesSignal(`${item.title} ${item.url}`));
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

function inferTopicForNews(title = "", description = "") {
  const text = `${title} ${description}`;
  if (hasPregnancySignal(text)) return "pregnancy";
  if (hasIntervalSignal(text)) return "interval";
  return "general";
}

function extractHtmlTitle(html) {
  const match = String(html).match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? cleanText(match[1]) : "";
}

async function fetchCuratedNewsSources() {
  const items = [];

  for (const source of CURATED_NEWS_SOURCES) {
    const result = await safe(`curated news ${source.name}`, async () => {
      const { text, lastModified } = await fetchText(source.url);

      if (source.type === "rss") {
        return parseRssItems(text)
          .filter((entry) => hasMeaslesSignal(`${entry.title} ${entry.description} ${entry.url}`))
          .map((entry) => {
            const topic = inferTopicForNews(entry.title, entry.description);

            return makeItem({
              topic,
              sourceType: /outbreak|case|exposure|cluster|surveillance|epi/i.test(`${entry.title} ${entry.description}`)
                ? "outbreak"
                : "news",
              title: entry.title,
              url: entry.url,
              source: source.name,
              date: entry.date || lastModified || isoDate(NOW),
              sourceDate: entry.date || lastModified || null,
              publishedDate: entry.date || null,
              modifiedDate: lastModified || null,
              jurisdiction: source.jurisdiction,
              abstract: entry.description,
              queryTag: "Curated news source",
              dateBasis: entry.date ? "published_date" : "modified_date"
            });
          });
      }

      const links = extractLinksFromHtml(text, source.url)
        .filter((link) => hasMeaslesSignal(`${link.title} ${link.url}`))
        .filter((link, index, arr) => arr.findIndex((x) => x.url === link.url) === index)
        .slice(0, 60);

      const linkedItems = [];

      for (const link of links) {
        const linkedResult = await safe(`curated linked page ${link.url}`, async () => {
          const linkedFetched = await fetchText(link.url);
          const linkedTitle = extractHtmlTitle(linkedFetched.text) || link.title || source.name;
          const dates = extractSourceDates(linkedFetched.text, linkedFetched.lastModified);
          const sourceDate = chooseSourceDate(dates);
          const topic = inferTopicForNews(linkedTitle, link.url);

          return [
            makeItem({
              topic,
              sourceType: /outbreak|surveillance|disease-outbreak-news|epidemiological-alert|case|cluster|epi/i.test(`${linkedTitle} ${link.url}`)
                ? "outbreak"
                : "news",
              title: linkedTitle,
              url: link.url,
              source: source.name,
              date: sourceDate || linkedFetched.lastModified || lastModified || isoDate(NOW),
              sourceDate: sourceDate || null,
              publishedDate: dates.publishedDate || null,
              modifiedDate: dates.modifiedDate || null,
              jurisdiction: source.jurisdiction,
              queryTag: "Curated source linked page",
              dateBasis: chooseDateBasis(dates),
              displayInDashboard: sourceDate ? isRecentDate(sourceDate) : true,
              whyItMatters: `High-priority measles item from ${source.name}. Review for relevance to outbreaks, surveillance, immunization programs, pregnancy, exposure management, or dosing interval evidence.`
            })
          ];
        });

        linkedItems.push(...linkedResult);
        await sleep(150);
      }

      return linkedItems;
    });

    items.push(...result);
    await sleep(250);
  }

  return items;
}

async function fetchCanadianPublicHealthSources() {
  const items = [];

  for (const source of CANADIAN_PUBLIC_HEALTH_SOURCES) {
    const result = await safe(`Canadian public health ${source.name}`, async () => {
      const { text } = await fetchText(source.url);

      const links = extractLinksFromHtml(text, source.url)
        .filter((link) => hasMeaslesSignal(`${link.title} ${link.url}`))
        .filter((link, index, arr) => arr.findIndex((x) => x.url === link.url) === index)
        .slice(0, 75);

      const linkedItems = [];

      for (const link of links) {
        const linkedResult = await safe(`Canadian linked page ${link.url}`, async () => {
          const linkedFetched = await fetchText(link.url);
          const linkedTitle = extractHtmlTitle(linkedFetched.text) || link.title || source.name;
          const dates = extractSourceDates(linkedFetched.text, linkedFetched.lastModified);
          const sourceDate = chooseSourceDate(dates);
          const dateBasis = chooseDateBasis(dates);

          const displayInDashboard = shouldDisplayCanadianLinkedItem({
            title: linkedTitle,
            url: link.url,
            dates
          });

          const topic = inferTopicForNews(linkedTitle, link.url);

          return [
            makeItem({
              topic,
              sourceType: /outbreak|surveillance|exposure|case|epi|summary|report|alert|advisory|notice/i.test(`${linkedTitle} ${link.url}`)
                ? "outbreak"
                : "news",
              title: linkedTitle,
              url: link.url,
              source: source.name,
              date: sourceDate || isoDate(NOW),
              sourceDate: sourceDate || null,
              publishedDate: dates.publishedDate || null,
              modifiedDate: dates.modifiedDate || null,
              dateBasis,
              displayInDashboard,
              jurisdiction: source.jurisdiction,
              queryTag: displayInDashboard
                ? "Canadian public health linked update"
                : "Canadian public health monitored older/background item",
              whyItMatters: displayInDashboard
                ? "Canadian provincial/territorial or national public health measles update. Prioritize review for Canadian situational awareness."
                : "Canadian public health measles resource is monitored but hidden from the main dashboard because its source date is outside the active lookback window."
            })
          ];
        });

        linkedItems.push(...linkedResult);
        await sleep(150);
      }

      return linkedItems;
    });

    items.push(...result);
    await sleep(250);
  }

  return items;
}

async function searchPriorityDomainsViaGdelt() {
  const items = [];

  for (const domain of GDELT_PRIORITY_DOMAINS) {
    const result = await safe(`GDELT priority ${domain}`, () =>
      searchGdelt("general", `(measles OR MMR OR MMRV OR morbilli) domain:${domain}`)
    );

    items.push(
      ...result.map((item) => ({
        ...item,
        queryTag: `Priority source via GDELT: ${domain}`
      }))
    );

    await sleep(250);
  }

  return items;
}

function normalizeForFingerprint(text, contentType = "") {
  if (/pdf/i.test(contentType)) return String(text);

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

function guidanceFingerprintPayload(fetched) {
  if (/pdf/i.test(fetched.contentType)) return fetched.rawFingerprint;
  return normalizeForFingerprint(fetched.text, fetched.contentType);
}

function classifyGuidanceChange(previous, currentFingerprint) {
  if (!previous) return "new_watch_item";

  if (previous.currentFingerprint && previous.currentFingerprint !== currentFingerprint) {
    return "changed_since_last_refresh";
  }

  if (previous.sourceFingerprint && previous.sourceFingerprint !== currentFingerprint) {
    return "changed_since_last_refresh";
  }

  return "no_change_detected";
}

function isRelevantGuidanceLink(link, source) {
  const text = `${link.title || ""} ${link.url || ""}`;
  const patterns = source.linkPatterns || DEFAULT_GUIDANCE_LINK_PATTERNS;
  return patterns.some((pattern) => pattern.test(text));
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
  const changed = updateStatus === "changed_since_last_refresh";

  const dates = extractSourceDates(fetched.text, fetched.lastModified);
  const sourceDate = chooseSourceDate(dates);

  const item = makeItem({
    topic: source.topic || "general",
    sourceType: "guidance",
    title: title || source.name,
    url: normalizedUrl,
    source: parentName ? `${source.name} — linked document` : source.name,
    date: sourceDate || fetched.lastModified || isoDate(NOW),
    sourceDate: sourceDate || null,
    publishedDate: dates.publishedDate || null,
    modifiedDate: dates.modifiedDate || null,
    dateBasis: chooseDateBasis(dates),
    jurisdiction: source.jurisdiction,
    sourceFingerprint: currentFingerprint,
    queryTag,
    sourceScope: source.sourceScope || "Guidance watch",
    currentFingerprint,
    previousFingerprint: previous?.currentFingerprint || previous?.sourceFingerprint || null,
    changedAt: changed ? NOW.toISOString() : previous?.changedAt || null,
    parentSource: parentName,
    updateStatus,
    displayInDashboard: changed,
    whyItMatters: changed
      ? `Potential measles/MMR recommendation update detected in ${source.name}. Review for changes related to outbreaks, pregnancy, post-exposure management, accelerated scheduling, catch-up, or dose intervals.`
      : source.why || "Monitored guidance source. Hidden from dashboard unless a change is detected."
  });

  return {
    ...item,
    id,
    displayInDashboard: changed,
    priorityScore: changed ? priorityScoreFor(item) + 150 : priorityScoreFor(item)
  };
}

async function fetchGuidanceWatchSources(existingItems = []) {
  const items = [];

  for (const source of GUIDANCE_WATCH_SOURCES) {
    const result = await safe(`guidance watch ${source.name}`, async () => {
      const fetched = await fetchText(source.url);
      const htmlTitle = extractHtmlTitle(fetched.text);

      const out = [
        makeGuidanceWatchItem({
          source,
          url: source.url,
          title: htmlTitle || source.name,
          fetched,
          existingItems,
          queryTag: source.sourceScope || "Guidance watch"
        })
      ];

      const shouldFollowLinks =
        source.followLinks &&
        /html|text/i.test(fetched.contentType || "") &&
        fetched.text;

      if (shouldFollowLinks) {
        const links = extractLinksFromHtml(fetched.text, source.url)
          .filter((link) => isRelevantGuidanceLink(link, source))
          .filter((link, index, arr) => arr.findIndex((x) => x.url === link.url) === index)
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

function relevantToDashboard(item) {
  if (item.sourceType === "guidance") return true;
  return hasMeaslesSignal(`${item.title} ${item.abstract || ""} ${item.url || ""}`);
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
  fresh.push(...await fetchCanadianPublicHealthSources());
  fresh.push(...await searchPriorityDomainsViaGdelt());
  fresh.push(...await fetchGuidanceWatchSources(existing));

  const filteredFresh = fresh.filter(relevantToDashboard);
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
    .sort((a, b) => {
      const scoreDiff = Number(b.priorityScore || 0) - Number(a.priorityScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return String(b.date).localeCompare(String(a.date));
    })
    .slice(0, MAX_ITEMS);

  const output = {
    updatedAt: NOW.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    itemCount: items.length,
    visibleItemCount: items.filter((item) => item.displayInDashboard !== false).length,
    topics: Object.fromEntries(
      Object.entries(TOPICS).map(([key, value]) => [key, value.label])
    ),
    items
  };

  await fs.mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
  await fs.writeFile(OUTFILE, JSON.stringify(output, null, 2) + "\n", "utf8");

  console.log(`Wrote ${items.length} total records to public/data/evidence.json`);
  console.log(`${output.visibleItemCount} records visible on dashboard`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

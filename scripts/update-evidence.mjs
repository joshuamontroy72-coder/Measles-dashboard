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
      /second dose|interval|schedule|accelerated|dose spacing|28 days|4 weeks|immunogenicity|effectiveness|school entry/i
    ]
  }
};

const GUIDANCE_SOURCES = [
  {
    topic: "interval",
    title: "Canadian Immunization Guide: Measles vaccines",
    source: "Public Health Agency of Canada",
    jurisdiction: "Canada",
    url: "https://www.canada.ca/en/public-health/services/publications/healthy-living/canadian-immunization-guide-part-4-active-vaccines/page-12-measles-vaccine.html",
    why: "Tracks Canadian national guidance on routine, catch-up, accelerated, and outbreak-related measles-containing vaccine schedules."
  },
  {
    topic: "pregnancy",
    title: "Canadian Immunization Guide: Immunization in pregnancy and breastfeeding",
    source: "Public Health Agency of Canada",
    jurisdiction: "Canada",
    url: "https://www.canada.ca/en/public-health/services/publications/healthy-living/canadian-immunization-guide-part-3-vaccination-specific-populations/page-4-immunization-pregnancy-breastfeeding.html",
    why: "Tracks Canadian guidance on vaccines and immunoglobulin products in pregnancy, including post-exposure prophylaxis contexts."
  },
  {
    topic: "pregnancy",
    title: "ACOG: Management of obstetric-gynecologic patients during a measles outbreak",
    source: "ACOG",
    jurisdiction: "United States",
    url: "https://www.acog.org/clinical/clinical-guidance/practice-advisory/articles/2024/03/management-of-obstetric-gynecologic-patients-during-a-measles-outbreak",
    why: "Tracks obstetric guidance for exposed or infected pregnant patients during measles outbreaks."
  },
  {
    topic: "interval",
    title: "CDC: Measles vaccine recommendations",
    source: "CDC",
    jurisdiction: "United States",
    url: "https://www.cdc.gov/measles/hcp/vaccine-considerations/index.html",
    why: "Tracks ACIP/CDC operational guidance on routine and early second-dose administration."
  },
  {
    topic: "interval",
    title: "WHO: Measles vaccination and immunization guidance",
    source: "WHO",
    jurisdiction: "Global",
    url: "https://www.who.int/teams/immunization-vaccines-and-biologicals/diseases/measles",
    why: "Tracks global measles vaccine policy context, including two-dose programmatic strategies."
  },
  {
    topic: "interval",
    title: "UK Green Book: Measles",
    source: "UKHSA",
    jurisdiction: "United Kingdom",
    url: "https://www.gov.uk/government/publications/measles-the-green-book-chapter-21",
    why: "Tracks UK schedule and outbreak management guidance relevant to dose timing comparisons."
  },
  {
    topic: "interval",
    title: "Australian Immunisation Handbook: Measles",
    source: "Australian Government Department of Health and Aged Care",
    jurisdiction: "Australia",
    url: "https://immunisationhandbook.health.gov.au/contents/vaccine-preventable-diseases/measles",
    why: "Tracks Australian NITAG-style guidance relevant to routine and accelerated MMR schedules."
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
  return createHash("sha256").update(String(value)).digest("hex");
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

  const monthMap = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };
  const month = Object.entries(monthMap).find(([m]) =>
    new RegExp(`\\b${m}`, "i").test(s)
  )?.[1] || "01";

  const day = s.match(/\b([12]?\d|3[01])\b/)?.[1]?.padStart(2, "0") || "01";
  return `${year}-${month}-${day}`;
}

function inferJurisdiction(text, fallback = "International") {
  const t = String(text).toLowerCase();

  if (/canada|canadian|naci|phac|ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/.test(t)) {
    return "Canada";
  }
  if (/cdc|acip|united states|u\.s\.|usa/.test(t)) return "United States";
  if (/who|global/.test(t)) return "Global";
  if (/united kingdom|ukhsa|jcvi|green book/.test(t)) return "United Kingdom";
  if (/australia|atagi/.test(t)) return "Australia";
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
  if (/guidance|recommendation|schedule|school entry|routine/.test(t)) {
    return "Schedule recommendation signal";
  }
  return "Second-dose interval evidence signal";
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
    source: clamp(raw.source || "Unknown source", 140),
    date: normalizeDate(raw.date),
    jurisdiction: raw.jurisdiction || inferJurisdiction(`${title} ${raw.source} ${url}`),
    evidenceSignal: raw.evidenceSignal || inferSignal(raw.topic, title, raw.abstract),
    whyItMatters: clamp(raw.whyItMatters || inferSignal(raw.topic, title, raw.abstract), 420),
    abstract: clamp(raw.abstract || "", 1100),
    queryTag: raw.queryTag || null,
    sourceFingerprint: raw.sourceFingerprint || null,
    fetchedAt: NOW.toISOString()
  };
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
      "accept": "text/html,application/xhtml+xml,text/plain"
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return {
    text: await res.text(),
    lastModified: res.headers.get("last-modified")
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
      const isOutbreak = /outbreak|cluster|exposure|case/.test(text.toLowerCase());

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

function extractHtmlTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? cleanText(match[1]) : "";
}

async function fetchGuidancePages() {
  const items = [];

  for (const src of GUIDANCE_SOURCES) {
    const result = await safe(`guidance ${src.url}`, async () => {
      const { text, lastModified } = await fetchText(src.url);
      const fingerprint = sha256(text).slice(0, 24);
      const htmlTitle = extractHtmlTitle(text);

      return [
        makeItem({
          topic: src.topic,
          sourceType: "guidance",
          title: htmlTitle || src.title,
          url: src.url,
          source: src.source,
          date: lastModified || isoDate(NOW),
          jurisdiction: src.jurisdiction,
          sourceFingerprint: fingerprint,
          queryTag: "Monitored guidance",
          whyItMatters: src.why
        })
      ];
    });

    items.push(...result);
    await sleep(250);
  }

  return items;
}

function relevantToTopic(item, topic) {
  const rules = TOPICS[topic]?.include || [];
  const text = `${item.title} ${item.abstract || ""} ${item.source || ""}`;
  return rules.every((rule) => rule.test(text));
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

    for (const query of config.news) {
      fresh.push(...await safe(`GDELT ${topic}`, () => searchGdelt(topic, query)));
      await sleep(350);
    }
  }

  fresh.push(...await fetchGuidancePages());

  const filteredFresh = fresh.filter((item) => {
    if (item.sourceType === "guidance") return true;
    return relevantToTopic(item, item.topic);
  });

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

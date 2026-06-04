"use client";

import { useMemo, useState } from "react";

export type EvidenceTopic = "general" | "pregnancy" | "interval";

export type EvidenceSourceType =
  | "publication"
  | "preprint"
  | "guidance"
  | "news"
  | "outbreak";

export type EvidenceItem = {
  id: string;
  topic: EvidenceTopic;
  topicLabel: string;
  silos?: EvidenceTopic[];
  sourceType: EvidenceSourceType;
  title: string;
  url: string;
  source: string;
  date: string;
  jurisdiction: string;
  evidenceSignal: string;
  whyItMatters: string;
  abstract?: string;
  queryTag?: string | null;
  fetchedAt?: string;
  firstSeenAt?: string;
  reviewStatus?: "unreviewed" | "include" | "exclude" | "watch";
  reviewerNotes?: string;
  sourceScope?: string | null;
  updateStatus?: "new_watch_item" | "changed_since_last_refresh" | "no_change_detected" | null;
  changedAt?: string | null;
  previousFingerprint?: string | null;
  currentFingerprint?: string | null;
  parentSource?: string | null;
  displayInDashboard?: boolean;
  priorityScore?: number;
};

export type EvidenceData = {
  updatedAt: string | null;
  lookbackDays: number;
  itemCount: number;
  visibleItemCount?: number;
  items: EvidenceItem[];
};

const TOPIC_LABELS: Record<string, string> = {
  all: "All measles",
  general: "General measles",
  pregnancy: "Pregnancy / exposure management",
  interval: "Dose interval"
};

const SOURCE_LABELS: Record<string, string> = {
  all: "All source types",
  publication: "Publication",
  preprint: "Preprint",
  guidance: "Guidance change",
  news: "News",
  outbreak: "Outbreak / surveillance"
};

const COUNTRY_POINTS: Record<string, { label: string; lat: number; lon: number }> = {
  Canada: { label: "Canada", lat: 58, lon: -106 },
  "United States": { label: "United States", lat: 39, lon: -98 },
  "United Kingdom": { label: "United Kingdom", lat: 55, lon: -3 },
  France: { label: "France", lat: 46, lon: 2 },
  Germany: { label: "Germany", lat: 51, lon: 10 },
  Ireland: { label: "Ireland", lat: 53, lon: -8 },
  Australia: { label: "Australia", lat: -25, lon: 134 },
  Europe: { label: "Europe", lat: 50, lon: 12 },
  Americas: { label: "Americas", lat: 5, lon: -75 },
  Global: { label: "Global / WHO", lat: 15, lon: 0 },
  International: { label: "International", lat: 0, lon: 0 }
};

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(d);
}

function daysSince(value?: string | null) {
  if (!value) return Infinity;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function isCanada(jurisdiction = "") {
  return /canada|ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/i.test(jurisdiction);
}

function isCanadianProvince(jurisdiction = "") {
  return /ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/i.test(jurisdiction);
}

function countryKey(jurisdiction = "") {
  if (isCanada(jurisdiction)) return "Canada";
  if (/united states|usa|u\.s\./i.test(jurisdiction)) return "United States";
  if (/united kingdom|uk/i.test(jurisdiction)) return "United Kingdom";
  if (/france/i.test(jurisdiction)) return "France";
  if (/germany/i.test(jurisdiction)) return "Germany";
  if (/ireland/i.test(jurisdiction)) return "Ireland";
  if (/australia/i.test(jurisdiction)) return "Australia";
  if (/europe/i.test(jurisdiction)) return "Europe";
  if (/americas|paho/i.test(jurisdiction)) return "Americas";
  if (/global|who|sage/i.test(jurisdiction)) return "Global";
  return "International";
}

function hasSilo(item: EvidenceItem, silo: EvidenceTopic) {
  return item.topic === silo || item.silos?.includes(silo);
}

function sortEvidence(a: EvidenceItem, b: EvidenceItem) {
  const canadaDiff = Number(isCanada(b.jurisdiction)) - Number(isCanada(a.jurisdiction));
  if (canadaDiff !== 0) return canadaDiff;

  const scoreDiff = Number(b.priorityScore || 0) - Number(a.priorityScore || 0);
  if (scoreDiff !== 0) return scoreDiff;

  return String(b.date).localeCompare(String(a.date));
}

export default function Dashboard({ data }: { data: EvidenceData }) {
  const [topic, setTopic] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [query, setQuery] = useState("");

  const rawItems = data.items || [];

  const visibleItems = useMemo(() => {
    return rawItems
      .filter((item) => {
        if (item.sourceType === "guidance") {
          return item.updateStatus === "changed_since_last_refresh" && item.displayInDashboard !== false;
        }
        return item.displayInDashboard !== false;
      })
      .sort(sortEvidence);
  }, [rawItems]);

  const jurisdictions = useMemo(() => {
    return [
      "all",
      ...Array.from(new Set(visibleItems.map((i) => i.jurisdiction).filter(Boolean))).sort()
    ];
  }, [visibleItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return visibleItems.filter((item) => {
      if (topic === "canada" && !isCanada(item.jurisdiction)) return false;
      if (topic === "pregnancy" && !hasSilo(item, "pregnancy")) return false;
      if (topic === "interval" && !hasSilo(item, "interval")) return false;
      if (topic === "general" && item.topic !== "general") return false;

      if (sourceType !== "all" && item.sourceType !== sourceType) return false;
      if (jurisdiction !== "all" && item.jurisdiction !== jurisdiction) return false;

      if (q) {
        const haystack = [
          item.title,
          item.source,
          item.jurisdiction,
          item.evidenceSignal,
          item.whyItMatters,
          item.abstract,
          item.queryTag
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [visibleItems, topic, sourceType, jurisdiction, query]);

  const stats = useMemo(() => {
    return {
      visible: visibleItems.length,
      allStored: rawItems.length,
      canada: visibleItems.filter((i) => isCanada(i.jurisdiction)).length,
      canadianProvincial: visibleItems.filter((i) => isCanadianProvince(i.jurisdiction)).length,
      pregnancy: visibleItems.filter((i) => hasSilo(i, "pregnancy")).length,
      interval: visibleItems.filter((i) => hasSilo(i, "interval")).length,
      changedGuidance: visibleItems.filter(
        (i) => i.sourceType === "guidance" && i.updateStatus === "changed_since_last_refresh"
      ).length,
      recent: visibleItems.filter((i) => daysSince(i.date) <= 14).length
    };
  }, [visibleItems, rawItems]);

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Evergreen measles intelligence</p>
          <h1>Measles Evidence Dashboard</h1>
          <p className="heroText">
            All-measles evidence surveillance with Canada prioritized, plus
            dedicated research silos for pregnancy / exposure management and
            dose-interval / accelerated schedule evidence.
          </p>
          <p className="updated">
            Last evidence refresh: <strong>{formatDate(data.updatedAt)}</strong>
          </p>
        </div>

        <div className="heroPanel canadaPanel">
          <h2>Canada first</h2>
          <p>
            Canadian national, provincial, and territorial public health updates
            are ranked ahead of other records. Static guidance pages are hidden
            unless a content change is detected.
          </p>
        </div>
      </section>

      <section className="statsGrid" aria-label="Dashboard summary">
        <Stat label="Visible records" value={stats.visible} />
        <Stat label="Canada records" value={stats.canada} />
        <Stat label="Prov/Terr records" value={stats.canadianProvincial} />
        <Stat label="Pregnancy silo" value={stats.pregnancy} />
        <Stat label="Dose-interval silo" value={stats.interval} />
        <Stat label="Changed guidance" value={stats.changedGuidance} />
        <Stat label="Last 14 days" value={stats.recent} />
      </section>

      <section className="briefingGrid">
        <div className="briefingCard">
          <h2>All measles intelligence</h2>
          <p>
            Tracks measles publications, preprints, news, outbreak reports,
            surveillance updates, public health advisories, misinformation
            signals, immunization program updates, and guidance changes.
          </p>
        </div>

        <div className="briefingCard">
          <h2>Two priority research silos</h2>
          <p>
            Items are tagged when they are relevant to pregnancy / exposure
            management or dose interval / accelerated schedule questions.
          </p>
        </div>
      </section>

      <SourceMap items={visibleItems} />

      <section className="controls" aria-label="Evidence filters">
        <label>
          View
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="all">All measles</option>
            <option value="canada">Canada priority</option>
            <option value="pregnancy">Pregnancy silo</option>
            <option value="interval">Dose-interval silo</option>
            <option value="general">General measles only</option>
          </select>
        </label>

        <label>
          Source type
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
          >
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Jurisdiction
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
          >
            {jurisdictions.map((j) => (
              <option key={j} value={j}>
                {j === "all" ? "All jurisdictions" : j}
              </option>
            ))}
          </select>
        </label>

        <label className="searchBox">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try: Ontario, CIDRAP, vitamin A, pregnancy, 28 days..."
          />
        </label>
      </section>

      <section className="resultsHeader">
        <div>
          <h2>Evidence stream</h2>
          <p>
            Showing <strong>{filtered.length}</strong> of{" "}
            <strong>{visibleItems.length}</strong> visible records.{" "}
            <span className="muted">
              {rawItems.length - visibleItems.length} monitored baseline records
              are hidden, mostly unchanged guidance pages.
            </span>
          </p>
        </div>
      </section>

      <section className="evidenceList">
        {filtered.length === 0 ? (
          <div className="empty">
            No records match the current filters. The next scheduled harvest may
            add new records.
          </div>
        ) : (
          filtered.map((item) => <EvidenceCard key={item.id} item={item} />)
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EvidenceCard({ item }: { item: EvidenceItem }) {
  return (
    <article className={`card ${isCanada(item.jurisdiction) ? "canadaCard" : ""}`}>
      <div className="cardTop">
        <div className="badges">
          {isCanada(item.jurisdiction) ? <span className="badge canadaBadge">Canada priority</span> : null}
          <span className={`badge topic-${item.topic}`}>
            {TOPIC_LABELS[item.topic] || "Measles"}
          </span>
          {item.silos?.includes("pregnancy") ? <span className="badge topic-pregnancy">Pregnancy silo</span> : null}
          {item.silos?.includes("interval") ? <span className="badge topic-interval">Dose-interval silo</span> : null}
          <span className="badge">{SOURCE_LABELS[item.sourceType]}</span>
          <span className="badge">{item.jurisdiction}</span>
        </div>
        <time>{formatDate(item.date)}</time>
      </div>

      <h3>{item.title}</h3>

      <p className="source">
        {item.source}
        {item.queryTag ? ` · ${item.queryTag}` : ""}
      </p>

      {item.sourceType === "guidance" && item.updateStatus === "changed_since_last_refresh" ? (
        <div className="signal alert">
          <strong>Guidance update status:</strong> Changed since last refresh —
          review recommendation wording.
          {item.sourceScope ? ` Source scope: ${item.sourceScope}.` : ""}
        </div>
      ) : null}

      <div className="signal">
        <strong>Evidence signal:</strong> {item.evidenceSignal}
      </div>

      <p>{item.whyItMatters}</p>

      {item.abstract ? (
        <details>
          <summary>Abstract / source excerpt</summary>
          <p>{item.abstract}</p>
        </details>
      ) : null}

      <div className="cardActions">
        <a href={item.url} target="_blank" rel="noreferrer">
          Open source
        </a>
      </div>
    </article>
  );
}

function SourceMap({ items }: { items: EvidenceItem[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of items) {
      const key = countryKey(item.jurisdiction);
      map.set(key, (map.get(key) || 0) + 1);
    }

    return [...map.entries()]
      .map(([key, count]) => ({
        key,
        count,
        point: COUNTRY_POINTS[key] || COUNTRY_POINTS.International
      }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const max = Math.max(1, ...counts.map((c) => c.count));

  const project = (lat: number, lon: number) => ({
    x: ((lon + 180) / 360) * 1000,
    y: ((90 - lat) / 180) * 420
  });

  return (
    <section className="mapSection">
      <div className="mapHeader">
        <div>
          <h2>Global source map</h2>
          <p>Approximate source distribution based on item jurisdiction.</p>
        </div>
      </div>

      <div className="mapGrid">
        <svg className="worldMap" viewBox="0 0 1000 420" role="img" aria-label="Global source map">
          <rect x="0" y="0" width="1000" height="420" rx="24" />
          <path d="M120 120 C180 80 260 80 310 130 C350 170 320 230 250 245 C180 260 100 220 120 120Z" />
          <path d="M230 260 C300 250 360 300 340 360 C305 400 235 370 230 260Z" />
          <path d="M445 105 C515 70 620 90 665 145 C720 215 645 270 555 250 C470 232 390 165 445 105Z" />
          <path d="M690 140 C770 110 885 150 910 230 C860 270 740 260 700 210 C680 185 670 160 690 140Z" />
          <path d="M735 290 C805 270 875 300 880 350 C820 390 750 360 735 290Z" />

          {counts.map(({ key, count, point }) => {
            const { x, y } = project(point.lat, point.lon);
            const r = 8 + (count / max) * 26;

            return (
              <g key={key}>
                <circle cx={x} cy={y} r={r} className={key === "Canada" ? "mapDot canadaDot" : "mapDot"} />
                <text x={x + r + 5} y={y + 4}>
                  {point.label} ({count})
                </text>
              </g>
            );
          })}
        </svg>

        <div className="mapList">
          {counts.slice(0, 10).map(({ key, count, point }) => (
            <div key={key} className={key === "Canada" ? "mapListItem canadaListItem" : "mapListItem"}>
              <span>{point.label}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

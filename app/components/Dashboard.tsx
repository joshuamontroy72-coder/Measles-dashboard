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
  sourceDate?: string | null;
  publishedDate?: string | null;
  modifiedDate?: string | null;
  dateBasis?: string | null;
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

const SORT_LABELS: Record<string, string> = {
  default: "Default: Canada + importance",
  newest: "Date: newest first",
  oldest: "Date: oldest first",
  importance: "Importance: highest first",
  canada: "Canada first",
  sourceType: "Source type A–Z",
  jurisdiction: "Jurisdiction A–Z",
  pregnancy: "Pregnancy silo first",
  interval: "Dose-interval silo first",
  guidance: "Guidance changes first"
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

function dateLabel(item: EvidenceItem) {
  if (item.dateBasis === "published_date") return "Published";
  if (item.dateBasis === "modified_date") return "Modified";
  if (item.dateBasis === "first_seen_or_fetch_date") return "First seen / fallback";
  return "Source date";
}

function displayDate(item: EvidenceItem) {
  return item.publishedDate || item.sourceDate || item.date;
}

function isCanada(jurisdiction = "") {
  return /canada|ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/i.test(jurisdiction);
}

function isCanadianProvince(jurisdiction = "") {
  return /ontario|quebec|québec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|nunavut|northwest territories/i.test(jurisdiction);
}

function hasSilo(item: EvidenceItem, silo: EvidenceTopic) {
  return item.topic === silo || item.silos?.includes(silo);
}

function changedGuidance(item: EvidenceItem) {
  return item.sourceType === "guidance" && item.updateStatus === "changed_since_last_refresh";
}

function operationalImportanceScore(item: EvidenceItem) {
  if (typeof item.priorityScore === "number") return item.priorityScore;

  let score = 0;

  if (changedGuidance(item)) score += 120;
  if (isCanadianProvince(item.jurisdiction)) score += 100;
  else if (isCanada(item.jurisdiction)) score += 85;

  if (hasSilo(item, "pregnancy")) score += 35;
  if (hasSilo(item, "interval")) score += 35;

  if (item.sourceType === "outbreak") score += 30;
  if (item.sourceType === "news") score += 15;
  if (item.sourceType === "publication" || item.sourceType === "preprint") score += 10;

  if (daysSince(displayDate(item)) <= 14) score += 10;

  return score;
}

function importanceLabel(score: number) {
  if (score >= 150) return "High priority";
  if (score >= 90) return "Moderate priority";
  return "Routine signal";
}

function importanceReasons(item: EvidenceItem) {
  const reasons: string[] = [];

  if (changedGuidance(item)) reasons.push("changed guidance");
  if (isCanadianProvince(item.jurisdiction)) reasons.push("Canadian provincial/territorial");
  else if (isCanada(item.jurisdiction)) reasons.push("Canada");
  if (item.sourceType === "outbreak") reasons.push("outbreak/surveillance");
  if (hasSilo(item, "pregnancy")) reasons.push("pregnancy silo");
  if (hasSilo(item, "interval")) reasons.push("dose-interval silo");
  if (daysSince(displayDate(item)) <= 14) reasons.push("recent");

  return reasons.length ? reasons.join(", ") : "general measles signal";
}

function compareDateDesc(a: EvidenceItem, b: EvidenceItem) {
  return String(displayDate(b)).localeCompare(String(displayDate(a)));
}

function compareDateAsc(a: EvidenceItem, b: EvidenceItem) {
  return String(displayDate(a)).localeCompare(String(displayDate(b)));
}

function sortEvidence(items: EvidenceItem[], sortBy: string) {
  return [...items].sort((a, b) => {
    if (sortBy === "newest") return compareDateDesc(a, b);
    if (sortBy === "oldest") return compareDateAsc(a, b);

    if (sortBy === "importance") {
      const diff = operationalImportanceScore(b) - operationalImportanceScore(a);
      return diff || compareDateDesc(a, b);
    }

    if (sortBy === "canada") {
      const canadaDiff = Number(isCanada(b.jurisdiction)) - Number(isCanada(a.jurisdiction));
      return canadaDiff || compareDateDesc(a, b);
    }

    if (sortBy === "sourceType") {
      const diff = a.sourceType.localeCompare(b.sourceType);
      return diff || compareDateDesc(a, b);
    }

    if (sortBy === "jurisdiction") {
      const diff = a.jurisdiction.localeCompare(b.jurisdiction);
      return diff || compareDateDesc(a, b);
    }

    if (sortBy === "pregnancy") {
      const diff = Number(hasSilo(b, "pregnancy")) - Number(hasSilo(a, "pregnancy"));
      return diff || compareDateDesc(a, b);
    }

    if (sortBy === "interval") {
      const diff = Number(hasSilo(b, "interval")) - Number(hasSilo(a, "interval"));
      return diff || compareDateDesc(a, b);
    }

    if (sortBy === "guidance") {
      const diff = Number(changedGuidance(b)) - Number(changedGuidance(a));
      return diff || compareDateDesc(a, b);
    }

    const canadaDiff = Number(isCanada(b.jurisdiction)) - Number(isCanada(a.jurisdiction));
    if (canadaDiff !== 0) return canadaDiff;

    const scoreDiff = operationalImportanceScore(b) - operationalImportanceScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    return compareDateDesc(a, b);
  });
}

export default function Dashboard({ data }: { data: EvidenceData }) {
  const [topic, setTopic] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [query, setQuery] = useState("");

  const rawItems = data.items || [];

  const visibleItems = useMemo(() => {
    return rawItems.filter((item) => {
      if (item.sourceType === "guidance") {
        return changedGuidance(item) && item.displayInDashboard !== false;
      }
      return item.displayInDashboard !== false;
    });
  }, [rawItems]);

  const jurisdictions = useMemo(() => {
    return [
      "all",
      ...Array.from(new Set(visibleItems.map((i) => i.jurisdiction).filter(Boolean))).sort()
    ];
  }, [visibleItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filteredItems = visibleItems.filter((item) => {
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

    return sortEvidence(filteredItems, sortBy);
  }, [visibleItems, topic, sourceType, jurisdiction, sortBy, query]);

  const stats = useMemo(() => {
    return {
      visible: visibleItems.length,
      allStored: rawItems.length,
      canada: visibleItems.filter((i) => isCanada(i.jurisdiction)).length,
      canadianProvincial: visibleItems.filter((i) => isCanadianProvince(i.jurisdiction)).length,
      pregnancy: visibleItems.filter((i) => hasSilo(i, "pregnancy")).length,
      interval: visibleItems.filter((i) => hasSilo(i, "interval")).length,
      changedGuidance: visibleItems.filter(changedGuidance).length,
      highPriority: visibleItems.filter((i) => operationalImportanceScore(i) >= 150).length,
      recent: visibleItems.filter((i) => daysSince(displayDate(i)) <= 14).length
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
            are ranked ahead of other records. Static guidance and older
            background resources are hidden unless they are recent or changed.
          </p>
        </div>
      </section>

      <section className="statsGrid" aria-label="Dashboard summary">
        <Stat label="Visible records" value={stats.visible} />
        <Stat label="Canada records" value={stats.canada} />
        <Stat label="Prov/Terr records" value={stats.canadianProvincial} />
        <Stat label="Pregnancy silo" value={stats.pregnancy} />
        <Stat label="Dose-interval silo" value={stats.interval} />
        <Stat label="High priority" value={stats.highPriority} />
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
          <h2>Operational importance</h2>
          <p>
            Importance is a triage score based on Canadian relevance, outbreak or
            surveillance signal, recency, changed guidance, and pregnancy or
            dose-interval relevance. It is not an Altmetric score.
          </p>
        </div>
      </section>

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

        <label>
          Sort by
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
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
              are hidden, mostly unchanged guidance or older background pages.
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
  const score = operationalImportanceScore(item);

  return (
    <article className={`card ${isCanada(item.jurisdiction) ? "canadaCard" : ""}`}>
      <div className="cardTop">
        <div className="badges">
          {isCanada(item.jurisdiction) ? <span className="badge canadaBadge">Canada priority</span> : null}
          <span className={`badge importance-${importanceLabel(score).toLowerCase().replaceAll(" ", "-")}`}>
            {importanceLabel(score)}
          </span>
          <span className={`badge topic-${item.topic}`}>
            {TOPIC_LABELS[item.topic] || "Measles"}
          </span>
          {item.silos?.includes("pregnancy") ? <span className="badge topic-pregnancy">Pregnancy silo</span> : null}
          {item.silos?.includes("interval") ? <span className="badge topic-interval">Dose-interval silo</span> : null}
          <span className="badge">{SOURCE_LABELS[item.sourceType]}</span>
          <span className="badge">{item.jurisdiction}</span>
        </div>

        <div className="dateBlock">
          <time>{formatDate(displayDate(item))}</time>
          <span>{dateLabel(item)}</span>
          {item.firstSeenAt ? <span>First seen: {formatDate(item.firstSeenAt)}</span> : null}
        </div>
      </div>

      <h3>{item.title}</h3>

      <p className="source">
        {item.source}
        {item.queryTag ? ` · ${item.queryTag}` : ""}
      </p>

      <div className="importanceBox">
        <strong>Operational importance:</strong> {score} · {importanceLabel(score)}
        <span>{importanceReasons(item)}</span>
      </div>

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

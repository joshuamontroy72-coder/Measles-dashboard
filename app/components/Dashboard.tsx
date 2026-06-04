"use client";

import { useMemo, useState } from "react";

export type EvidenceTopic = "pregnancy" | "interval";

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
  sourceScope?: string;
  updateStatus?: "new_watch_item" | "changed_since_last_refresh" | "no_change_detected";
  changedAt?: string | null;
  previousFingerprint?: string | null;
  currentFingerprint?: string | null;
  parentSource?: string | null;
  previousFetchedAt?: string | null;
};

export type EvidenceData = {
  updatedAt: string | null;
  lookbackDays: number;
  itemCount: number;
  items: EvidenceItem[];
};

const TOPIC_LABELS: Record<string, string> = {
  all: "All topics",
  pregnancy: "Pregnancy / exposure management",
  interval: "Dose interval"
};

const SOURCE_LABELS: Record<string, string> = {
  all: "All source types",
  publication: "Peer-reviewed / indexed publication",
  preprint: "Preprint",
  guidance: "Guidance / NITAG",
  news: "News",
  outbreak: "Outbreak report / news"
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

export default function Dashboard({ data }: { data: EvidenceData }) {
  const [topic, setTopic] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [query, setQuery] = useState("");

  const items = data.items || [];

  const jurisdictions = useMemo(() => {
    return [
      "all",
      ...Array.from(new Set(items.map((i) => i.jurisdiction).filter(Boolean))).sort()
    ];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((item) => {
      if (topic !== "all" && item.topic !== topic) return false;
      if (sourceType !== "all" && item.sourceType !== sourceType) return false;
      if (jurisdiction !== "all" && item.jurisdiction !== jurisdiction) return false;

      if (q) {
        const haystack = [
          item.title,
          item.source,
          item.jurisdiction,
          item.evidenceSignal,
          item.whyItMatters,
          item.abstract
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [items, topic, sourceType, jurisdiction, query]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      pregnancy: items.filter((i) => i.topic === "pregnancy").length,
      interval: items.filter((i) => i.topic === "interval").length,
      guidance: items.filter((i) => i.sourceType === "guidance").length,
      recent: items.filter((i) => daysSince(i.date) <= 14).length,
      canada: items.filter((i) => i.jurisdiction === "Canada").length
    };
  }, [items]);

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Evergreen evidence surveillance</p>
          <h1>Measles Evidence Dashboard</h1>
          <p className="heroText">
            Focused on measles in pregnancy, exposure management, MMR use around
            pregnancy, and evidence on shortening the interval between first and
            second measles-containing vaccine doses.
          </p>
          <p className="updated">
            Last evidence refresh: <strong>{formatDate(data.updatedAt)}</strong>
          </p>
        </div>

        <div className="heroPanel">
          <h2>Priority questions</h2>
          <ol>
            <li>
              What evidence exists on measles infection, outbreaks, outcomes, and
              exposure management during pregnancy?
            </li>
            <li>
              What evidence and guidance support a shortened interval between
              dose 1 and dose 2 of measles-containing vaccine?
            </li>
          </ol>
        </div>
      </section>

      <section className="statsGrid" aria-label="Dashboard summary">
        <Stat label="Total records" value={stats.total} />
        <Stat label="Pregnancy topic" value={stats.pregnancy} />
        <Stat label="Dose-interval topic" value={stats.interval} />
        <Stat label="Guidance pages" value={stats.guidance} />
        <Stat label="Last 14 days" value={stats.recent} />
        <Stat label="Canada-tagged" value={stats.canada} />
      </section>

      <section className="briefingGrid">
        <div className="briefingCard">
          <h2>Pregnancy evidence watch</h2>
          <p>
            The pregnancy stream is designed to surface publications and news on
            affected pregnant people in outbreaks, maternal-fetal outcomes after
            measles infection, inadvertent MMR exposure around pregnancy, and
            post-exposure management guidance.
          </p>
        </div>

        <div className="briefingCard">
          <h2>Dose-interval evidence watch</h2>
          <p>
            The interval stream is designed to surface immunogenicity,
            effectiveness, schedule, outbreak-response, and NITAG guidance
            evidence relevant to whether the second dose can be administered
            earlier than school entry.
          </p>
        </div>
      </section>

      <section className="controls" aria-label="Evidence filters">
        <label>
          Topic
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            {Object.entries(TOPIC_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
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
            placeholder="Try: pregnancy, immune globulin, 28 days, NACI..."
          />
        </label>
      </section>

      <section className="resultsHeader">
        <div>
          <h2>Evidence stream</h2>
          <p>
            Showing <strong>{filtered.length}</strong> of{" "}
            <strong>{items.length}</strong> records.
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

      <section className="methods">
        <h2>Search strategy built into the updater</h2>
        <div className="methodGrid">
          <div>
            <h3>Pregnancy stream</h3>
            <p>
              Searches for measles or MMR combined with pregnancy, maternal,
              fetal, obstetric, neonatal, congenital, immune globulin, and
              post-exposure terms.
            </p>
          </div>
          <div>
            <h3>Dose-interval stream</h3>
            <p>
              Searches for measles vaccine, MMR, or MMRV combined with second
              dose, interval, accelerated schedule, 28 days, 4 weeks,
              immunogenicity, effectiveness, and school-entry terms.
            </p>
          </div>
          <div>
            <h3>Guidance monitoring</h3>
            <p>
              Monitors selected Canadian, U.S., WHO, UK, and Australian guidance
              pages for relevant schedule and pregnancy-management updates.
            </p>
          </div>
        </div>
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
    <article className="card">
      <div className="cardTop">
        <div className="badges">
          <span className={`badge topic-${item.topic}`}>
            {TOPIC_LABELS[item.topic]}
          </span>
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

{item.sourceType === "guidance" && item.updateStatus ? (
  <div
    className={`signal ${
      item.updateStatus === "changed_since_last_refresh" ? "alert" : ""
    }`}
  >
    <strong>Guidance update status:</strong>{" "}
    {item.updateStatus === "changed_since_last_refresh"
      ? "Changed since last refresh — review recommendation wording."
      : item.updateStatus === "new_watch_item"
        ? "New monitored NITAG/guidance/schedule item."
        : "No change detected."}
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

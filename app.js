/**
 * Measles Evidence Watch — frontend
 *
 * Reads data/evidence.json and data/coverage.json.
 * No build step — runs directly from the browser.
 */

"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const POLICY_AREAS = [
  { id: "pregnancy_mmr",       label: "MMR in pregnancy" },
  { id: "pregnancy_infection", label: "Measles/rubella infection in pregnancy" },
  { id: "schedule_timing",     label: "Second-dose timing" },
  { id: "general_measles",     label: "General measles" },
];

const SOURCE_TYPE_LABELS = {
  journal:         "Journal article",
  preprint:        "Preprint",
  clinical_trial:  "Clinical trial",
  guideline:       "Guideline",
  surveillance:    "Surveillance",
  outbreak_report: "Outbreak report",
  news:            "News",
  press_release:   "Press release",
  blog:            "Blog",
  other:           "Other",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allRecords   = [];
let coverage     = {};
let filtered     = [];
let currentPage  = 1;

const state = {
  search:     "",
  policyArea: "all",
  channel:    "all",
  sourceType: "all",
  species:    "all",
  pregnancy:  false,
  canadian:   false,
  dateFrom:   "",
  dateTo:     "",
  sort:       "date_desc",
};

// ---------------------------------------------------------------------------
// Fetch data
// ---------------------------------------------------------------------------

async function loadData() {
  try {
    const [evResp, covResp] = await Promise.all([
      fetch("data/evidence.json"),
      fetch("data/coverage.json"),
    ]);
    allRecords = await evResp.json();
    coverage   = covResp.ok ? await covResp.json() : {};
  } catch (err) {
    console.error("Failed to load data:", err);
    document.getElementById("evidence-list").innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div>
       <p>Could not load evidence data. Check console for details.</p></div>`;
    return;
  }

  renderCoveragePanel();
  renderChannelFilters();
  renderSituation();
  applyFiltersAndRender();
  updateMeta();
}

// ---------------------------------------------------------------------------
// Situation banner — most recent outbreak_report OR surveillance item,
// fallback to most recent WHO IRIS guideline
// ---------------------------------------------------------------------------

function renderSituation() {
  const banner = document.getElementById("situation-banner");
  const text   = document.getElementById("situation-text");
  const link   = document.getElementById("situation-link");

  // Priority 1: outbreak_report or surveillance
  let latest = allRecords.find(
    (r) => r.source_type === "outbreak_report" || r.source_type === "surveillance"
  );

  // Priority 2: WHO / SAGE guideline
  if (!latest) {
    latest = allRecords.find(
      (r) =>
        r.source_type === "guideline" &&
        (r.channel === "who_sage" || (r.source || "").toLowerCase().includes("who"))
    );
  }

  if (!latest) return;

  text.textContent = latest.title || "(No title)";
  link.href        = latest.url || "#";
  link.style.display = latest.url ? "inline" : "none";
  banner.classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Coverage panel
// ---------------------------------------------------------------------------

function renderCoveragePanel() {
  const panel = document.getElementById("coverage-panel");
  if (!coverage.channels) { panel.style.display = "none"; return; }

  const updAt = coverage.updated_at
    ? new Date(coverage.updated_at).toLocaleString("en-CA", {
        dateStyle: "medium", timeStyle: "short",
      })
    : "—";

  const channelChips = (coverage.channels || [])
    .map(
      (ch) =>
        `<button class="coverage-chip" data-channel="${ch.id}" title="${ch.label}">
           <span>${ch.icon || ""} ${ch.label}</span>
           <span class="chip-count">${ch.count}</span>
         </button>`
    )
    .join("");

  const policyChips = (coverage.policy_areas || [])
    .map(
      (pa) =>
        `<button class="policy-chip" data-area="${pa.id}"
            title="${pa.label}">${pa.label} <strong>${pa.count}</strong></button>`
    )
    .join("");

  panel.innerHTML = `
    <p class="coverage-panel-title">Source coverage · ${updAt}</p>
    <div class="coverage-chips" id="channel-chip-row">${channelChips}</div>
    <div class="policy-area-row" id="policy-chip-row">${policyChips}</div>
  `;

  // Channel chip click → filter
  panel.querySelectorAll(".coverage-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = btn.dataset.channel;
      state.channel = state.channel === ch ? "all" : ch;
      syncChannelRadio();
      applyFiltersAndRender();
      updateChipActive();
    });
  });

  // Policy chip click → filter
  panel.querySelectorAll(".policy-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const area = btn.dataset.area;
      if (state.policyArea === area) {
        state.policyArea = "all";
      } else {
        state.policyArea = area;
      }
      syncPolicyRadio();
      applyFiltersAndRender();
    });
  });
}

function updateChipActive() {
  document.querySelectorAll(".coverage-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.channel === state.channel);
  });
}

// ---------------------------------------------------------------------------
// Channel filter radio buttons (sidebar)
// ---------------------------------------------------------------------------

function renderChannelFilters() {
  const group = document.getElementById("channel-filters");
  const existing = group.querySelector(".filter-all").outerHTML;

  const channels = coverage.channels || [];
  const extras = channels.map(
    (ch) =>
      `<label class="filter-label">
         <input type="radio" name="channel" value="${ch.id}" />
         ${ch.icon || ""} ${ch.label}
       </label>`
  ).join("");

  group.innerHTML = existing + extras;

  // Re-attach radio listeners
  group.querySelectorAll("input[type=radio]").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        state.channel = r.value;
        updateChipActive();
        applyFiltersAndRender();
      }
    });
  });
}

function syncChannelRadio() {
  document.querySelectorAll("input[name=channel]").forEach((r) => {
    r.checked = r.value === state.channel;
  });
}

function syncPolicyRadio() {
  document.querySelectorAll("input[name=policy_area]").forEach((r) => {
    r.checked = r.value === state.policyArea;
  });
}

// ---------------------------------------------------------------------------
// Filter + sort
// ---------------------------------------------------------------------------

function applyFiltersAndRender() {
  const q = state.search.toLowerCase().trim();

  filtered = allRecords.filter((r) => {
    // Text search
    if (q) {
      const haystack = [
        r.title, r.summary, r.authors, r.journal, r.source,
      ].join(" ").toLowerCase();
      if (!q.split(/\s+/).every((w) => haystack.includes(w))) return false;
    }

    // Policy area
    if (state.policyArea !== "all") {
      if (!Array.isArray(r.policy_area) || !r.policy_area.includes(state.policyArea)) return false;
    }

    // Pregnancy toggle
    if (state.pregnancy && !r.pregnancy_related) return false;

    // Channel
    if (state.channel !== "all" && r.channel !== state.channel) return false;

    // Source type
    if (state.sourceType !== "all" && r.source_type !== state.sourceType) return false;

    // Species
    if (state.species !== "all") {
      if (state.species === "human"  && r.species !== "human")  return false;
      if (state.species === "animal" && r.species !== "animal") return false;
    }

    // Canadian
    if (state.canadian && !r.canadian) return false;

    // Date range
    if (state.dateFrom && r.date && r.date < state.dateFrom) return false;
    if (state.dateTo   && r.date && r.date > state.dateTo)   return false;

    return true;
  });

  // Sort
  filtered = sortRecords(filtered, state.sort);

  currentPage = 1;
  renderPage();
  updateResultsCount();
}

function sortRecords(records, sort) {
  const copy = [...records];
  if (sort === "date_desc") return copy.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (sort === "date_asc")  return copy.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (sort === "altmetric") return copy.sort((a, b) => (b.altmetric_score || 0) - (a.altmetric_score || 0));
  if (sort === "title")     return copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  return copy;
}

// ---------------------------------------------------------------------------
// Render cards
// ---------------------------------------------------------------------------

function renderPage() {
  const list  = document.getElementById("evidence-list");
  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🔍</div>
      <p>No records match your current filters.</p>
    </div>`;
  } else {
    list.innerHTML = page.map(renderCard).join("");
  }

  renderPagination();
}

function renderCard(rec) {
  const primaryArea = Array.isArray(rec.policy_area) && rec.policy_area.length
    ? rec.policy_area[0]
    : "general_measles";

  const stLabel = SOURCE_TYPE_LABELS[rec.source_type] || rec.source_type || "Other";
  const stClass = (rec.source_type || "").replace(/_/g, "_");

  const dateStr = rec.date
    ? new Date(rec.date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
    : "";

  const policyPills = (rec.policy_area || ["general_measles"])
    .map((a) => `<span class="pill pill-policy" data-area="${a}">${
      POLICY_AREAS.find((p) => p.id === a)?.label || a
    }</span>`)
    .join("");

  const altmetric = rec.altmetric_score
    ? `<span class="altmetric-badge">⚡ ${Math.round(rec.altmetric_score)}</span>`
    : "";

  const flags = [
    rec.reviewed    ? `<span class="pill pill-reviewed">✓ Reviewed</span>` : "",
    rec.canadian    ? `<span class="pill pill-canada">🍁 Canada</span>`    : "",
    rec.pharma      ? `<span class="pill pill-pharma">Industry</span>`      : "",
    rec.species === "animal" ? `<span class="pill pill-animal">Animal study</span>` : "",
  ].filter(Boolean).join("");

  const summary = rec.summary
    ? `<div class="card-body"><p>${escHtml(rec.summary)}</p></div>`
    : "";

  const sourceStr = [rec.authors, rec.journal || rec.source]
    .filter(Boolean)
    .join(" · ");

  return `
  <article class="evidence-card" role="listitem">
    <div class="card-accent" data-primary="${primaryArea}"></div>
    <div class="card-title">
      ${rec.url
        ? `<a href="${escHtml(rec.url)}" target="_blank" rel="noopener">${escHtml(rec.title || "(No title)")}</a>`
        : escHtml(rec.title || "(No title)")
      }
    </div>
    <div class="card-meta">
      <span class="card-date">${dateStr}</span>
      ${altmetric}
    </div>
    ${summary}
    <div class="card-footer">
      <span class="pill pill-source-type ${stClass}">${stLabel}</span>
      ${policyPills}
      ${flags}
      <span class="card-source">${escHtml(sourceStr)}</span>
    </div>
  </article>`;
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function renderPagination() {
  const total  = Math.ceil(filtered.length / PAGE_SIZE);
  const pg     = document.getElementById("pagination");

  if (total <= 1) { pg.innerHTML = ""; return; }

  const prev = `<button class="page-btn" id="page-prev" ${currentPage === 1 ? "disabled" : ""}>‹ Prev</button>`;
  const next = `<button class="page-btn" id="page-next" ${currentPage === total ? "disabled" : ""}>Next ›</button>`;

  const maxVisible = 7;
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  let end   = Math.min(total, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  let nums = "";
  if (start > 1)     nums += `<button class="page-btn" data-page="1">1</button><span>…</span>`;
  for (let p = start; p <= end; p++) {
    nums += `<button class="page-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`;
  }
  if (end < total)   nums += `<span>…</span><button class="page-btn" data-page="${total}">${total}</button>`;

  pg.innerHTML = prev + nums + next;

  pg.querySelector("#page-prev")?.addEventListener("click", () => goPage(currentPage - 1));
  pg.querySelector("#page-next")?.addEventListener("click", () => goPage(currentPage + 1));
  pg.querySelectorAll("[data-page]").forEach((btn) =>
    btn.addEventListener("click", () => goPage(Number(btn.dataset.page)))
  );
}

function goPage(p) {
  const total = Math.ceil(filtered.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(p, total));
  renderPage();
  document.getElementById("main-content").scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// Metadata chips in header
// ---------------------------------------------------------------------------

function updateMeta() {
  const updAt = coverage.updated_at
    ? new Date(coverage.updated_at).toLocaleString("en-CA", {
        dateStyle: "medium", timeStyle: "short",
      })
    : "—";
  document.getElementById("updated-at").textContent = `Updated ${updAt}`;
  document.getElementById("total-count").textContent = `${allRecords.length} records`;
}

function updateResultsCount() {
  const el = document.getElementById("results-count");
  el.textContent = filtered.length === allRecords.length
    ? `${allRecords.length} records`
    : `${filtered.length} of ${allRecords.length} records`;
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

function wireListeners() {
  // Search (debounced)
  let searchTimer;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value;
      applyFiltersAndRender();
    }, 280);
  });

  // Policy area radios
  document.querySelectorAll("input[name=policy_area]").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) { state.policyArea = r.value; applyFiltersAndRender(); }
    });
  });

  // Pregnancy toggle
  document.getElementById("pregnancy-toggle").addEventListener("change", (e) => {
    state.pregnancy = e.target.checked;
    applyFiltersAndRender();
  });

  // Source type radios
  document.querySelectorAll("input[name=source_type]").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) { state.sourceType = r.value; applyFiltersAndRender(); }
    });
  });

  // Species radios
  document.querySelectorAll("input[name=species]").forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) { state.species = r.value; applyFiltersAndRender(); }
    });
  });

  // Canadian toggle
  document.getElementById("canadian-toggle").addEventListener("change", (e) => {
    state.canadian = e.target.checked;
    applyFiltersAndRender();
  });

  // Date range
  document.getElementById("date-from").addEventListener("change", (e) => {
    state.dateFrom = e.target.value;
    applyFiltersAndRender();
  });
  document.getElementById("date-to").addEventListener("change", (e) => {
    state.dateTo = e.target.value;
    applyFiltersAndRender();
  });

  // Sort
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    applyFiltersAndRender();
  });

  // Reset
  document.getElementById("reset-btn").addEventListener("click", () => {
    Object.assign(state, {
      search:     "",
      policyArea: "all",
      channel:    "all",
      sourceType: "all",
      species:    "all",
      pregnancy:  false,
      canadian:   false,
      dateFrom:   "",
      dateTo:     "",
      sort:       "date_desc",
    });
    document.getElementById("search-input").value  = "";
    document.getElementById("pregnancy-toggle").checked = false;
    document.getElementById("canadian-toggle").checked  = false;
    document.getElementById("date-from").value = "";
    document.getElementById("date-to").value   = "";
    document.getElementById("sort-select").value = "date_desc";
    document.querySelectorAll("input[name=policy_area]").forEach((r) => { r.checked = r.value === "all"; });
    document.querySelectorAll("input[name=channel]").forEach((r)     => { r.checked = r.value === "all"; });
    document.querySelectorAll("input[name=source_type]").forEach((r) => { r.checked = r.value === "all"; });
    document.querySelectorAll("input[name=species]").forEach((r)     => { r.checked = r.value === "all"; });
    updateChipActive();
    applyFiltersAndRender();
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  wireListeners();
  loadData();
});

"use strict";

const DATA_URL = "data/venue-menu-history.json";
const SERIES_COLORS = ["#f04b2f", "#3156c8", "#8b4bb6", "#168c71", "#c58a00"];
const PAGE_SIZE = 12;

const state = {
  history: [],
  latestEntries: [],
  latestBeers: [],
  venues: [],
  venueColors: new Map(),
  threshold: 5,
  chartRange: 365,
  isolatedVenue: null,
  strengthFilter: "all",
  venueFilter: "all",
  search: "",
  sortDirection: "asc",
  visibleRows: PAGE_SIZE,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  restorePreferences();
  bindControls();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Data request failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data) || !data.length) throw new Error("No menu history found");
    prepareData(data);
    renderAll();
    requestAnimationFrame(() => els.loading.classList.add("done"));
  } catch (error) {
    console.error(error);
    els.loading.classList.add("error");
    els.loading.setAttribute("role", "alert");
    els.loading.querySelector("p").textContent =
      "Couldn’t read the taps. Serve this folder with a local web server and try again.";
  }
}

function cacheElements() {
  const ids = [
    "last-updated", "latest-average", "verdict-stamp", "verdict-copy",
    "threshold", "threshold-output", "over-limit-count", "snapshot-date",
    "stat-average", "average-change", "stat-over", "over-note",
    "stat-strongest", "strongest-name", "stat-pours", "chart-legend",
    "trend-chart", "chart-tooltip", "venue-grid", "menu-result-count",
    "menu-search", "venue-filter", "menu-body", "empty-state", "sort-abv",
    "abv-heading", "show-more", "loading-screen",
  ];
  ids.forEach((id) => {
    const key = id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    els[key] = document.getElementById(id);
  });
  els.loading = els.loadingScreen;
}

function bindControls() {
  els.threshold.addEventListener("input", (event) => {
    state.threshold = Number(event.target.value);
    saveThreshold();
    updateRangeFill();
    renderThresholdDependentViews();
  });

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-range]").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      state.chartRange = button.dataset.range === "all" ? "all" : Number(button.dataset.range);
      renderChart();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      state.strengthFilter = button.dataset.filter;
      state.visibleRows = PAGE_SIZE;
      renderMenu();
    });
  });

  els.menuSearch.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLocaleLowerCase();
    state.visibleRows = PAGE_SIZE;
    renderMenu();
  });

  els.venueFilter.addEventListener("change", (event) => {
    state.venueFilter = event.target.value;
    state.visibleRows = PAGE_SIZE;
    renderMenu();
  });

  els.sortAbv.addEventListener("click", () => {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    els.sortAbv.querySelector("span").textContent = state.sortDirection === "asc" ? "↑" : "↓";
    els.sortAbv.setAttribute(
      "aria-label",
      `Sort by ABV, currently ${state.sortDirection === "asc" ? "lowest" : "highest"} first`,
    );
    els.abvHeading.setAttribute("aria-sort", state.sortDirection === "asc" ? "ascending" : "descending");
    renderMenu();
  });

  els.showMore.addEventListener("click", () => {
    state.visibleRows += PAGE_SIZE;
    renderMenu();
  });
}

function prepareData(data) {
  state.history = data
    .filter((entry) => entry.date && entry.venue_name && Array.isArray(entry.beers))
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestDate = state.history.at(-1).date;
  state.latestEntries = state.history.filter((entry) => entry.date === latestDate);
  state.venues = [...new Set(state.history.map((entry) => entry.venue_name))];
  state.venues.forEach((venue, index) => state.venueColors.set(venue, SERIES_COLORS[index % SERIES_COLORS.length]));

  state.latestBeers = state.latestEntries.flatMap((entry) =>
    entry.beers
      .map((beer) => ({
        ...beer,
        venue: entry.venue_name,
        abvNumber: Number.parseFloat(beer.abv),
      }))
      .filter((beer) => Number.isFinite(beer.abvNumber)),
  );

  state.venues.forEach((venue) => {
    const option = document.createElement("option");
    option.value = venue;
    option.textContent = shortVenueName(venue);
    els.venueFilter.append(option);
  });

  state.threshold = Number(els.threshold.value);
  updateRangeFill();
}

function renderAll() {
  const latestDate = state.history.at(-1).date;
  els.lastUpdated.dateTime = latestDate;
  els.lastUpdated.textContent = formatDate(latestDate, { day: "numeric", month: "short", year: "numeric" });
  els.snapshotDate.textContent = `${formatDate(latestDate, { day: "numeric", month: "long", year: "numeric" })} · ${state.latestBeers.length} taps`;
  els.statPours.textContent = state.history
    .reduce((sum, entry) => sum + entry.beers.length, 0)
    .toLocaleString("en-GB");

  renderThresholdDependentViews();
}

function renderThresholdDependentViews() {
  renderSummary();
  renderVenues();
  renderChart();
  renderMenu();
}

function renderSummary() {
  const average = mean(state.latestBeers.map((beer) => beer.abvNumber));
  const over = state.latestBeers.filter((beer) => beer.abvNumber > state.threshold);
  const overPercent = state.latestBeers.length ? (over.length / state.latestBeers.length) * 100 : 0;
  const strongest = state.latestBeers.reduce(
    (winner, beer) => (!winner || beer.abvNumber > winner.abvNumber ? beer : winner),
    null,
  );

  els.thresholdOutput.textContent = `${state.threshold.toFixed(1)}%`;
  els.overLimitCount.textContent = `${over.length} of ${state.latestBeers.length}`;
  els.latestAverage.textContent = average.toFixed(1);
  els.statAverage.textContent = average.toFixed(1);
  els.statOver.textContent = Math.round(overPercent);
  els.overNote.textContent = `${over.length} pint${over.length === 1 ? "" : "s"} above ${state.threshold.toFixed(1)}%`;

  if (strongest) {
    els.statStrongest.textContent = strongest.abvNumber.toFixed(1);
    els.strongestName.textContent = `${strongest.name} · ${shortVenueName(strongest.venue)}`;
    els.strongestName.title = `${strongest.name} at ${shortVenueName(strongest.venue)}`;
  }

  const previousAverage = comparisonAverage();
  const change = average - previousAverage;
  const direction = change > 0.025 ? "up" : change < -0.025 ? "down" : "flat";
  els.averageChange.textContent = direction === "flat"
    ? "Essentially unchanged year on year"
    : `${direction === "up" ? "↑" : "↓"} ${Math.abs(change).toFixed(1)} points vs a year ago`;

  const excess = average - state.threshold;
  if (excess <= -0.5) {
    els.verdictStamp.textContent = "Unexpected restraint";
    els.verdictCopy.textContent = "The average is behaving itself. There are still offenders; keep one eye on the small print.";
  } else if (excess <= 0) {
    els.verdictStamp.textContent = "Marginally civilised";
    els.verdictCopy.textContent = "Technically within bounds. A victory, albeit one measured in tenths of a percent.";
  } else if (excess <= 0.75) {
    els.verdictStamp.textContent = "Needlessly punchy";
    els.verdictCopy.textContent = "The average pint has crossed your line. Apparently flavour now requires a risk assessment.";
  } else {
    els.verdictStamp.textContent = "Taking the piss";
    els.verdictCopy.textContent = "Even the average is now an event. Cancel the morning and order a half.";
  }
}

function comparisonAverage() {
  const latest = new Date(`${state.history.at(-1).date}T00:00:00Z`);
  const target = new Date(latest);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const targetIso = target.toISOString().slice(0, 10);
  const availableDates = [...new Set(state.history.map((entry) => entry.date))];
  const comparisonDate = availableDates.filter((date) => date <= targetIso).at(-1) || availableDates[0];
  const beers = state.history
    .filter((entry) => entry.date === comparisonDate)
    .flatMap((entry) => entry.beers)
    .map((beer) => Number.parseFloat(beer.abv))
    .filter(Number.isFinite);
  return mean(beers);
}

function renderVenues() {
  const ranked = state.latestEntries
    .map((entry) => {
      const beers = entry.beers
        .map((beer) => Number.parseFloat(beer.abv))
        .filter(Number.isFinite);
      return {
        name: entry.venue_name,
        average: mean(beers),
        max: Math.max(...beers),
        overCount: beers.filter((abv) => abv > state.threshold).length,
        count: beers.length,
      };
    })
    .sort((a, b) => a.average - b.average);

  els.venueGrid.replaceChildren();
  ranked.forEach((venue, index) => {
    const card = document.createElement("article");
    card.className = `venue-card${venue.average > state.threshold ? " over-limit" : ""}`;
    card.innerHTML = `
      <p class="venue-rank">#0${index + 1}</p>
      <h3>${escapeHtml(shortVenueName(venue.name))}</h3>
      <div class="venue-details">
        <div><span>Menu average</span><strong>${venue.average.toFixed(1)}%</strong></div>
        <div><span>Over your limit</span><strong>${venue.overCount}/${venue.count}</strong></div>
        <div><span>Strongest tap</span><strong>${venue.max.toFixed(1)}%</strong></div>
        <div><span>Current taps</span><strong>${venue.count}</strong></div>
      </div>
      <button class="venue-action" type="button">See current taps</button>`;
    card.querySelector(".venue-action").addEventListener("click", () => focusVenueMenu(venue.name));
    els.venueGrid.append(card);
  });
}

function renderChart() {
  const latest = new Date(`${state.history.at(-1).date}T00:00:00Z`);
  const cutoff = state.chartRange === "all"
    ? new Date(`${state.history[0].date}T00:00:00Z`)
    : new Date(latest.getTime() - state.chartRange * 86_400_000);

  const series = state.venues.map((venue) => ({
    venue,
    color: state.venueColors.get(venue),
    points: state.history
      .filter((entry) => entry.venue_name === venue && new Date(`${entry.date}T00:00:00Z`) >= cutoff)
      .map((entry) => ({ date: entry.date, time: Date.parse(`${entry.date}T00:00:00Z`), value: Number(entry.abv_avg) }))
      .filter((point) => Number.isFinite(point.value)),
  }));

  renderLegend(series);

  const visibleSeries = state.isolatedVenue
    ? series.filter((item) => item.venue === state.isolatedVenue)
    : series;
  const allPoints = visibleSeries.flatMap((item) => item.points);
  if (!allPoints.length) return;

  const width = 1000;
  const height = 420;
  const margin = { top: 18, right: 25, bottom: 47, left: 62 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const minTime = Math.min(...allPoints.map((point) => point.time));
  const maxTime = Math.max(...allPoints.map((point) => point.time));
  const values = allPoints.map((point) => point.value);
  const yMin = Math.min(3.5, Math.floor(Math.min(...values) * 2) / 2 - 0.25);
  const yMax = Math.max(7, Math.ceil(Math.max(...values) * 2) / 2 + 0.25);
  const scaleX = (time) => margin.left + ((time - minTime) / Math.max(1, maxTime - minTime)) * innerWidth;
  const scaleY = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * innerHeight;
  const svg = els.trendChart;
  svg.replaceChildren();
  appendSvg(svg, "title", { id: "trend-chart-title" }, "Average beer strength by venue over time");
  appendSvg(
    svg,
    "desc",
    { id: "trend-chart-desc" },
    `Daily average ABV from ${formatDate(new Date(minTime), { month: "long", year: "numeric" })} to ${formatDate(new Date(maxTime), { month: "long", year: "numeric" })}, comparing ${visibleSeries.map((item) => shortVenueName(item.venue)).join(", ")}.`,
  );

  const yStep = yMax - yMin > 4.5 ? 1 : 0.5;
  for (let value = Math.ceil(yMin / yStep) * yStep; value <= yMax; value += yStep) {
    const y = scaleY(value);
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "chart-grid" });
    appendSvg(svg, "text", { x: margin.left - 12, y: y + 4, "text-anchor": "end", class: "chart-axis-label" }, `${value.toFixed(1)}%`);
  }

  const tickCount = 5;
  for (let index = 0; index <= tickCount; index += 1) {
    const time = minTime + ((maxTime - minTime) * index) / tickCount;
    const x = scaleX(time);
    appendSvg(svg, "text", { x, y: height - 14, "text-anchor": index === 0 ? "start" : index === tickCount ? "end" : "middle", class: "chart-axis-label" }, formatDate(new Date(time), { month: "short", year: "2-digit" }));
  }

  if (state.threshold >= yMin && state.threshold <= yMax) {
    const limitY = scaleY(state.threshold);
    appendSvg(svg, "line", { x1: margin.left, x2: width - margin.right, y1: limitY, y2: limitY, class: "chart-limit" });
    appendSvg(svg, "text", { x: width - margin.right - 4, y: limitY - 8, "text-anchor": "end", class: "chart-limit-label" }, `Your limit · ${state.threshold.toFixed(1)}%`);
  }

  visibleSeries.forEach((item) => {
    const pathData = item.points
      .map((point, index) => `${index ? "L" : "M"}${scaleX(point.time).toFixed(2)},${scaleY(point.value).toFixed(2)}`)
      .join(" ");
    appendSvg(svg, "path", { d: pathData, stroke: item.color, class: "chart-line" });
  });

  const overlay = appendSvg(svg, "rect", {
    x: margin.left,
    y: margin.top,
    width: innerWidth,
    height: innerHeight,
    fill: "transparent",
    "aria-hidden": "true",
  });

  const interactionLayer = appendSvg(svg, "g", { "aria-hidden": "true" });
  const crosshair = appendSvg(interactionLayer, "line", { class: "chart-crosshair", y1: margin.top, y2: height - margin.bottom, visibility: "hidden" });
  const dots = new Map();
  visibleSeries.forEach((item) => {
    dots.set(item.venue, appendSvg(interactionLayer, "circle", { r: 6, fill: item.color, class: "chart-dot", visibility: "hidden" }));
  });

  const inspect = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const boundedX = Math.min(width - margin.right, Math.max(margin.left, svgX));
    const targetTime = minTime + ((boundedX - margin.left) / innerWidth) * (maxTime - minTime);
    const matches = visibleSeries.map((item) => {
      const point = item.points.reduce((closest, candidate) =>
        Math.abs(candidate.time - targetTime) < Math.abs(closest.time - targetTime) ? candidate : closest,
      );
      return { ...item, point };
    });
    const anchor = matches[0]?.point;
    if (!anchor) return;
    const x = scaleX(anchor.time);
    crosshair.setAttribute("x1", x);
    crosshair.setAttribute("x2", x);
    crosshair.setAttribute("visibility", "visible");
    matches.forEach((match) => {
      const dot = dots.get(match.venue);
      dot.setAttribute("cx", scaleX(match.point.time));
      dot.setAttribute("cy", scaleY(match.point.value));
      dot.setAttribute("visibility", "visible");
    });

    els.chartTooltip.innerHTML = `<strong>${escapeHtml(formatDate(anchor.date, { day: "numeric", month: "short", year: "numeric" }))}</strong>${matches
      .map((match) => `<div><i style="background:${match.color}"></i>${escapeHtml(shortVenueName(match.venue))}: ${match.point.value.toFixed(1)}%</div>`)
      .join("")}`;
    els.chartTooltip.hidden = false;
    const wrapRect = els.chartTooltip.parentElement.getBoundingClientRect();
    const pointClientX = rect.left + (x / width) * rect.width;
    const tooltipX = Math.min(wrapRect.width - 76, Math.max(76, pointClientX - wrapRect.left));
    els.chartTooltip.style.left = `${tooltipX}px`;
    const topValue = Math.min(...matches.map((match) => scaleY(match.point.value)));
    els.chartTooltip.style.top = `${rect.top - wrapRect.top + (topValue / height) * rect.height}px`;
  };

  overlay.addEventListener("pointermove", (event) => inspect(event.clientX));
  overlay.addEventListener("pointerdown", (event) => inspect(event.clientX));
  overlay.addEventListener("pointerleave", () => {
    crosshair.setAttribute("visibility", "hidden");
    dots.forEach((dot) => dot.setAttribute("visibility", "hidden"));
    els.chartTooltip.hidden = true;
  });
}

function renderLegend(series) {
  els.chartLegend.replaceChildren();
  series.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `legend-item${state.isolatedVenue && state.isolatedVenue !== item.venue ? " muted" : ""}`;
    button.style.setProperty("--series-color", item.color);
    button.textContent = shortVenueName(item.venue);
    button.setAttribute("aria-pressed", String(state.isolatedVenue === item.venue));
    button.addEventListener("click", () => {
      state.isolatedVenue = state.isolatedVenue === item.venue ? null : item.venue;
      renderChart();
    });
    els.chartLegend.append(button);
  });
}

function renderMenu() {
  let beers = state.latestBeers.filter((beer) => {
    if (state.venueFilter !== "all" && beer.venue !== state.venueFilter) return false;
    if (state.strengthFilter === "sensible" && beer.abvNumber > state.threshold) return false;
    if (state.strengthFilter === "strong" && beer.abvNumber <= state.threshold) return false;
    if (!state.search) return true;
    return [beer.name, beer.brewery, beer.style, beer.venue]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(state.search));
  });

  beers.sort((a, b) => {
    const difference = a.abvNumber - b.abvNumber;
    return state.sortDirection === "asc" ? difference : -difference;
  });

  const shown = beers.slice(0, state.visibleRows);
  els.menuBody.replaceChildren();
  shown.forEach((beer) => {
    const row = document.createElement("tr");
    const strong = beer.abvNumber > state.threshold;
    row.innerHTML = `
      <td><span class="beer-name">${escapeHtml(beer.name || "Unnamed beer")}</span><span class="brewery-name">${escapeHtml(beer.brewery || "Unknown brewery")}</span></td>
      <td><span class="style-name">${escapeHtml(beer.style || "Style unknown")}</span></td>
      <td><span class="venue-tag" style="--venue-color:${state.venueColors.get(beer.venue)}">${escapeHtml(shortVenueName(beer.venue))}</span></td>
      <td class="numeric"><span class="abv-badge${strong ? " strong" : ""}">${beer.abvNumber.toFixed(1)}%</span></td>`;
    els.menuBody.append(row);
  });

  els.menuResultCount.textContent = beers.length > state.visibleRows
    ? `Showing ${shown.length} of ${beers.length} taps`
    : `${beers.length} tap${beers.length === 1 ? "" : "s"} found`;
  els.emptyState.hidden = beers.length > 0;
  els.showMore.hidden = beers.length <= state.visibleRows;
  if (!els.showMore.hidden) els.showMore.textContent = `Show ${beers.length - state.visibleRows} more`;
}

function updateRangeFill() {
  const progress = ((state.threshold - Number(els.threshold.min)) / (Number(els.threshold.max) - Number(els.threshold.min))) * 100;
  els.threshold.style.setProperty("--range-progress", `${progress}%`);
  els.threshold.setAttribute("aria-valuetext", `${state.threshold.toFixed(1)} percent maximum sensible ABV`);
  document.querySelector('[data-filter="sensible"]').setAttribute("aria-label", `Show beers at or below ${state.threshold.toFixed(1)} percent`);
  document.querySelector('[data-filter="strong"]').setAttribute("aria-label", `Show beers above ${state.threshold.toFixed(1)} percent`);
}

function focusVenueMenu(venue) {
  state.venueFilter = venue;
  state.strengthFilter = "all";
  state.search = "";
  state.visibleRows = PAGE_SIZE;
  els.venueFilter.value = venue;
  els.menuSearch.value = "";
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === "all";
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderMenu();
  document.getElementById("current-menu").scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => els.menuSearch.focus({ preventScroll: true }), 450);
}

function restorePreferences() {
  try {
    const saved = Number(window.localStorage.getItem("too-damn-strong-threshold"));
    if (Number.isFinite(saved) && saved >= 3 && saved <= 8) {
      state.threshold = Math.round(saved * 10) / 10;
      els.threshold.value = String(state.threshold);
    }
  } catch {
    // The dashboard still works when storage is unavailable.
  }
}

function saveThreshold() {
  try {
    window.localStorage.setItem("too-damn-strong-threshold", String(state.threshold));
  } catch {
    // Treat the preference as session-only when storage is unavailable.
  }
}

function appendSvg(parent, tag, attributes = {}, text = "") {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function shortVenueName(name) {
  return name
    .replace("The Hive Craft Beer and Coffee Shop", "The Hive")
    .replace("Two Flints Brewery", "Two Flints")
    .replace("Siren Craft Brew", "Siren");
}

function formatDate(value, options) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

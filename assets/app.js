const state = {
  places: [],
  filtered: [],
  visible: 36,
  map: null,
  markerLayer: null,
  markerRenderer: null,
  markers: new Map(),
  activePreview: null,
  mapRenderToken: 0,
};

window.kyushuTokyoNagoyaMapState = state;

const prefectureOrder = [
  "北海道", "青森縣", "岩手縣", "宮城縣", "秋田縣", "山形縣", "福島縣",
  "茨城縣", "栃木縣", "群馬縣", "埼玉縣", "千葉縣", "東京都", "神奈川縣",
  "新潟縣", "富山縣", "石川縣", "福井縣", "山梨縣", "長野縣", "岐阜縣",
  "靜岡縣", "愛知縣", "三重縣", "滋賀縣", "京都府", "大阪府", "兵庫縣",
  "奈良縣", "和歌山縣", "鳥取縣", "島根縣", "岡山縣", "廣島縣", "山口縣",
  "德島縣", "香川縣", "愛媛縣", "高知縣", "福岡縣", "佐賀縣", "長崎縣",
  "熊本縣", "大分縣", "宮崎縣", "鹿兒島縣", "沖繩縣",
];
const prefectureRank = new Map(prefectureOrder.map((region, index) => [region, index]));
const $ = (id) => document.getElementById(id);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key];
    if (value) acc.set(value, (acc.get(value) || 0) + 1);
    return acc;
  }, new Map());
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function fallbackPhoto(place) {
  const query = encodeURIComponent(`${place.name || ""} ${place.region || ""} 日本`);
  return `https://tse4.mm.bing.net/th?q=${query}&w=640&h=420&c=7&rs=1&p=0`;
}

function isUsablePhotoUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function photoUrl(place) {
  return isUsablePhotoUrl(place.photo) ? place.photo : fallbackPhoto(place);
}

function imageAttrs(place, alt = "") {
  const fallback = fallbackPhoto(place);
  return `src="${escapeAttr(photoUrl(place))}" data-fallback-src="${escapeAttr(fallback)}" alt="${escapeAttr(alt)}" loading="lazy" referrerpolicy="no-referrer"`;
}

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function regionSortIndex(region) {
  return prefectureRank.has(region) ? prefectureRank.get(region) : prefectureOrder.length + 1;
}

function sortedRegions(rows) {
  return unique(rows.map((p) => p.region)).sort((a, b) => {
    const rankDiff = regionSortIndex(a) - regionSortIndex(b);
    if (rankDiff) return rankDiff;
    return a.localeCompare(b, "zh-Hant");
  });
}

function recClass(rec) {
  if (rec.startsWith("S")) return "rec-s";
  if (rec.startsWith("A")) return "rec-a";
  return "rec-b";
}

function chipButton(label, count, filter) {
  const button = document.createElement("button");
  button.className = "chip";
  button.type = "button";
  button.dataset.filter = filter;
  button.dataset.value = label;
  button.innerHTML = `${escapeHtml(label)}<b>${count.toLocaleString()}</b>`;
  return button;
}

function renderSummary() {
  if ($("totalStat")) $("totalStat").textContent = state.places.length.toLocaleString();
  if ($("regionStat")) $("regionStat").textContent = unique(state.places.map((p) => p.region)).length;
  if ($("kindStat")) $("kindStat").textContent = unique(state.places.map((p) => p.kind)).length;

  const regionCounts = countBy(state.places, "region");
  const kindCounts = countBy(state.places, "kind");

  const regionBox = $("regionChips");
  const kindBox = $("kindChips");
  if (!regionBox || !kindBox) return;
  regionBox.innerHTML = "";
  kindBox.innerHTML = "";

  for (const region of sortedRegions(state.places)) {
    if (regionCounts.has(region)) regionBox.appendChild(chipButton(region, regionCounts.get(region), "region"));
  }
  for (const [kind, count] of [...kindCounts.entries()].sort((a, b) => b[1] - a[1])) {
    kindBox.appendChild(chipButton(kind, count, "kind"));
  }
}

function updateChipState() {
  document.querySelectorAll(".chip").forEach((chip) => {
    const targets = {
      region: $("regionFilter"),
      kind: $("kindFilter"),
    };
    const target = targets[chip.dataset.filter];
    chip.classList.toggle("active", target && target.value === chip.dataset.value);
  });
}

function card(place) {
  const article = document.createElement("article");
  article.className = "card";
  article.dataset.placeIndex = place.index;
  article.innerHTML = `
    <div class="photo-wrap">
      <img ${imageAttrs(place, place.name)}>
      <div class="badge-row">
        <span class="badge ${recClass(place.recommendation)}">${escapeHtml(place.recommendation)}</span>
        <span class="badge">${escapeHtml(place.region)}</span>
      </div>
    </div>
    <div class="card-body">
      <h3>${escapeHtml(place.name)}</h3>
      <p class="meta">${escapeHtml(place.kind)} · ${escapeHtml(place.category || place.query || "")}</p>
      <p class="meta">評分 ${Number(place.rating).toFixed(1)} · 評論 ${Number(place.reviews).toLocaleString()} · ${escapeHtml(place.cost || "請點 Google Maps 確認")}</p>
      <div class="actions">
        <button type="button" data-preview="${place.index}">預覽</button>
        <button type="button" class="secondary-button" data-map-focus="${place.index}">地圖</button>
        <a href="${escapeAttr(place.link)}" target="_blank" rel="noopener">Maps</a>
      </div>
    </div>`;
  return article;
}

function setupMap() {
  if (!window.L) {
    $("map").innerHTML = "<p class='map-error'>地圖套件載入失敗，請稍後重新整理。</p>";
    return;
  }
  const mapEl = $("map");
  state.map = L.map(mapEl, { preferCanvas: true, scrollWheelZoom: false }).setView([34.8, 136.2], 5);
  mapEl.addEventListener("mouseenter", () => state.map.scrollWheelZoom.enable());
  mapEl.addEventListener("mouseleave", () => state.map.scrollWheelZoom.disable());
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);
  state.markerRenderer = L.canvas({ padding: 0.4 });
  state.markerLayer = L.layerGroup().addTo(state.map);
}

function markerPopup(place) {
  return `
    <div class="map-popup">
      <strong>${escapeHtml(place.name)}</strong>
      <span>${escapeHtml(place.region)} · ${escapeHtml(place.kind)}</span>
      <span>評分 ${Number(place.rating).toFixed(1)} · 評論 ${Number(place.reviews).toLocaleString()}</span>
      <div class="popup-actions">
        <button type="button" data-preview="${place.index}">預覽</button>
        <a href="${escapeAttr(place.link)}" target="_blank" rel="noopener">Maps</a>
      </div>
    </div>`;
}

function markerColor(place) {
  const reviews = Number(place.reviews || 0);
  const rating = Number(place.rating || 0);
  if (rating >= 4.4 && reviews >= 3000) return "#1f4f6f";
  if (reviews >= 500) return "#4f6f52";
  return "#b6422c";
}

function markerTooltip(place) {
  return `
    <article class="hover-card">
      <img ${imageAttrs(place, "")}>
      <div>
        <strong>${escapeHtml(place.name)}</strong>
        <span>${escapeHtml(place.region)} · ${escapeHtml(place.kind)}</span>
        <span>評分 ${Number(place.rating).toFixed(1)} · 評論 ${Number(place.reviews).toLocaleString()}</span>
        <span>${escapeHtml(place.cost || "請點 Google Maps 確認")}</span>
      </div>
    </article>`;
}

function validMapPoints(rows = state.filtered) {
  return rows.filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)));
}

function createMarker(place) {
  const color = markerColor(place);
  return L.circleMarker([Number(place.lat), Number(place.lng)], {
    renderer: state.markerRenderer,
    radius: Number(place.reviews || 0) >= 3000 ? 7 : 6,
    color: "#ffffff",
    weight: 2,
    fillColor: color,
    fillOpacity: 0.9,
    bubblingMouseEvents: false,
  })
    .bindTooltip(markerTooltip(place), {
      className: "map-hover-card",
      direction: "top",
      offset: [0, -10],
      opacity: 1,
      sticky: true,
    })
    .bindPopup(markerPopup(place))
    .on("mouseover", function () {
      this.setStyle({ radius: 9, weight: 3, fillOpacity: 1 });
      this.openTooltip();
    })
    .on("mouseout", function () {
      this.setStyle({ radius: Number(place.reviews || 0) >= 3000 ? 7 : 6, weight: 2, fillOpacity: 0.9 });
      this.closeTooltip();
    });
}

function addMarker(place) {
  const index = Number(place.index);
  if (state.markers.has(index)) return state.markers.get(index);
  const marker = createMarker(place);
  marker.addTo(state.markerLayer);
  state.markers.set(index, marker);
  return marker;
}

function renderMap() {
  if (!state.map || !state.markerLayer) return;
  const token = ++state.mapRenderToken;
  state.markerLayer.clearLayers();
  state.markers.clear();

  const points = validMapPoints();
  $("mapCount").textContent = points.length.toLocaleString();

  let cursor = 0;
  const chunkSize = points.length > 8000 ? 300 : points.length > 3000 ? 450 : 900;
  function drawChunk() {
    if (token !== state.mapRenderToken) return;
    const end = Math.min(cursor + chunkSize, points.length);
    for (; cursor < end; cursor += 1) {
      addMarker(points[cursor]);
    }
    if (cursor < points.length) {
      requestAnimationFrame(drawChunk);
    }
  }

  requestAnimationFrame(drawChunk);
  if (points.length) fitMapToFiltered(false);
}

function fitMapToFiltered(animated = true) {
  if (!state.map) return;
  const points = validMapPoints();
  if (!points.length) return;
  const bounds = L.latLngBounds(points.map((place) => [Number(place.lat), Number(place.lng)]));
  state.map.fitBounds(bounds.pad(0.12), { animate: animated, maxZoom: 11 });
}

function focusMap(placeIndex) {
  const place = state.places.find((item) => Number(item.index) === Number(placeIndex));
  if (!place || !state.map || !state.markerLayer) return;
  const marker = state.markers.get(Number(placeIndex)) || addMarker(place);
  document.querySelector("#mapSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  state.map.setView([Number(place.lat), Number(place.lng)], 13);
  marker.openTooltip();
  marker.openPopup();
}

function applyFilters(resetVisible = true) {
  const q = $("searchInput").value.trim().toLowerCase();
  const region = $("regionFilter").value;
  const kind = $("kindFilter").value;
  const minRating = Number($("ratingFilter").value || 0);
  const minReviews = Number($("reviewFilter").value || 0);
  const sort = $("sortSelect").value;

  state.filtered = state.places.filter((p) => {
    const haystack = `${p.name} ${p.region} ${p.kind} ${p.category} ${p.query}`.toLowerCase();
    return (!q || haystack.includes(q)) &&
      (!region || p.region === region) &&
      (!kind || p.kind === kind) &&
      Number(p.rating || 0) >= minRating &&
      Number(p.reviews || 0) >= minReviews;
  });

  state.filtered.sort((a, b) => {
    if (sort === "reviews") return b.reviews - a.reviews;
    if (sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
    if (sort === "region") return regionSortIndex(a.region) - regionSortIndex(b.region) || b.score - a.score;
    return b.score - a.score;
  });

  if (resetVisible) state.visible = 36;
  updateChipState();
  renderCards();
  renderMap();
}

function renderCards() {
  $("resultCount").textContent = state.filtered.length.toLocaleString();
  const grid = $("cardGrid");
  grid.innerHTML = "";
  for (const place of state.filtered.slice(0, state.visible)) {
    grid.appendChild(card(place));
  }
  $("loadMore").style.display = state.visible < state.filtered.length ? "block" : "none";
}

function showPreview(placeIndex) {
  const place = state.places.find((item) => Number(item.index) === Number(placeIndex));
  if (!place) return;
  state.activePreview = place;

  $("previewPhoto").src = photoUrl(place);
  $("previewPhoto").dataset.fallbackSrc = fallbackPhoto(place);
  $("previewPhoto").alt = place.name;
  $("previewTitle").textContent = place.name;
  $("previewRating").textContent = Number(place.rating).toFixed(1);
  $("previewReviews").textContent = Number(place.reviews).toLocaleString();
  $("previewCost").textContent = place.cost || "請點 Google Maps 確認";
  $("previewCoords").textContent = `${Number(place.lat).toFixed(5)}, ${Number(place.lng).toFixed(5)}`;
  $("previewMaps").href = place.link;
  $("previewBadges").innerHTML = `
    <span class="badge ${recClass(place.recommendation)}">${escapeHtml(place.recommendation)}</span>
    <span class="badge">${escapeHtml(place.region)}</span>
    <span class="badge">${escapeHtml(place.kind)}</span>
    <span class="badge">評論 ${Number(place.reviews).toLocaleString()}</span>`;

  $("previewModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closePreview() {
  $("previewModal").hidden = true;
  document.body.classList.remove("modal-open");
  state.activePreview = null;
}

function wireEvents() {
  for (const id of ["searchInput", "regionFilter", "kindFilter", "ratingFilter", "reviewFilter", "sortSelect"]) {
    $(id).addEventListener("input", () => applyFilters(true));
  }

  document.addEventListener("click", (event) => {
    const previewButton = event.target.closest("[data-preview]");
    if (previewButton) {
      showPreview(previewButton.dataset.preview);
      return;
    }

    const mapButton = event.target.closest("[data-map-focus]");
    if (mapButton) {
      focusMap(mapButton.dataset.mapFocus);
      return;
    }

    const chip = event.target.closest(".chip");
    if (chip) {
      const targets = {
        region: $("regionFilter"),
        kind: $("kindFilter"),
      };
      const target = targets[chip.dataset.filter];
      if (!target) return;
      target.value = target.value === chip.dataset.value ? "" : chip.dataset.value;
      applyFilters(true);
      document.querySelector("#places")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (event.target.closest("[data-close-preview]")) {
      closePreview();
    }
  });

  document.addEventListener("error", (event) => {
    const img = event.target && event.target.closest ? event.target.closest("img[data-fallback-src]") : null;
    if (img && img.src !== img.dataset.fallbackSrc) {
      img.src = img.dataset.fallbackSrc;
    }
  }, true);

  $("loadMore").addEventListener("click", () => {
    state.visible += 36;
    renderCards();
  });
  $("fitMap").addEventListener("click", () => fitMapToFiltered(true));
  $("previewFocusMap").addEventListener("click", () => {
    if (state.activePreview) {
      const index = state.activePreview.index;
      closePreview();
      focusMap(index);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("previewModal").hidden) closePreview();
  });
}

function datasetMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dataset") === "stress" ? "stress" : "production";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function loadProductionPlaces() {
  const cacheKey = "kyushu-tokyo-nagoya-20260710";
  const manifestUrl = `assets/places-manifest.json?v=${cacheKey}`;
  let rows = [];
  try {
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (Array.isArray(manifest.shards) && manifest.shards.length) {
      const batches = await Promise.all(
        manifest.shards.map((shard) => fetchJson(new URL(`${shard.url}?v=${cacheKey}`, manifestResponse.url).toString()))
      );
      rows = batches.flat();
    }
  } catch (error) {
    console.warn("places manifest fallback", error);
  }
  if (!rows.length) rows = await fetchJson(`assets/places.json?v=${cacheKey}`);
  return mergePlaces(rows, await loadSupplementalPlaces(cacheKey));
}

async function loadSupplementalPlaces(cacheKey) {
  try {
    return await fetchJson(`assets/extras-tokyo-nagoya.json?v=${cacheKey}`);
  } catch (error) {
    console.info("supplemental places skipped", error);
    return [];
  }
}

function mergePlaces(primaryRows, supplementalRows) {
  const merged = [];
  const seen = new Set();
  for (const row of [...primaryRows, ...supplementalRows]) {
    const key = `${row.region || ""}::${row.name || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, index: merged.length + 1 });
  }
  return merged;
}

function loadPlaces() {
  if (datasetMode() === "stress") {
    return fetchJson("data/stress/places-15000.synthetic.json?v=stress-15000-20260710");
  }
  return loadProductionPlaces();
}

async function init() {
  state.places = await loadPlaces();

  renderSummary();
  fillSelect($("regionFilter"), sortedRegions(state.places));
  fillSelect($("kindFilter"), unique(state.places.map((p) => p.kind)).sort());
  fillSelect($("ratingFilter"), ["3.8", "4.0", "4.2", "4.4", "4.6", "4.8"]);
  fillSelect($("reviewFilter"), ["50", "100", "300", "500", "1000", "3000", "10000"]);

  setupMap();
  wireEvents();
  applyFilters(true);
}

init().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<div style="padding:16px;background:#fee2e2;color:#991b1b">資料載入失敗：${escapeHtml(error.message)}</div>`);
});

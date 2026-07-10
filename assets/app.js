const state = {
  places: [],
  filtered: [],
  visible: 36,
  map: null,
  markerLayer: null,
  markers: new Map(),
  activePreview: null,
};

const regionOrder = ["福岡縣", "佐賀縣", "長崎縣", "熊本縣", "大分縣", "宮崎縣", "鹿兒島縣", "山口/下關"];
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

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function recClass(rec) {
  if (rec.startsWith("S")) return "rec-s";
  if (rec.startsWith("A")) return "rec-a";
  return "rec-b";
}

function buildIntro(place) {
  const kind = place.kind || "地點";
  const region = place.region || "九州";
  const name = place.name || "這個地點";
  const category = place.category || place.query || kind;

  if (kind.includes("海鮮")) {
    return `${name} 是 ${region} 的${category}候選，適合想找海鮮、市場或壽司時先收藏。建議點進 Google Maps 確認營業時間、菜單與最新評論。`;
  }
  if (kind.includes("自然") || kind.includes("展望")) {
    return `${name} 適合安排成看海、岬灣、展望或自然景觀的停靠點。可搭配地圖位置判斷是否順路。`;
  }
  if (kind.includes("溫泉")) {
    return `${name} 是 ${region} 的溫泉相關候選，適合排入放鬆、日歸湯或住宿備案。出發前請確認入浴時間、休館日與是否需預約。`;
  }
  if (kind.includes("神社") || kind.includes("寺")) {
    return `${name} 是 ${region} 的文化與參拜候選，適合放在城市散步或郊區路線中。可先看地圖位置，再決定要不要和附近景點串在一起。`;
  }
  if (kind.includes("咖啡") || kind.includes("甜點")) {
    return `${name} 適合作為移動途中休息、下午茶或雨天備案。這類店家營業日變動較常見，建議出發前再查一次。`;
  }
  return `${name} 是 ${region} 的${kind}候選，依 Google Maps 評分、評論數與座標清理後收錄。可先用預覽判斷興趣，再點 Google Maps 看最新狀態。`;
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
  $("totalStat").textContent = state.places.length.toLocaleString();
  $("regionStat").textContent = unique(state.places.map((p) => p.region)).length;
  $("kindStat").textContent = unique(state.places.map((p) => p.kind)).length;

  const regionCounts = countBy(state.places, "region");
  const kindCounts = countBy(state.places, "kind");

  const regionBox = $("regionChips");
  const kindBox = $("kindChips");
  regionBox.innerHTML = "";
  kindBox.innerHTML = "";

  for (const region of regionOrder) {
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
      <img src="${escapeAttr(place.photo)}" alt="${escapeAttr(place.name)}" loading="lazy" referrerpolicy="no-referrer">
      <div class="badge-row">
        <span class="badge ${recClass(place.recommendation)}">${escapeHtml(place.recommendation)}</span>
        <span class="badge">${escapeHtml(place.region)}</span>
      </div>
    </div>
    <div class="card-body">
      <h3>${escapeHtml(place.name)}</h3>
      <p class="meta">${escapeHtml(place.kind)} · ${escapeHtml(place.category || place.query || "")}</p>
      <p class="meta">評分 ${Number(place.rating).toFixed(1)} · 評論 ${Number(place.reviews).toLocaleString()} · ${escapeHtml(place.cost || "請點 Google Maps 確認")}</p>
      <p class="reason">${escapeHtml(buildIntro(place))}</p>
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
  state.map = L.map("map", { scrollWheelZoom: false }).setView([32.7, 130.7], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);
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

function markerIcon(place) {
  const reviews = Number(place.reviews || 0);
  const rating = Number(place.rating || 0);
  const markerClass = rating >= 4.4 && reviews >= 3000 ? "marker-high" : reviews >= 500 ? "marker-mid" : "marker-candidate";
  return L.divIcon({
    className: `custom-marker ${markerClass}`,
    html: `<span>${escapeHtml((place.kind || "").slice(0, 1))}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function renderMap() {
  if (!state.map || !state.markerLayer) return;
  state.markerLayer.clearLayers();
  state.markers.clear();

  const points = state.filtered.filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)));
  $("mapCount").textContent = points.length.toLocaleString();

  for (const place of points) {
    const marker = L.marker([Number(place.lat), Number(place.lng)], { icon: markerIcon(place) }).bindPopup(markerPopup(place));
    marker.addTo(state.markerLayer);
    state.markers.set(Number(place.index), marker);
  }

  if (points.length) fitMapToFiltered(false);
}

function fitMapToFiltered(animated = true) {
  if (!state.map || !state.markerLayer) return;
  const markers = [...state.markers.values()];
  if (!markers.length) return;
  const group = L.featureGroup(markers);
  state.map.fitBounds(group.getBounds().pad(0.12), { animate: animated, maxZoom: 11 });
}

function focusMap(placeIndex) {
  const marker = state.markers.get(Number(placeIndex));
  const place = state.places.find((item) => Number(item.index) === Number(placeIndex));
  if (!marker || !place || !state.map) return;
  document.querySelector("#mapSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  state.map.setView([Number(place.lat), Number(place.lng)], 13);
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
    const haystack = `${p.name} ${p.region} ${p.kind} ${p.category} ${p.query} ${p.reason}`.toLowerCase();
    return (!q || haystack.includes(q)) &&
      (!region || p.region === region) &&
      (!kind || p.kind === kind) &&
      Number(p.rating || 0) >= minRating &&
      Number(p.reviews || 0) >= minReviews;
  });

  state.filtered.sort((a, b) => {
    if (sort === "reviews") return b.reviews - a.reviews;
    if (sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
    if (sort === "region") return regionOrder.indexOf(a.region) - regionOrder.indexOf(b.region) || b.score - a.score;
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

  $("previewPhoto").src = place.photo;
  $("previewPhoto").alt = place.name;
  $("previewTitle").textContent = place.name;
  $("previewIntro").textContent = buildIntro(place);
  $("previewRating").textContent = Number(place.rating).toFixed(1);
  $("previewReviews").textContent = Number(place.reviews).toLocaleString();
  $("previewCost").textContent = place.cost || "請點 Google Maps 確認";
  $("previewCoords").textContent = `${Number(place.lat).toFixed(5)}, ${Number(place.lng).toFixed(5)}`;
  $("previewReason").textContent = place.reason || "";
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

async function init() {
  const res = await fetch("assets/places.json");
  state.places = await res.json();

  renderSummary();
  fillSelect($("regionFilter"), regionOrder.filter((region) => state.places.some((p) => p.region === region)));
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

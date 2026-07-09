const state = {
  places: [],
  filtered: [],
  visible: 36,
};

const regionOrder = ["福岡縣", "佐賀縣", "長崎縣", "熊本縣", "大分縣", "宮崎縣", "鹿兒島縣", "山口/下關"];

const $ = (id) => document.getElementById(id);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function fillSelect(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
}

function updateChipState() {
  document.querySelectorAll(".chip").forEach((chip) => {
    const target = chip.dataset.filter === "region" ? $("regionFilter") : $("kindFilter");
    chip.classList.toggle("active", target && target.value === chip.dataset.value);
  });
}

function recClass(rec) {
  if (rec.startsWith("S")) return "rec-s";
  if (rec.startsWith("A")) return "rec-a";
  return "rec-b";
}

function yenText(cost) {
  return cost || "花費請點 Maps 確認";
}

function card(place) {
  const article = document.createElement("article");
  article.className = "card";
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
      <p class="meta">評分 ${place.rating.toFixed(1)} · 評論 ${place.reviews.toLocaleString()} · ${escapeHtml(yenText(place.cost))}</p>
      <p class="reason">${escapeHtml(place.reason)}</p>
      <div class="actions">
        <a href="${escapeAttr(place.link)}" target="_blank" rel="noopener">Google Maps</a>
        <a class="secondary" href="https://www.google.com/search?q=${encodeURIComponent(place.name + " " + place.region)}" target="_blank" rel="noopener">搜尋</a>
      </div>
    </div>`;
  return article;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function applyFilters(resetVisible = true) {
  const q = $("searchInput").value.trim().toLowerCase();
  const region = $("regionFilter").value;
  const kind = $("kindFilter").value;
  const rec = $("recFilter").value;
  const sort = $("sortSelect").value;

  state.filtered = state.places.filter((p) => {
    const haystack = `${p.name} ${p.region} ${p.kind} ${p.category} ${p.query} ${p.reason}`.toLowerCase();
    return (!q || haystack.includes(q)) &&
      (!region || p.region === region) &&
      (!kind || p.kind === kind) &&
      (!rec || p.recommendation === rec);
  });

  state.filtered.sort((a, b) => {
    if (sort === "reviews") return b.reviews - a.reviews;
    if (sort === "rating") return b.rating - a.rating || b.reviews - a.reviews;
    if (sort === "region") return regionOrder.indexOf(a.region) - regionOrder.indexOf(b.region) || b.score - a.score;
    return b.score - a.score;
  });

  if (resetVisible) state.visible = 36;
  updateChipState();
  render();
}

function render() {
  $("resultCount").textContent = state.filtered.length.toLocaleString();
  const grid = $("cardGrid");
  grid.innerHTML = "";
  for (const place of state.filtered.slice(0, state.visible)) {
    grid.appendChild(card(place));
  }
  $("loadMore").style.display = state.visible < state.filtered.length ? "block" : "none";
}

async function init() {
  const res = await fetch("assets/places.json");
  state.places = await res.json();
  fillSelect($("regionFilter"), regionOrder.filter((region) => state.places.some((p) => p.region === region)));
  fillSelect($("kindFilter"), unique(state.places.map((p) => p.kind)).sort());
  fillSelect($("recFilter"), unique(state.places.map((p) => p.recommendation)).sort());

  for (const id of ["searchInput", "regionFilter", "kindFilter", "recFilter", "sortSelect"]) {
    $(id).addEventListener("input", () => applyFilters(true));
  }
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const target = chip.dataset.filter === "region" ? $("regionFilter") : $("kindFilter");
      if (!target) return;
      target.value = target.value === chip.dataset.value ? "" : chip.dataset.value;
      applyFilters(true);
      document.querySelector("#places")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  $("loadMore").addEventListener("click", () => {
    state.visible += 36;
    render();
  });
  applyFilters(true);
}

init().catch((error) => {
  document.body.insertAdjacentHTML("afterbegin", `<div style="padding:16px;background:#fee2e2;color:#991b1b">網站資料載入失敗：${escapeHtml(error.message)}</div>`);
});

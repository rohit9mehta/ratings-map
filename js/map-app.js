import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { debounce } from "./utils.js";
import { searchPlaces } from "./map-search.js";

// ─── Map ────────────────────────────────────────────
const map = L.map("map", {
  zoomControl: false,
}).setView([37.7749, -122.4194], 12);

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// ─── State ──────────────────────────────────────────
const savedMarkers = new Map();
const savedLayer = L.layerGroup().addTo(map);
let tempMarker = null;
let tempData = null;
let editingId = null;
let modalItems = [];

// ─── DOM ────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const searchInput = $("search-input");
const searchClear = $("search-clear");
const searchResults = $("search-results");
const saveOverlay = $("save-overlay");
const modalTitle = $("modal-title");
const saveName = $("save-name");
const saveAddress = $("save-address");
const addItemBtn = $("add-item-btn");
const itemsContainer = $("items-container");
const itemsEmpty = $("items-empty");
const saveBtn = $("save-btn");
const modalClose = $("modal-close");
const drawerToggle = $("drawer-toggle");
const drawer = $("drawer");
const drawerClose = $("drawer-close");
const drawerCount = $("drawer-count");
const savedList = $("saved-list");
const savedEmpty = $("saved-empty");

// ─── Search ─────────────────────────────────────────
const doSearch = debounce(async (q) => {
  if (!q || q.length < 2) {
    searchResults.innerHTML = "";
    return;
  }
  const results = await searchPlaces(q);
  searchResults.innerHTML = results
    .map(
      (r, i) => `
    <li data-idx="${i}">
      <div class="result-name">${esc(r.name)}</div>
      <div class="result-type">${esc(r.location)}</div>
    </li>`
    )
    .join("");
  searchResults._results = results;
}, 600);

searchInput.addEventListener("input", () => {
  const v = searchInput.value.trim();
  searchClear.style.display = v ? "block" : "none";
  doSearch(v);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.style.display = "none";
  searchResults.innerHTML = "";
  clearTemp();
});

searchResults.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const r = searchResults._results?.[li.dataset.idx];
  if (!r) return;
  searchResults.innerHTML = "";
  searchInput.value = r.name;
  flyToResult(r);
});

function flyToResult(r) {
  clearTemp();
  tempData = r;
  map.flyTo([r.lat, r.lng], 16);

  tempMarker = L.marker([r.lat, r.lng], {
    icon: L.divIcon({
      className: "",
      html: '<div class="marker-temp"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    }),
  }).addTo(map);

  tempMarker
    .bindPopup(
      `<div class="popup-content">
      <h4>${esc(r.name)}</h4>
      <p class="popup-address">${esc(r.displayName)}</p>
      <button class="popup-btn-save" onclick="window._saveFromSearch()">Save this place</button>
    </div>`,
      { offset: [0, -4], closeButton: false }
    )
    .openPopup();
}

function clearTemp() {
  if (tempMarker) {
    tempMarker.remove();
    tempMarker = null;
    tempData = null;
  }
}

// ─── Modal items ────────────────────────────────────
function ratingCol(label, field, item, i) {
  const active = item[field] !== null;
  const val = active ? item[field] : 5;
  return `
    <div class="item-rating-col ${active ? "" : "rating-disabled"}">
      <label class="item-rating-toggle">
        <input type="checkbox" ${active ? "checked" : ""}
          data-toggle="${field}" data-idx="${i}">
        <span class="item-rating-label">${label}</span>
      </label>
      <div class="item-rating-row">
        <input type="range" min="0" max="10" step="0.1"
          value="${val}" ${active ? "" : "disabled"}
          data-field="${field}" data-idx="${i}">
        <span class="item-rating-val">${active ? fmt(val) : "—"}</span>
      </div>
    </div>`;
}

function renderModalItems() {
  itemsEmpty.style.display = modalItems.length === 0 ? "block" : "none";
  itemsContainer.innerHTML = modalItems
    .map(
      (item, i) => `
    <div class="item-card" style="animation-delay:${i * 50}ms" data-idx="${i}">
      <div class="item-card-header">
        <input type="text"
          class="item-name-input"
          placeholder="e.g. Margherita pizza"
          value="${escAttr(item.name)}"
          data-field="name" data-idx="${i}">
        <button class="item-delete-btn" data-idx="${i}" title="Remove">&times;</button>
      </div>
      <div class="item-ratings">
        ${ratingCol("Ayushi", "ayushiRating", item, i)}
        ${ratingCol("Rohit", "rohitRating", item, i)}
      </div>
    </div>`
    )
    .join("");
}

itemsContainer.addEventListener("input", (e) => {
  const idx = parseInt(e.target.dataset.idx);

  // Rating toggle checkbox
  const toggleField = e.target.dataset.toggle;
  if (toggleField && !isNaN(idx)) {
    const on = e.target.checked;
    modalItems[idx][toggleField] = on ? 5 : null;
    // Re-render just this item's rating col
    const col = e.target.closest(".item-rating-col");
    const range = col.querySelector('input[type="range"]');
    const valSpan = col.querySelector(".item-rating-val");
    range.disabled = !on;
    range.value = on ? 5 : 5;
    valSpan.textContent = on ? "5.0" : "—";
    col.classList.toggle("rating-disabled", !on);
    return;
  }

  const field = e.target.dataset.field;
  if (isNaN(idx) || !field) return;

  if (field === "name") {
    modalItems[idx].name = e.target.value;
  } else {
    modalItems[idx][field] = parseFloat(e.target.value);
    const val = e.target
      .closest(".item-rating-row")
      ?.querySelector(".item-rating-val");
    if (val) val.textContent = fmt(e.target.value);
  }
});

itemsContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".item-delete-btn");
  if (!btn) return;
  modalItems.splice(parseInt(btn.dataset.idx), 1);
  renderModalItems();
});

addItemBtn.addEventListener("click", () => {
  modalItems.push({ name: "", ayushiRating: 5, rohitRating: 5 });
  renderModalItems();
  const inputs = itemsContainer.querySelectorAll(".item-name-input");
  if (inputs.length) inputs[inputs.length - 1].focus();
});

// ─── Save modal lifecycle ───────────────────────────
window._saveFromSearch = () => {
  if (!tempData) return;
  editingId = null;
  modalItems = [{ name: "", ayushiRating: 5, rohitRating: 5 }];
  openModal(tempData.name, tempData.displayName);
};

window._editPlace = (docId) => {
  const m = savedMarkers.get(docId);
  if (!m) return;
  const d = m._placeData;
  editingId = docId;
  modalItems = (d.items || []).map((it) => ({ ...it }));
  openModal(d.name, d.address);
  map.closePopup();
};

window._deletePlace = async (docId) => {
  if (!confirm("Delete this saved place?")) return;
  await deleteDoc(doc(db, "places", docId));
};

function openModal(name, address) {
  modalTitle.textContent = editingId ? "Edit Place" : "Save Place";
  saveName.value = name;
  saveAddress.textContent = address;
  renderModalItems();
  saveOverlay.style.display = "flex";
}

function closeModal() {
  saveOverlay.style.display = "none";
  editingId = null;
  modalItems = [];
}

modalClose.addEventListener("click", closeModal);
saveOverlay.addEventListener("click", (e) => {
  if (e.target === saveOverlay) closeModal();
});

saveBtn.addEventListener("click", async () => {
  const items = modalItems
    .filter((it) => it.name.trim())
    .map((it) => ({
      name: it.name.trim(),
      ayushiRating: it.ayushiRating !== null ? it.ayushiRating : null,
      rohitRating: it.rohitRating !== null ? it.rohitRating : null,
    }));

  try {
    if (editingId) {
      await updateDoc(doc(db, "places", editingId), {
        items,
        updatedAt: serverTimestamp(),
      });
    } else if (tempData) {
      await addDoc(collection(db, "places"), {
        name: tempData.name,
        lat: tempData.lat,
        lng: tempData.lng,
        address: tempData.displayName,
        items,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      clearTemp();
    } else {
      console.error("No tempData or editingId — cannot save");
      return;
    }
    closeModal();
  } catch (err) {
    console.error("Save failed:", err);
    alert("Save failed: " + err.message);
  }
});

// ─── Firestore → markers ────────────────────────────
const placesQ = query(
  collection(db, "places"),
  orderBy("createdAt", "desc")
);

onSnapshot(placesQ, (snap) => {
  savedLayer.clearLayers();
  savedMarkers.clear();
  const places = [];

  snap.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    places.push(data);
    const marker = makeSavedMarker(data);
    savedMarkers.set(d.id, marker);
    savedLayer.addLayer(marker);
  });

  renderDrawer(places);
});

function avg(items) {
  if (!items?.length) return { a: null, r: null };
  const aItems = items.filter((it) => it.ayushiRating !== null);
  const rItems = items.filter((it) => it.rohitRating !== null);
  const a = aItems.length ? aItems.reduce((s, it) => s + it.ayushiRating, 0) / aItems.length : null;
  const r = rItems.length ? rItems.reduce((s, it) => s + it.rohitRating, 0) / rItems.length : null;
  return { a, r };
}

function makeSavedMarker(data) {
  const items = data.items || [];
  const av = avg(items);
  const avgText =
    av.a !== null ? `${fmt(av.a)} · ${fmt(av.r)}` : "—";
  const countLabel =
    items.length === 1 ? "1 item" : `${items.length} items`;

  const marker = L.marker([data.lat, data.lng], {
    icon: L.divIcon({
      className: "marker-saved",
      html: `<span class="marker-rose">🌹</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    }),
  });

  marker._placeData = data;

  // Popup
  let body;
  if (items.length > 0) {
    const avgCols = [];
    if (av.a !== null) avgCols.push(`<div class="popup-avg-col"><div class="popup-avg-label">Ayushi</div><div class="popup-avg-val">${fmt(av.a)}</div></div>`);
    if (av.r !== null) avgCols.push(`<div class="popup-avg-col"><div class="popup-avg-label">Rohit</div><div class="popup-avg-val">${fmt(av.r)}</div></div>`);
    const avgBar = avgCols.length ? `<div class="popup-avg-bar">${avgCols.join("")}</div>` : "";
    const list = items
      .map((it) => {
        const scores = [];
        if (it.ayushiRating !== null) scores.push(`<div class="popup-item-score">A <span>${fmt(it.ayushiRating)}</span></div>`);
        if (it.rohitRating !== null) scores.push(`<div class="popup-item-score">R <span>${fmt(it.rohitRating)}</span></div>`);
        return `
      <li class="popup-item">
        <div class="popup-item-name">${esc(it.name)}</div>
        <div class="popup-item-scores">${scores.join("")}</div>
      </li>`;
      })
      .join("");
    body = avgBar + `<ul class="popup-items">${list}</ul>`;
  } else {
    body = `<p class="popup-no-items">No items rated yet</p>`;
  }

  marker.bindPopup(`
    <div class="popup-content">
      <h4>${esc(data.name)}</h4>
      <p class="popup-address">${esc(data.address || "")}</p>
      ${body}
      <div class="popup-actions">
        <button class="popup-btn-edit" onclick="window._editPlace('${data.id}')">Edit</button>
        <button class="popup-btn-delete" onclick="window._deletePlace('${data.id}')">Delete</button>
      </div>
    </div>`);

  return marker;
}

// ─── Drawer ─────────────────────────────────────────
drawerToggle.addEventListener("click", () => {
  drawer.style.display = drawer.style.display === "none" ? "block" : "none";
});

drawerClose.addEventListener("click", () => {
  drawer.style.display = "none";
});

function renderDrawer(places) {
  drawerCount.textContent = places.length;

  if (!places.length) {
    savedList.innerHTML = "";
    savedEmpty.style.display = "block";
    return;
  }

  savedEmpty.style.display = "none";
  savedList.innerHTML = places
    .map((p) => {
      const items = p.items || [];
      const av = avg(items);
      const avgParts = [];
      if (av.a !== null) avgParts.push(`A ${fmt(av.a)}`);
      if (av.r !== null) avgParts.push(`R ${fmt(av.r)}`);
      const avgText = avgParts.join(" · ");
      const count =
        items.length === 1 ? "1 item" : `${items.length} items`;
      const preview = items
        .slice(0, 3)
        .map((it) => it.name)
        .join(", ");

      return `
      <li data-id="${p.id}" data-lat="${p.lat}" data-lng="${p.lng}">
        <div class="saved-list-top">
          <span class="saved-name">${esc(p.name)}</span>
          <span class="saved-avg">${avgText}</span>
        </div>
        <div class="saved-meta">${count}</div>
        ${preview ? `<div class="saved-items-preview">${esc(preview)}</div>` : ""}
      </li>`;
    })
    .join("");
}

savedList.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const { id, lat, lng } = li.dataset;
  map.flyTo([parseFloat(lat), parseFloat(lng)], 16);
  drawer.style.display = "none";
  const m = savedMarkers.get(id);
  if (m) setTimeout(() => m.openPopup(), 600);
});

// ─── Helpers ────────────────────────────────────────
function esc(s) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return esc(s).replace(/'/g, "&#39;");
}

function fmt(n) {
  return Number(n).toFixed(1);
}

map.on("click", () => {
  searchResults.innerHTML = "";
});

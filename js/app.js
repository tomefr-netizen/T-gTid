const VERSION = '0.1';

// --- State ---
const State = {
  activeTab: 'departures',
  refreshTimer: null,
  allStations: [],
  loading: false,
  currentTrain: null,
  viewStationSig: null,
};

// --- Helpers ---
function fmtTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
}

function delayMin(advertised, estimated) {
  if (!estimated || !advertised) return 0;
  return Math.round((new Date(estimated) - new Date(advertised)) / 60000);
}

function trainStatus(t) {
  if (t.Canceled === true) return 'cancelled';
  if (delayMin(t.AdvertisedTimeAtLocation, t.EstimatedTimeAtLocation) >= 5) return 'delayed';
  if (t.TimeAtLocation) return 'passed';
  return 'ontime';
}

function direction(t) {
  const locs = State.activeTab === 'departures' ? t.ToLocation : t.FromLocation;
  if (!Array.isArray(locs) || !locs.length) return '';
  const sig = [...locs].sort((a, b) => (a.Order || 0) - (b.Order || 0))[0]?.LocationName || '';
  return stationName(sig) || sig;
}

function isoDate(iso) {
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

// --- DOM refs ---
const $ = id => document.getElementById(id);
const el = {
  views:               document.querySelectorAll('.view'),
  headerTitle:         $('header-title'),
  btnBack:             $('btn-back'),
  btnSettings:         $('btn-settings'),
  tabs:                document.querySelectorAll('.tab'),
  btnGhost:            $('btn-ghost-toggle'),
  trainList:           $('train-list'),
  lastUpdated:         $('last-updated'),
  detailHeader:        $('train-detail-header'),
  trainStops:          $('train-stops'),
  btnSaveTrain:        $('btn-save-train'),
  btnGotoSaved:        $('btn-goto-saved'),
  stationActionBar:    $('station-action-bar'),
  btnFetchName:        $('btn-fetch-name'),
  btnGotoSavedStation: $('btn-goto-saved-station'),
  inputApiKey:         $('input-apikey'),
  inputStation:        $('input-station-search'),
  suggestions:         $('station-suggestions'),
  selectedStation:     $('selected-station'),
  btnGeolocate:        $('btn-geolocate'),
  btnTheme:            $('btn-theme'),
  btnSave:             $('btn-save-settings'),
  versionDisplay:      $('version-display'),
  btnUpdateApp:        $('btn-update-app'),
  toast:               $('toast'),
};

// --- Ghost station toggle ---
function updateGhostBtn() {
  const show = Settings.showGhostStations;
  el.btnGhost.textContent = show ? 'Dölj spökstationer' : 'Visa spökstationer';
  el.btnGhost.classList.toggle('ghost-active', show);
}

// --- Saved train buttons in detail view ---
function updateDetailActions() {
  const saved = Settings.savedTrain;
  const cur   = State.currentTrain;
  const isCurrent = saved && cur && saved.id === cur.id && saved.date === cur.date;
  el.btnSaveTrain.textContent = isCurrent ? 'Sparat ✓' : 'Spara tåg';
  el.btnSaveTrain.disabled = isCurrent;
  if (saved && !isCurrent) {
    el.btnGotoSaved.textContent = `Aktuellt tåg: ${saved.id}`;
    el.btnGotoSaved.hidden = false;
  } else {
    el.btnGotoSaved.hidden = true;
  }
}

// --- Station action bar in temp station view ---
function updateStationActionBar() {
  el.btnFetchName.dataset.sig = State.viewStationSig || '';
  el.btnFetchName.textContent = 'Hämta namn';
  el.btnFetchName.disabled = false;
  const saved = Settings.savedTrain;
  if (saved) {
    el.btnGotoSavedStation.textContent = `Tåg ${saved.id}`;
    el.btnGotoSavedStation.hidden = false;
  } else {
    el.btnGotoSavedStation.hidden = true;
  }
}

// --- View switching ---
function showView(id) {
  el.views.forEach(v => v.classList.toggle('active', v.id === id));
  el.btnBack.hidden     = id === 'view-station';
  el.btnSettings.hidden = id === 'view-settings';
}

function setTitle(text) {
  el.headerTitle.textContent = text;
}

// --- Toast ---
let toastTimer;
function toast(msg, ms = 3000) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

// --- Theme ---
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.btnTheme.textContent = theme === 'dark' ? 'Ljust tema' : 'Mörkt tema';
}

// --- Station name lookup ---
let stationNameCache = {};
let longNamesCache = {};

function stationName(sig) {
  return longNamesCache[sig] || stationNameCache[sig] || sig;
}

function loadLongNamesCache() {
  const stored = localStorage.getItem('tagtid_longnames');
  if (stored) longNamesCache = JSON.parse(stored);
}

async function ensureStations() {
  if (Object.keys(stationNameCache).length) return;
  try {
    const stations = await API.getStations(Settings.apiKey);
    State.allStations = stations;
    stationNameCache = Object.fromEntries(
      stations.map(s => [s.LocationSignature, s.AdvertisedShortLocationName])
    );
  } catch { /* fall back to showing LocationSignature codes */ }
}

// --- Render train list ---
function renderTrainList(trains) {
  if (!trains.length) {
    el.trainList.innerHTML = '<li class="state-msg">Inga tåg hittades för idag.</li>';
    return;
  }

  el.trainList.innerHTML = trains.map(t => {
    const status = trainStatus(t);
    const delay  = delayMin(t.AdvertisedTimeAtLocation, t.EstimatedTimeAtLocation);
    const dir    = direction(t);
    const adv    = fmtTime(t.AdvertisedTimeAtLocation);
    const est    = fmtTime(t.EstimatedTimeAtLocation);
    const actual = fmtTime(t.TimeAtLocation);
    const date   = isoDate(t.ScheduledDepartureDateTime);

    let badge;
    if      (status === 'cancelled') badge = '<span class="badge cancelled">Inställt</span>';
    else if (status === 'passed')    badge = `<span class="badge passed">Passerade ${actual}</span>`;
    else if (status === 'delayed')   badge = `<span class="badge delayed">Beräknas ${est} (+${delay} min)</span>`;
    else                             badge = '<span class="badge ontime">I tid</span>';

    const metaParts = [];
    if (t.TrackAtLocation) metaParts.push(`Spår ${t.TrackAtLocation}`);
    const operator = t.ProductInformation?.[0]?.Description;
    if (operator) metaParts.push(operator);
    if (t.TypeOfTraffic) metaParts.push(t.TypeOfTraffic);
    const dev = t.Deviation?.[0]?.Description;
    if (dev && status !== 'cancelled') metaParts.push(dev);
    const metaHtml = metaParts.length
      ? `<span class="train-meta">${metaParts.join(' · ')}</span>`
      : '';

    return `<li class="train-item" data-status="${status}"
                data-id="${t.AdvertisedTrainIdent}" data-date="${date}">
      <div class="train-time">${adv}</div>
      <div class="train-info">
        <span class="train-id">Tåg ${t.AdvertisedTrainIdent}</span>
        <span class="train-dir">${dir ? '→ ' + dir : ''}</span>
        ${metaHtml}
      </div>
      <div class="train-status">${badge}</div>
    </li>`;
  }).join('');

  el.trainList.querySelectorAll('.train-item').forEach(li => {
    li.addEventListener('click', () => {
      window.location.hash = `#/train/${encodeURIComponent(li.dataset.id)}/${li.dataset.date}`;
    });
  });
}

// --- Load station announcements ---
async function loadAnnouncements() {
  if (State.loading) return;
  const apiKey = Settings.apiKey;
  const stationSig = State.viewStationSig || Settings.stationSig;
  if (!apiKey || !stationSig) return;

  State.loading = true;
  el.trainList.innerHTML = '<li class="state-msg">Laddar...</li>';

  const type = State.activeTab === 'departures' ? 'Avgang' : 'Ankomst';
  try {
    const [trains] = await Promise.all([
      API.getAnnouncements(apiKey, stationSig, type),
      ensureStations(),
    ]);
    renderTrainList(trains);
    el.lastUpdated.textContent = `Uppdaterad ${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    el.trainList.innerHTML = `<li class="state-msg is-error">
      Fel: ${err.message}
      <button onclick="loadAnnouncements()">Försök igen</button>
    </li>`;
  } finally {
    State.loading = false;
  }
}

// --- Load train detail ---
async function loadTrainDetail(trainId, date) {
  State.currentTrain = { id: trainId, date };
  updateDetailActions();
  el.trainStops.innerHTML = '<li class="state-msg">Laddar...</li>';
  el.detailHeader.innerHTML = `<div class="detail-train-id">Tåg ${trainId}</div>`;

  await ensureStations();

  try {
    const raw = await API.getTrainStops(Settings.apiKey, trainId, date);
    if (!raw.length) {
      el.trainStops.innerHTML = '<li class="state-msg">Inga hållplatser hittades.</li>';
      return;
    }

    // Filter out unmanned meeting points unless user has toggled them on.
    // Uses the Advertised field on each TrainAnnouncement — false = meeting point only.
    const filtered = Settings.showGhostStations
      ? raw
      : raw.filter(s => s.Advertised !== false);

    // Deduplicate: each intermediate station has both Ankomst + Avgang.
    // Keep Avgang for all stations except the last unique station (final destination = Ankomst only).
    const byStation = new Map();
    for (const s of filtered) {
      const sig = s.LocationSignature;
      const existing = byStation.get(sig);
      if (!existing || (existing.ActivityType !== 'Avgang' && s.ActivityType === 'Avgang')) {
        byStation.set(sig, s);
      }
    }
    const stops = Array.from(byStation.values())
      .sort((a, b) => new Date(a.AdvertisedTimeAtLocation) - new Date(b.AdvertisedTimeAtLocation));

    const first = stops[0];
    const last  = stops[stops.length - 1];
    el.detailHeader.innerHTML = `
      <div class="detail-train-id">Tåg ${trainId}</div>
      <div class="detail-route">${stationName(first.LocationSignature)} → ${stationName(last.LocationSignature)}</div>`;

    const now = new Date();
    el.trainStops.innerHTML = stops.map(stop => {
      const adv       = stop.AdvertisedTimeAtLocation;
      const est       = stop.EstimatedTimeAtLocation;
      const actual    = stop.TimeAtLocation;
      const passed    = !!actual || (adv && new Date(adv) < now);
      const cancelled = stop.Canceled === true;
      const delay     = actual ? delayMin(adv, actual) : delayMin(adv, est);

      const statusClass = cancelled ? 'cancelled'
        : delay >= 5 ? 'delayed'
        : passed ? 'passed' : '';

      let timesHtml;
      if (actual) {
        if (delay >= 5) {
          timesHtml = `<span class="stop-planned">${fmtTime(adv)}</span>`
                    + `<span class="stop-arrow">→</span>`
                    + `<span class="stop-time actual">${fmtTime(actual)}</span>`
                    + `<span class="stop-latebadge">+${delay}</span>`;
        } else {
          timesHtml = `<span class="stop-time actual">${fmtTime(actual)}</span>`;
        }
      } else if (delay >= 5) {
        timesHtml = `<span class="stop-planned">${fmtTime(adv)}</span>`
                  + `<span class="stop-arrow">→</span>`
                  + `<span class="stop-time delayed">${fmtTime(est)}</span>`
                  + `<span class="stop-latebadge">+${delay}</span>`;
      } else {
        timesHtml = `<span class="stop-time">${fmtTime(adv)}</span>`;
      }

      return `<li class="stop-item ${statusClass}" data-sig="${stop.LocationSignature}">
        <div class="stop-dot"></div>
        <div class="stop-name">${stationName(stop.LocationSignature)}</div>
        <div class="stop-times">${timesHtml}</div>
      </li>`;
    }).join('');
  } catch (err) {
    el.trainStops.innerHTML = `<li class="state-msg is-error">Fel: ${err.message}</li>`;
  }
}

// --- Auto-geolocate on first launch (no station saved) ---
async function autoGeolocate() {
  el.trainList.innerHTML = '<li class="state-msg">Hämtar din position...</li>';
  try {
    const stations = await API.getStations(Settings.apiKey);
    const pos = await Location.getCurrentPosition();
    const { latitude: lat, longitude: lon } = pos.coords;
    if (!Location.isInServiceArea(lat, lon)) {
      el.trainList.innerHTML = `<li class="state-msg is-error">
        TågTid fungerar bara i Sverige och Narvik.
        <a href="#/settings">Välj station manuellt</a>
      </li>`;
      return;
    }
    const nearest = Location.findNearest(stations, lat, lon);
    if (nearest) {
      Settings.setStation(nearest.LocationSignature, nearest.AdvertisedShortLocationName);
      setTitle(nearest.AdvertisedShortLocationName);
      loadAnnouncements();
    }
  } catch {
    el.trainList.innerHTML = `<li class="state-msg is-error">
      Kunde inte hämta position.
      <a href="#/settings">Välj station manuellt</a>
    </li>`;
  }
}

// --- Background geo-update: byt station tyst om användaren har flyttat sig ---
async function backgroundGeoUpdate() {
  try {
    const stations = await API.getStations(Settings.apiKey);
    const pos = await Location.getCurrentPosition();
    const { latitude: lat, longitude: lon } = pos.coords;
    if (!Location.isInServiceArea(lat, lon)) return;
    const nearest = Location.findNearest(stations, lat, lon);
    if (!nearest || nearest.LocationSignature === Settings.stationSig) return;
    Settings.setStation(nearest.LocationSignature, nearest.AdvertisedShortLocationName);
    setTitle(nearest.AdvertisedShortLocationName);
    toast(`Byter till ${nearest.AdvertisedShortLocationName}`);
    loadAnnouncements();
  } catch {
    // Tyst fel — behåll nuvarande station
  }
}

// --- Settings: station search ---
async function initStationSearch() {
  if (State.allStations.length || !Settings.apiKey) return;
  try {
    State.allStations = await API.getStations(Settings.apiKey);
  } catch { /* station search degraded gracefully */ }
}

function setSuggestions(query) {
  if (!query || query.length < 2) {
    el.suggestions.style.display = 'none';
    return;
  }
  const q = query.toLowerCase();
  const matches = State.allStations
    .filter(s => (s.AdvertisedShortLocationName || '').toLowerCase().includes(q))
    .slice(0, 8);
  if (!matches.length) {
    el.suggestions.style.display = 'none';
    return;
  }
  el.suggestions.innerHTML = matches.map(s =>
    `<li data-sig="${s.LocationSignature}" data-name="${s.AdvertisedShortLocationName}">
      ${s.AdvertisedShortLocationName}
    </li>`
  ).join('');
  el.suggestions.style.display = 'block';
}

function pickStation(sig, name) {
  el.inputStation.value = name;
  el.suggestions.style.display = 'none';
  el.selectedStation.textContent = name;
  el.selectedStation.dataset.sig  = sig;
  el.selectedStation.dataset.name = name;
}

// --- Routing ---
function route() {
  clearInterval(State.refreshTimer);
  const hash = window.location.hash || '#/';

  if (hash.startsWith('#/train/')) {
    const parts   = hash.slice(8).split('/');
    const trainId = decodeURIComponent(parts[0]);
    const date    = parts[1] || new Date().toISOString().slice(0, 10);
    State.viewStationSig = null;
    showView('view-train');
    setTitle('Tåginformation');
    loadTrainDetail(trainId, date);
    return;
  }

  if (hash === '#/settings') {
    State.viewStationSig = null;
    showView('view-settings');
    setTitle('Inställningar');
    el.inputApiKey.value = Settings.apiKey;
    if (Settings.stationName) {
      el.inputStation.value = Settings.stationName;
      el.selectedStation.textContent = Settings.stationName;
      el.selectedStation.dataset.sig  = Settings.stationSig;
      el.selectedStation.dataset.name = Settings.stationName;
    }
    initStationSearch();
    return;
  }

  if (hash.startsWith('#/station/')) {
    const sig  = decodeURIComponent(hash.slice(10));
    State.viewStationSig = sig;
    showView('view-station');
    setTitle(stationName(sig));
    el.stationActionBar.hidden = false;
    updateStationActionBar();
    loadAnnouncements();
    return;
  }

  // Home station view
  if (!Settings.apiKey) {
    window.location.hash = '#/settings';
    return;
  }
  State.viewStationSig = null;
  el.stationActionBar.hidden = true;
  showView('view-station');
  setTitle(Settings.stationName || 'TågTid');

  if (!Settings.stationSig) {
    autoGeolocate();
  } else {
    loadAnnouncements();
    backgroundGeoUpdate();
  }
  State.refreshTimer = setInterval(loadAnnouncements, 120_000);
}

// --- Init ---
function init() {
  loadLongNamesCache();
  applyTheme(Settings.theme);
  el.versionDisplay.textContent = `Version ${VERSION}`;

  // Back button
  el.btnBack.addEventListener('click', () => history.back());

  // Settings button
  el.btnSettings.addEventListener('click', () => { window.location.hash = '#/settings'; });

  // Tabs
  el.tabs.forEach(tab => tab.addEventListener('click', () => {
    el.tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    State.activeTab = tab.dataset.tab;
    loadAnnouncements();
  }));

  // Ghost station toggle
  updateGhostBtn();
  el.btnGhost.addEventListener('click', () => {
    Settings.showGhostStations = !Settings.showGhostStations;
    updateGhostBtn();
    if (State.currentTrain) {
      loadTrainDetail(State.currentTrain.id, State.currentTrain.date);
    }
  });

  // Stop click → temp station view
  el.trainStops.addEventListener('click', e => {
    const item = e.target.closest('.stop-item[data-sig]');
    if (item?.dataset.sig) {
      window.location.hash = `#/station/${encodeURIComponent(item.dataset.sig)}`;
    }
  });

  // Save train
  el.btnSaveTrain.addEventListener('click', () => {
    if (State.currentTrain) {
      Settings.savedTrain = State.currentTrain;
      updateDetailActions();
    }
  });

  // Goto saved train (from train detail view)
  el.btnGotoSaved.addEventListener('click', () => {
    const saved = Settings.savedTrain;
    if (saved) {
      window.location.hash = `#/train/${encodeURIComponent(saved.id)}/${saved.date}`;
    }
  });

  // Fetch full station name
  el.btnFetchName.addEventListener('click', async () => {
    const sig = el.btnFetchName.dataset.sig;
    if (!sig) return;
    el.btnFetchName.disabled = true;
    el.btnFetchName.textContent = 'Hämtar...';
    try {
      const station = await API.getStationFull(Settings.apiKey, sig);
      if (station?.AdvertisedLocationName) {
        const name = station.AdvertisedLocationName;
        Settings.setLongName(sig, name);
        longNamesCache[sig] = name;
        setTitle(name);
        el.btnFetchName.textContent = name;
      } else {
        toast('Inget längre namn hittades');
        el.btnFetchName.disabled = false;
        el.btnFetchName.textContent = 'Hämta namn';
      }
    } catch (err) {
      toast(`Fel: ${err.message}`);
      el.btnFetchName.disabled = false;
      el.btnFetchName.textContent = 'Hämta namn';
    }
  });

  // Goto saved train (from station view)
  el.btnGotoSavedStation.addEventListener('click', () => {
    const saved = Settings.savedTrain;
    if (saved) {
      window.location.hash = `#/train/${encodeURIComponent(saved.id)}/${saved.date}`;
    }
  });

  // Theme toggle
  el.btnTheme.addEventListener('click', () => {
    const next = Settings.theme === 'dark' ? 'light' : 'dark';
    Settings.theme = next;
    applyTheme(next);
  });

  // Station search input
  el.inputStation.addEventListener('input', () => setSuggestions(el.inputStation.value));
  el.inputStation.addEventListener('blur', () => {
    setTimeout(() => { el.suggestions.style.display = 'none'; }, 150);
  });

  // Pick station from dropdown
  el.suggestions.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (li) pickStation(li.dataset.sig, li.dataset.name);
  });

  // Geolocate button in settings
  el.btnGeolocate.addEventListener('click', async () => {
    const apiKey = el.inputApiKey.value.trim() || Settings.apiKey;
    if (!apiKey) { toast('Ange API-nyckel först'); return; }
    el.btnGeolocate.disabled = true;
    el.btnGeolocate.textContent = 'Letar…';
    try {
      const stations = await API.getStations(apiKey);
      State.allStations = stations;
      const pos = await Location.getCurrentPosition();
      const { latitude: lat, longitude: lon } = pos.coords;
      if (!Location.isInServiceArea(lat, lon)) {
        toast('Du verkar inte befinna dig i Sverige eller Narvik.');
        return;
      }
      const nearest = Location.findNearest(stations, lat, lon);
      if (nearest) pickStation(nearest.LocationSignature, nearest.AdvertisedShortLocationName);
    } catch (err) {
      toast(`Kunde inte hämta position: ${err.message}`);
    } finally {
      el.btnGeolocate.disabled = false;
      el.btnGeolocate.textContent = '📍 Hitta närmaste station automatiskt';
    }
  });

  // Save settings
  el.btnSave.addEventListener('click', () => {
    const key = el.inputApiKey.value.trim();
    if (key) Settings.apiKey = key;

    const sig  = el.selectedStation.dataset.sig;
    const name = el.selectedStation.dataset.name;
    if (sig && name) Settings.setStation(sig, name);

    toast('Inställningar sparade');
    if (Settings.apiKey && Settings.stationSig) {
      setTimeout(() => { window.location.hash = '#/'; }, 600);
    }
  });

  // Update app — clears SW cache and reloads
  el.btnUpdateApp.addEventListener('click', async () => {
    el.btnUpdateApp.disabled = true;
    el.btnUpdateApp.textContent = 'Uppdaterar...';
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      window.location.reload(true);
    } catch {
      el.btnUpdateApp.disabled = false;
      el.btnUpdateApp.textContent = 'Uppdatera appen';
      toast('Kunde inte uppdatera — ladda om manuellt');
    }
  });

  window.addEventListener('hashchange', route);
  route();
}

document.addEventListener('DOMContentLoaded', init);

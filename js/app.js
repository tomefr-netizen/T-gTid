// --- State ---
const State = {
  activeTab: 'departures',
  refreshTimer: null,
  allStations: [],
  loading: false,
  currentTrain: null,
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

function isCancelled(deviations) {
  if (!Array.isArray(deviations) || !deviations.length) return false;
  return deviations.some(d =>
    (d.Description || '').toLowerCase().includes('inställ') ||
    (d.Code || '').startsWith('ANA')
  );
}

function trainStatus(t) {
  if (isCancelled(t.Deviation)) return 'cancelled';
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
  views:          document.querySelectorAll('.view'),
  headerTitle:    $('header-title'),
  btnBack:        $('btn-back'),
  btnSettings:    $('btn-settings'),
  tabs:           document.querySelectorAll('.tab'),
  btnGhost:       $('btn-ghost-toggle'),
  trainList:      $('train-list'),
  lastUpdated:    $('last-updated'),
  detailHeader:   $('train-detail-header'),
  trainStops:     $('train-stops'),
  inputApiKey:    $('input-apikey'),
  inputStation:   $('input-station-search'),
  suggestions:    $('station-suggestions'),
  selectedStation:$('selected-station'),
  btnGeolocate:   $('btn-geolocate'),
  btnTheme:       $('btn-theme'),
  btnSave:        $('btn-save-settings'),
  toast:          $('toast'),
};

// --- Ghost station toggle ---
function updateGhostBtn() {
  const show = Settings.showGhostStations;
  el.btnGhost.textContent = show ? 'Dölj mötesplatser' : 'Visa mötesplatser';
  el.btnGhost.classList.toggle('ghost-active', show);
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

    return `<li class="train-item" data-status="${status}"
                data-id="${t.AdvertisedTrainIdent}" data-date="${date}">
      <div class="train-time">${adv}</div>
      <div class="train-info">
        <span class="train-id">Tåg ${t.AdvertisedTrainIdent}</span>
        <span class="train-dir">${dir ? '→ ' + dir : ''}</span>
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

// --- Load station view ---
async function loadAnnouncements() {
  if (State.loading) return;
  const { apiKey, stationSig } = Settings;
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
  el.trainStops.innerHTML = '<li class="state-msg">Laddar...</li>';
  el.detailHeader.innerHTML = `<div class="detail-train-id">Tåg ${trainId}</div>`;

  await ensureStations();

  try {
    const raw = await API.getTrainStops(Settings.apiKey, trainId, date, Settings.showGhostStations);
    if (!raw.length) {
      el.trainStops.innerHTML = '<li class="state-msg">Inga hållplatser hittades.</li>';
      return;
    }

    // Deduplicate: each intermediate station has both Ankomst + Avgang.
    // Keep Avgang for all stations except the last unique station (final destination = Ankomst only).
    const byStation = new Map();
    for (const s of raw) {
      const sig = s.LocationSignature;
      const existing = byStation.get(sig);
      // Prefer Avgang over Ankomst; if same type, keep first (earlier time)
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
      const cancelled = isCancelled(stop.Deviation);
      const delay     = actual ? delayMin(adv, actual) : delayMin(adv, est);

      const statusClass = cancelled ? 'cancelled'
        : delay >= 5 ? 'delayed'
        : passed ? 'passed' : '';

      let timesHtml;
      if (actual) {
        // Show planned (strikethrough) + actual if late
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

      return `<li class="stop-item ${statusClass}">
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

// --- Station name lookup ---
let stationNameCache = {};

function stationName(sig) {
  return stationNameCache[sig] || sig;
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
    showView('view-train');
    setTitle('Tåginformation');
    loadTrainDetail(trainId, date);
    return;
  }

  if (hash === '#/settings') {
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

  // Station view
  if (!Settings.apiKey) {
    window.location.hash = '#/settings';
    return;
  }
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
  applyTheme(Settings.theme);

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

  window.addEventListener('hashchange', route);
  route();
}

document.addEventListener('DOMContentLoaded', init);

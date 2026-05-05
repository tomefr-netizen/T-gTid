const VERSION = '0.2';

// --- State ---
const State = {
  activeTab: Settings.lastTab,
  stationRefreshTimer: null,
  detailRefreshTimer: null,
  allStations: [],
  loading: false,
  currentTrain: null,
  viewStationSig: null,
  detailAutoRefreshMinutes: 0,
  updateAvailable: false,
  selectedDay: 'today',
  showFutureOnly: true,
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

function selectedDate() {
  const date = new Date();
  if (State.selectedDay === 'tomorrow') {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function isTodaySelected() {
  return State.selectedDay === 'today';
}

// --- DOM refs ---
const $ = id => document.getElementById(id);
const el = {
  views:               document.querySelectorAll('.view'),
  headerTitle:         $('header-title'),
  btnBack:             $('btn-back'),
  btnSettings:         $('btn-settings'),
  btnHelp:             $('btn-help'),
  tabs:                document.querySelectorAll('.tab'),
  dayButtons:          document.querySelectorAll('[data-day]'),
  filterButtons:       document.querySelectorAll('[data-filter]'),
  btnGhost:            $('btn-ghost-toggle'),
  trainList:           $('train-list'),
  lastUpdated:         $('last-updated'),
  detailHeader:        $('train-detail-header'),
  trainStops:          $('train-stops'),
  btnSaveTrain:        $('btn-save-train'),
  btnGotoSaved:        $('btn-goto-saved'),
  detailAutoOptions:   document.querySelectorAll('.auto-refresh-option'),
  stationActionBar:    $('station-action-bar'),
  btnFetchName:        $('btn-fetch-name'),
  btnGotoSavedStation: $('btn-goto-saved-station'),
  inputApiKey:         $('input-apikey'),
  inputStation:        $('input-station-search'),
  suggestions:         $('station-suggestions'),
  selectedStation:     $('selected-station'),
  btnGeolocate:        $('btn-geolocate'),
  inputAutoStation:    $('input-auto-station'),
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

  el.detailAutoOptions.forEach(btn => {
    const minutes = Number(btn.dataset.minutes || '0');
    btn.classList.toggle('btn-action-accent', minutes === State.detailAutoRefreshMinutes);
  });
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

function applyTabSelection() {
  el.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === State.activeTab);
  });
}

function updateStationControls() {
  el.dayButtons.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.day === State.selectedDay);
  });
  el.filterButtons.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.filter === (State.showFutureOnly ? 'future' : 'all'));
  });
}

function stopStationRefreshTimer() {
  clearInterval(State.stationRefreshTimer);
  State.stationRefreshTimer = null;
}

function scheduleStationRefresh() {
  stopStationRefreshTimer();
  State.stationRefreshTimer = setInterval(loadAnnouncements, 120_000, {
    preserveContent: true,
    showFailureToast: true,
  });
}

function stopDetailRefreshTimer() {
  clearInterval(State.detailRefreshTimer);
  State.detailRefreshTimer = null;
}

function scheduleDetailRefresh() {
  stopDetailRefreshTimer();
  if (!State.currentTrain || State.detailAutoRefreshMinutes <= 0) return;
  State.detailRefreshTimer = setInterval(() => {
    if (!State.currentTrain) return;
    loadTrainDetail(State.currentTrain.id, State.currentTrain.date, {
      preserveContent: true,
      showFailureToast: true,
    });
  }, State.detailAutoRefreshMinutes * 60_000);
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

function hasTrainListContent() {
  return !!el.trainList.querySelector('.train-item');
}

function hasTrainDetailContent() {
  return !!el.trainStops.querySelector('.stop-item');
}

function updateVersionDisplay() {
  el.versionDisplay.textContent = State.updateAvailable
    ? `Version ${VERSION} · Ny version tillgänglig`
    : `Version ${VERSION}`;
  el.btnUpdateApp.textContent = State.updateAvailable ? 'Uppdatera appen · ny version' : 'Uppdatera appen';
}

function markUpdateAvailable() {
  if (State.updateAvailable) return;
  State.updateAvailable = true;
  updateVersionDisplay();
  toast('Ny version finns. Öppna Inställningar och tryck Uppdatera appen.', 5000);
}

async function checkForAppUpdate() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    if (reg.waiting) markUpdateAvailable();

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          markUpdateAvailable();
        }
      });
    });

    await reg.update();
    if (reg.waiting) markUpdateAvailable();
  } catch {
    // Versionskontroll ska inte störa appstarten.
  }
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
    const message = State.showFutureOnly && isTodaySelected()
      ? 'Inga framtida tåg hittades för idag.'
      : State.selectedDay === 'tomorrow'
        ? 'Inga tåg hittades för imorgon.'
        : 'Inga tåg hittades för idag.';
    el.trainList.innerHTML = `<li class="state-msg">${message}</li>`;
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
    const delayedUpcoming = status === 'delayed' && !t.TimeAtLocation;
    const trainTimeHtml = delayedUpcoming
      ? `<div class="train-time-group">
          <span class="train-time train-time-planned">${adv}</span>
          <span class="train-time train-time-estimated">${est}</span>
        </div>`
      : `<div class="train-time">${adv}</div>`;

    let badge;
    if      (status === 'cancelled') badge = '<span class="badge cancelled">Inställt</span>';
    else if (status === 'passed')    badge = `<span class="badge passed">Passerade ${actual}</span>`;
    else if (status === 'delayed')   badge = `<span class="badge delayed">Beräknas ${est} (+${delay} min)</span>`;
    else                             badge = '<span class="badge ontime">I tid</span>';

    const metaParts = [];
    if (t.TrackAtLocation) metaParts.push(`Spår ${t.TrackAtLocation}`);
    const operator = t.ProductInformation?.[0]?.Description;
    if (operator) metaParts.push(operator);
    const trafficType = normalizeTrafficType(t.TypeOfTraffic);
    if (trafficType) metaParts.push(trafficType);
    const dev = t.Deviation?.[0]?.Description;
    if (dev && status !== 'cancelled') metaParts.push(dev);
    const metaHtml = metaParts.length
      ? `<span class="train-meta">${metaParts.join(' · ')}</span>`
      : '';

    return `<li class="train-item" data-status="${status}"
                data-id="${t.AdvertisedTrainIdent}" data-date="${date}">
      ${trainTimeHtml}
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
async function loadAnnouncements(options = {}) {
  if (State.loading) return;
  const { preserveContent = false, showFailureToast = false } = options;
  const apiKey = Settings.apiKey;
  const stationSig = State.viewStationSig || Settings.stationSig;
  if (!apiKey || !stationSig) return;

  State.loading = true;
  const hadContent = hasTrainListContent();
  if (!preserveContent || !hadContent) {
    el.trainList.innerHTML = '<li class="state-msg">Laddar...</li>';
  }

  const type = State.activeTab === 'departures' ? 'Avgang' : 'Ankomst';
  const dayDate = selectedDate();
  try {
    const [trains] = await Promise.all([
      API.getAnnouncements(apiKey, stationSig, type, dayDate),
      ensureStations(),
    ]);
    const visibleTrains = trains.filter((train) => {
      if (!State.showFutureOnly || !isTodaySelected()) return true;
      const actual = train.TimeAtLocation;
      if (actual) return false;
      const compareTime = train.EstimatedTimeAtLocation || train.AdvertisedTimeAtLocation;
      return compareTime ? new Date(compareTime) >= new Date() : true;
    });

    renderTrainList(visibleTrains);
    el.lastUpdated.textContent = `Uppdaterad ${new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    if (preserveContent && hadContent) {
      if (showFailureToast) toast('Uppdatering misslyckades');
    } else {
      el.trainList.innerHTML = `<li class="state-msg is-error">
        Fel: ${err.message}
        <button onclick="loadAnnouncements()">Försök igen</button>
      </li>`;
    }
  } finally {
    State.loading = false;
  }
}

// --- Load train detail ---
async function loadTrainDetail(trainId, date, options = {}) {
  const { preserveContent = false, showFailureToast = false } = options;
  State.currentTrain = { id: trainId, date };
  updateDetailActions();
  const hadContent = hasTrainDetailContent();
  if (!preserveContent || !hadContent) {
    el.trainStops.innerHTML = '<li class="state-msg">Laddar...</li>';
    el.detailHeader.innerHTML = `<div class="detail-train-id">Tåg ${trainId}</div>`;
  }

  await ensureStations();

  try {
    const raw = await API.getTrainStops(Settings.apiKey, trainId, date);
    if (!raw.length) {
      if (preserveContent && hadContent) {
        if (showFailureToast) toast('Uppdatering misslyckades');
      } else {
        el.trainStops.innerHTML = '<li class="state-msg">Inga hållplatser hittades.</li>';
      }
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

    if (preserveContent && hadContent && !stops.length) {
      if (showFailureToast) toast('Uppdatering misslyckades');
      return;
    }

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

      const statusClasses = [];
      if (cancelled) {
        statusClasses.push('cancelled');
      } else {
        if (delay >= 5) statusClasses.push('delayed');
        if (passed) statusClasses.push('passed');
      }
      const statusClass = statusClasses.join(' ');

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
    if (preserveContent && hadContent) {
      if (showFailureToast) toast('Uppdatering misslyckades');
    } else {
      el.trainStops.innerHTML = `<li class="state-msg is-error">Fel: ${err.message}</li>`;
    }
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
  if (!Settings.autoUpdateStation) return;
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
    loadAnnouncements({ preserveContent: true, showFailureToast: true });
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
  stopStationRefreshTimer();
  stopDetailRefreshTimer();
  const hash = window.location.hash || '#/';

  if (hash.startsWith('#/train/')) {
    const parts   = hash.slice(8).split('/');
    const trainId = decodeURIComponent(parts[0]);
    const date    = parts[1] || new Date().toISOString().slice(0, 10);
    const isSameTrain = State.currentTrain && State.currentTrain.id === trainId && State.currentTrain.date === date;
    if (!isSameTrain) State.detailAutoRefreshMinutes = 0;
    State.viewStationSig = null;
    showView('view-train');
    setTitle('Tåginformation');
    loadTrainDetail(trainId, date);
    scheduleDetailRefresh();
    return;
  }

  if (hash === '#/settings') {
    State.currentTrain = null;
    State.detailAutoRefreshMinutes = 0;
    State.viewStationSig = null;
    showView('view-settings');
    setTitle('Inställningar');
    el.inputApiKey.value = Settings.apiKey;
    el.inputAutoStation.checked = Settings.autoUpdateStation;
    if (Settings.stationName) {
      el.inputStation.value = Settings.stationName;
      el.selectedStation.textContent = Settings.stationName;
      el.selectedStation.dataset.sig  = Settings.stationSig;
      el.selectedStation.dataset.name = Settings.stationName;
    } else {
      el.inputStation.value = '';
      el.selectedStation.textContent = '';
      delete el.selectedStation.dataset.sig;
      delete el.selectedStation.dataset.name;
    }
    initStationSearch();
    return;
  }

  if (hash.startsWith('#/station/')) {
    State.currentTrain = null;
    State.detailAutoRefreshMinutes = 0;
    const sig  = decodeURIComponent(hash.slice(10));
    State.viewStationSig = sig;
    showView('view-station');
    setTitle(stationName(sig));
    applyTabSelection();
    updateStationControls();
    el.stationActionBar.hidden = false;
    updateStationActionBar();
    loadAnnouncements();
    scheduleStationRefresh();
    return;
  }

  // Home station view
  if (!Settings.apiKey) {
    window.location.hash = '#/settings';
    return;
  }
  State.currentTrain = null;
  State.detailAutoRefreshMinutes = 0;
  State.viewStationSig = null;
  el.stationActionBar.hidden = true;
  showView('view-station');
  applyTabSelection();
  updateStationControls();
  setTitle(Settings.stationName || 'TågTid');

  if (!Settings.stationSig) {
    autoGeolocate();
  } else {
    loadAnnouncements();
    if (Settings.autoUpdateStation) {
      backgroundGeoUpdate();
    }
  }
  scheduleStationRefresh();
}

// --- Init ---
function init() {
  loadLongNamesCache();
  applyTheme(Settings.theme);
  updateVersionDisplay();
  applyTabSelection();
  updateStationControls();

  // Back button
  el.btnBack.addEventListener('click', () => history.back());

  // Settings button
  el.btnSettings.addEventListener('click', () => { window.location.hash = '#/settings'; });

  // Tabs
  el.tabs.forEach(tab => tab.addEventListener('click', () => {
    State.activeTab = tab.dataset.tab;
    Settings.lastTab = State.activeTab;
    applyTabSelection();
    loadAnnouncements({ preserveContent: true, showFailureToast: true });
  }));

  el.dayButtons.forEach(btn => btn.addEventListener('click', () => {
    State.selectedDay = btn.dataset.day === 'tomorrow' ? 'tomorrow' : 'today';
    updateStationControls();
    loadAnnouncements({ preserveContent: true, showFailureToast: true });
  }));

  el.filterButtons.forEach(btn => btn.addEventListener('click', () => {
    State.showFutureOnly = btn.dataset.filter !== 'all';
    updateStationControls();
    loadAnnouncements({ preserveContent: true, showFailureToast: true });
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

  el.detailAutoOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      const minutes = Number(btn.dataset.minutes || '0');
      State.detailAutoRefreshMinutes = minutes;
      updateDetailActions();
      scheduleDetailRefresh();
      if (minutes > 0 && State.currentTrain) {
        loadTrainDetail(State.currentTrain.id, State.currentTrain.date, {
          preserveContent: true,
          showFailureToast: true,
        });
      }
    });
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
      el.btnGeolocate.textContent = '📍 Hitta närmste station';
    }
  });

  // Save settings
  el.btnSave.addEventListener('click', () => {
    const key = el.inputApiKey.value.trim();
    if (key) Settings.apiKey = key;

    const sig  = el.selectedStation.dataset.sig;
    const name = el.selectedStation.dataset.name;
    if (sig && name) Settings.setStation(sig, name);
    Settings.autoUpdateStation = el.inputAutoStation.checked;

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
      updateVersionDisplay();
      el.btnUpdateApp.disabled = false;
      toast('Kunde inte uppdatera — ladda om manuellt');
    }
  });

  window.addEventListener('hashchange', route);
  checkForAppUpdate();
  route();
}

document.addEventListener('DOMContentLoaded', init);

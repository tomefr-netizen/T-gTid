const Settings = {
  get apiKey()     { return localStorage.getItem('tagtid_apikey') || ''; },
  set apiKey(v)    { localStorage.setItem('tagtid_apikey', v.trim()); },
  get stationSig() { return localStorage.getItem('tagtid_station_sig') || ''; },
  get stationName(){ return localStorage.getItem('tagtid_station_name') || ''; },
  setStation(sig, name) {
    localStorage.setItem('tagtid_station_sig', sig);
    localStorage.setItem('tagtid_station_name', name);
  },
  get theme()  { return localStorage.getItem('tagtid_theme') || 'dark'; },
  set theme(v) { localStorage.setItem('tagtid_theme', v); },
  get showGhostStations()  { return localStorage.getItem('tagtid_ghost') === 'true'; },
  set showGhostStations(v) { localStorage.setItem('tagtid_ghost', v); },
  get savedTrain() {
    const v = localStorage.getItem('tagtid_saved_train');
    return v ? JSON.parse(v) : null;
  },
  set savedTrain(v) {
    if (v === null) localStorage.removeItem('tagtid_saved_train');
    else localStorage.setItem('tagtid_saved_train', JSON.stringify(v));
  },
  getLongName(sig) {
    const cache = JSON.parse(localStorage.getItem('tagtid_longnames') || '{}');
    return cache[sig] || null;
  },
  setLongName(sig, name) {
    const cache = JSON.parse(localStorage.getItem('tagtid_longnames') || '{}');
    cache[sig] = name;
    localStorage.setItem('tagtid_longnames', JSON.stringify(cache));
  },
};

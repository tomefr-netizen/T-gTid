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
};

const Location = {
  haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const r = d => d * Math.PI / 180;
    const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  parseWGS84(wkt) {
    // "POINT (lon lat)"
    const m = wkt?.match(/POINT\s*\(([^ ]+)\s+([^ )]+)\)/);
    return m ? { lon: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
  },

  isInServiceArea(lat, lon) {
    return lat >= 55.0 && lat <= 69.5 && lon >= 10.5 && lon <= 24.5;
  },

  findNearest(stations, lat, lon) {
    let nearest = null, minDist = Infinity;
    for (const s of stations) {
      const pos = this.parseWGS84(s.Geometry?.WGS84);
      if (!pos) continue;
      const d = this.haversineKm(lat, lon, pos.lat, pos.lon);
      if (d < minDist) { minDist = d; nearest = s; }
    }
    return nearest;
  },

  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!window.isSecureContext) {
        reject(new Error('Platstjänster kräver HTTPS — öppna sidan via https://tagtid.mrgrumpy.se'));
        return;
      }
      if (!navigator.geolocation) {
        reject(new Error('Din webbläsare stöder inte platstjänster'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, err => {
        const msg = {
          1: 'Åtkomst till plats nekad — tillåt platstjänster i webbläsarens/telefonens inställningar för den här sidan',
          2: 'Kunde inte fastställa din position — försök igen',
          3: 'Tidsgräns för platstjänst överskreds — försök igen',
        }[err.code] || err.message;
        reject(new Error(msg));
      }, {
        timeout: 10000,
        maximumAge: 300000,
      });
    });
  },
};

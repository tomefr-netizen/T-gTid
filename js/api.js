const API_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';
const STATION_CACHE_KEY = 'tagtid_stations_v4';
const STATION_CACHE_TTL = 86_400_000; // 24h

const API = {
  async _post(xml) {
    console.log('[API] Sending XML:', xml);
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body: xml,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[API] Error body:', body);
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const err = json.RESPONSE?.RESULT?.[0]?.ERROR;
    if (err) throw new Error(err.MESSAGE || 'Okänt API-fel');
    return json.RESPONSE.RESULT;
  },

  _wrap(apiKey, ...queries) {
    return `<REQUEST><LOGIN authenticationkey="${apiKey}" />${queries.join('')}</REQUEST>`;
  },

  async getStations(apiKey) {
    const cached = localStorage.getItem(STATION_CACHE_KEY);
    if (cached) {
      const { ts, data } = JSON.parse(cached);
      if (Date.now() - ts < STATION_CACHE_TTL) return data;
    }
    const xml = this._wrap(apiKey, `
      <QUERY objecttype="TrainStation" schemaversion="1" limit="1000">
        <FILTER/>
        <INCLUDE>LocationSignature</INCLUDE>
        <INCLUDE>AdvertisedShortLocationName</INCLUDE>
        <INCLUDE>Geometry.WGS84</INCLUDE>
      </QUERY>`);
    const result = await this._post(xml);
    const stations = result[0]?.TrainStation || [];
    localStorage.setItem(STATION_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: stations }));
    return stations;
  },

  async getAnnouncements(apiKey, locationSig, activityType) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end   = new Date(); end.setHours(23, 59, 59, 0);
    const xml = this._wrap(apiKey, `
      <QUERY objecttype="TrainAnnouncement" schemaversion="1.5" limit="100" orderby="AdvertisedTimeAtLocation">
        <FILTER>
          <AND>
            <EQ name="ActivityType" value="${activityType}" />
            <EQ name="LocationSignature" value="${locationSig}" />
            <GT name="AdvertisedTimeAtLocation" value="${start.toISOString()}" />
            <LT name="AdvertisedTimeAtLocation" value="${end.toISOString()}" />
          </AND>
        </FILTER>
        <INCLUDE>AdvertisedTrainIdent</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TimeAtLocation</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
        <INCLUDE>ToLocation</INCLUDE>
        <INCLUDE>FromLocation</INCLUDE>
        <INCLUDE>ScheduledDepartureDateTime</INCLUDE>
        <INCLUDE>ActivityType</INCLUDE>
      </QUERY>`);
    const result = await this._post(xml);
    return result[0]?.TrainAnnouncement || [];
  },

  async getTrainStops(apiKey, trainIdent, date) {
    // Filter on AdvertisedTimeAtLocation instead of ScheduledDepartureDateTime
    // to avoid 400 errors — extend to next-day 05:00 to cover overnight trains
    const start = new Date(date + 'T00:00:00');
    const end   = new Date(date + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    end.setHours(5, 0, 0, 0);

    const xml = this._wrap(apiKey, `
      <QUERY objecttype="TrainAnnouncement" schemaversion="1.5" limit="200" orderby="AdvertisedTimeAtLocation">
        <FILTER>
          <AND>
            <EQ name="AdvertisedTrainIdent" value="${trainIdent}" />
            <GT name="AdvertisedTimeAtLocation" value="${start.toISOString()}" />
            <LT name="AdvertisedTimeAtLocation" value="${end.toISOString()}" />
          </AND>
        </FILTER>
        <INCLUDE>LocationSignature</INCLUDE>
        <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
        <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
        <INCLUDE>TimeAtLocation</INCLUDE>
        <INCLUDE>ActivityType</INCLUDE>
        <INCLUDE>Deviation</INCLUDE>
      </QUERY>`);
    const result = await this._post(xml);
    return result[0]?.TrainAnnouncement || [];
  },
};

# TågTid

Realtidsapp för avgångar och ankomster vid svenska järnvägsstationer, byggd som en PWA med Trafikverkets öppna API.

**Live:** https://tagtid.mrgrumpy.se

## Funktioner

- Avgångar och ankomster för dagens datum vid närmaste station
- Automatisk platsuppdatering — byter station tyst om du har flyttat dig
- Klicka på ett tåg för att se alla hållplatser med planerade, beräknade och faktiska tider
- Tydlig markering av försenade och inställda tåg
- Auto-refresh var 2:a minut
- Mörkt och ljust tema
- Installerbar som app på mobil och desktop (PWA)

## Kom igång

1. Skaffa en gratis API-nyckel på [api.trafikinfo.trafikverket.se](https://api.trafikinfo.trafikverket.se)
2. Öppna https://tagtid.mrgrumpy.se
3. Gå till Inställningar och ange din API-nyckel
4. Tillåt platstjänster — appen hittar närmaste station automatiskt

## Teknik

- Vanilla HTML/CSS/JavaScript — inget byggsteg
- Trafikverkets öppna API (TrainAnnouncement, TrainStation)
- PWA med service worker och offline-stöd
- Hostad på GitHub Pages med egen domän via Cloudflare

## Lokal utveckling

Kräver en lokal webbserver (geolocation fungerar inte via `file://`):

```bash
npx serve .
```

Öppna sedan http://localhost:3000

# TågTid Manual Design

## Mål

Skapa en fristående manualsida i HTML för vanliga användare som publiceras via GitHub Pages och känns som en naturlig del av TågTid. Manualsidan ska vara lätt att läsa på mobil, använda samma mörka visuella språk som appen och öppnas i samma fönster från appens inställningar.

## Målgrupp

Vanliga användare som vill förstå hur appen fungerar utan tekniska förkunskaper.

## Omfång

Manualen ska förklara:

- vad TågTid är
- hur man kommer igång första gången
- att appen öppnar Inställningar direkt om ingen API-nyckel är sparad
- hur man skaffar och sparar Trafikverkets API-nyckel
- att närmaste station hämtas med GPS och därför kräver platsåtkomst
- hur man använder avgångar, ankomster och tågets detaljvy
- hur man sparar ett tåg
- tema, uppdatering och vanliga problem

Manualen ska inte bli en teknisk utvecklardokumentation och ska inte kräva JavaScript för att vara användbar.

## Struktur

Manualen blir en separat sida, `manual.html`, med två tydliga delar:

1. En app-lik toppdel med samma färger som TågTid, kort ingress och snabblänkar till viktiga avsnitt.
2. En längre, lättläst manualdel med tydliga sektioner, steg-för-steg-listor och ett kort felsökningsavsnitt.

## Visuell riktning

Sidan ska återanvända appens befintliga färgpalett, typografi och känsla. Layouten får gärna kännas lite öppnare än huvudappen, men fortfarande som samma produkt. Viktiga råd, som platsåtkomst och API-nyckel, ska lyftas fram i kort eller informationsrutor så att de är lätta att skanna.

## Navigering

Appen ska få en tydlig länk till manualen i inställningsvyn, i samma fönster. Manualsidan ska ha en enkel väg tillbaka till startsidan, också i samma fönster.

## Innehållssektioner

Föreslagna sektioner:

- Introduktion
- Kom igång
- API-nyckel
- Plats och stationer
- Avgångar och ankomster
- Tåginformation och sparade tåg
- Tema och uppdatering
- Vanliga problem

## Testning

Vi verifierar att:

- `manual.html` finns och innehåller alla huvudsektioner
- inställningsvyn länkar till manualen
- manualsidan länkar tillbaka till appen
- sidan fungerar som statisk HTML utan extra skript

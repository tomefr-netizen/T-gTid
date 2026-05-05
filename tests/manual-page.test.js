const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manualPath = path.join(root, 'manual.html');
const manualHtml = fs.existsSync(manualPath)
  ? fs.readFileSync(manualPath, 'utf8')
  : '';
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

test('settings view links to the manual page', () => {
  assert.match(indexHtml, /id="btn-help"[^>]*href="manual\.html"/);
});

test('manual page contains key onboarding guidance', () => {
  assert.match(manualHtml, /Kom igång/i);
  assert.match(manualHtml, /API-nyckel/i);
  assert.match(manualHtml, /plats/i);
  assert.match(manualHtml, /Tillbaka till appen/i);
});

test('manual page documents the refined station and ghost-station behavior', () => {
  assert.match(manualHtml, /trafikverkets öppna api/i);
  assert.match(manualHtml, /när appen öppnas/i);
  assert.match(manualHtml, /Hitta närmste station/i);
  assert.match(manualHtml, /Uppdatera automatiskt/i);
  assert.match(manualHtml, /Auto[^<]*Av[^<]*1[^<]*5[^<]*10[^<]*15/i);
  assert.match(manualHtml, /Uppdatering misslyckades/i);
  assert.match(manualHtml, /spökstationer/i);
  assert.match(manualHtml, /internt namn/i);
  assert.match(manualHtml, /tekniska platser|mötesplatser|nedlagda stationer/i);
  assert.match(manualHtml, /Hämta namn/i);
  assert.match(manualHtml, /Rgn/i);
  assert.match(manualHtml, /Riksgränsen/i);
  assert.match(manualHtml, /korta namn|långa namnet/i);
});

test('home view refresh interval updates train announcements every two minutes', () => {
  assert.match(appJs, /setInterval\(loadAnnouncements,\s*120_000,\s*\{/);
  assert.match(appJs, /Settings\.autoUpdateStation/);
  assert.match(appJs, /preserveContent:\s*true/);
  assert.match(appJs, /navigator\.serviceWorker\.getRegistration\(\)/);
  assert.match(appJs, /reg\.update\(\)/);
});

test('index includes station auto-update and train detail auto-refresh controls', () => {
  assert.match(indexHtml, /Hitta närmste station/i);
  assert.match(indexHtml, /input-auto-station/);
  assert.match(indexHtml, /Automatisk uppdatering av tåginformation/i);
  assert.match(indexHtml, /data-minutes="0"[^>]*>Av</i);
  assert.match(indexHtml, /data-minutes="1"[^>]*>1</i);
  assert.match(indexHtml, /data-minutes="5"[^>]*>5</i);
  assert.match(indexHtml, /data-minutes="10"[^>]*>10</i);
  assert.match(indexHtml, /data-minutes="15"[^>]*>15 min</i);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeTrafficType } = require('../js/traffic-type.js');

test('returns plain string traffic type unchanged', () => {
  assert.equal(normalizeTrafficType('Tåg'), 'Tåg');
});

test('extracts display label from object traffic type payload', () => {
  assert.equal(normalizeTrafficType({ Code: 'J', Description: 'Tåg' }), 'Tåg');
});

test('falls back to common code mapping when description is missing', () => {
  assert.equal(normalizeTrafficType({ Code: 'B' }), 'Buss');
});

test('reads nested object payloads returned by the newer API shape', () => {
  assert.equal(normalizeTrafficType({ Object: { Description: 'Tåg' } }), 'Tåg');
});

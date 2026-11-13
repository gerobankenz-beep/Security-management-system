// Unit tests: no database needed for these two, but env vars must exist because env.js is loaded.
const { test } = require('node:test');
const assert = require('node:assert');
const { distanceMetres } = require('../src/utils/geo');

test('distanceMetres: same point is 0', () => {
  assert.strictEqual(Math.round(distanceMetres(0.3349, 32.5925, 0.3349, 32.5925)), 0);
});

test('distanceMetres: two seed checkpoints are about 94 m apart', () => {
  const d = distanceMetres(0.3349, 32.5925, 0.3343, 32.5919);
  assert.ok(d > 90 && d < 98, `got ${d}`);
});


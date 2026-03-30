const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSortedDriverPay } = require('../../src/services/sortedDriverPay');

test('buildSortedDriverPay sorts zelle first, then total descending', () => {
  const groupedTotals = [
    { name: 'Driver C', totalAmount: 120, pay: [] },
    { name: 'Driver A', totalAmount: 200, pay: [] },
    { name: 'Driver B', totalAmount: 140, pay: [] }
  ];

  const sorted = buildSortedDriverPay(groupedTotals, ['Driver B']);

  assert.deepEqual(
    sorted.map((entry) => ({ name: entry.name, isZelle: entry.isZelle })),
    [
      { name: 'Driver B', isZelle: true },
      { name: 'Driver A', isZelle: false },
      { name: 'Driver C', isZelle: false }
    ]
  );
});

test('buildSortedDriverPay matches zelle names case-insensitively', () => {
  const groupedTotals = [
    { name: 'John Smith', totalAmount: 50, pay: [] }
  ];

  const sorted = buildSortedDriverPay(groupedTotals, ['  john   smith  ']);
  assert.equal(sorted[0].isZelle, true);
});

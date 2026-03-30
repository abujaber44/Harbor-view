const test = require('node:test');
const assert = require('node:assert/strict');

const { validateDayRange } = require('../../src/validation/dayRange');

test('validateDayRange accepts same-day range', () => {
  const result = validateDayRange('Monday', 'Monday');
  assert.equal(result.ok, true);
});

test('validateDayRange rejects invalid day names', () => {
  const result = validateDayRange('Mon', 'Tuesday');
  assert.equal(result.ok, false);
  assert.match(result.message, /valid weekday/i);
});

test('validateDayRange rejects reversed range', () => {
  const result = validateDayRange('Thursday', 'Tuesday');
  assert.equal(result.ok, false);
  assert.match(result.message, /earlier than or equal/i);
});

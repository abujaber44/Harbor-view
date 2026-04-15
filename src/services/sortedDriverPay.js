const { normalizeDriverName } = require('../utils/driverNames');

function buildSortedDriverPay(groupedTotals, zelleDrivers) {
  const zelleLookup = new Set(
    (zelleDrivers || [])
      .map((name) => normalizeDriverName(name))
      .filter(Boolean)
  );

  return (groupedTotals || [])
    .map((group) => ({
      ...group,
      isZelle: zelleLookup.has(normalizeDriverName(group.name))
    }))
    .sort((a, b) => {
      if (a.totalAmount !== b.totalAmount) {
        return Number(b.totalAmount || 0) - Number(a.totalAmount || 0);
      }

      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

module.exports = {
  buildSortedDriverPay
};

const { DAY_INDEX } = require('../config/constants');

function validateDayRange(fromDay, toDay) {
  if (!fromDay || !toDay) {
    return {
      ok: false,
      message: 'Both fromDay and toDay are required.'
    };
  }

  if (!(fromDay in DAY_INDEX) || !(toDay in DAY_INDEX)) {
    return {
      ok: false,
      message: 'Days must be valid weekday names.'
    };
  }

  if (DAY_INDEX[fromDay] > DAY_INDEX[toDay]) {
    return {
      ok: false,
      message: 'fromDay must be earlier than or equal to toDay within the same week.'
    };
  }

  return { ok: true };
}

module.exports = {
  validateDayRange
};

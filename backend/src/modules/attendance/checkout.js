// How far the real check-out was from the scheduled end of the shift.
//   minutes > 0  the guard left AFTER the scheduled end (late check-out / overtime)
//   minutes < 0  the guard left BEFORE the scheduled end (early)
// Within the grace period it counts as on time.
const CHECKOUT_GRACE_MIN = 5;

function checkoutDiff(scheduledEnd, checkedOutAt) {
  if (!checkedOutAt) return { minutes: null, status: null };
  const minutes = Math.round((new Date(checkedOutAt).getTime() - new Date(scheduledEnd).getTime()) / 60000);
  const status = Math.abs(minutes) <= CHECKOUT_GRACE_MIN ? 'on_time' : minutes > 0 ? 'late' : 'early';
  return { minutes, status };
}

module.exports = { checkoutDiff, CHECKOUT_GRACE_MIN };

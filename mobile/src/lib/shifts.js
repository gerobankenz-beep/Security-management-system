import { kampalaTime } from './time.js';

export const CHECK_IN_OPENS_MIN = 60; // the backend opens check-in 60 minutes before the shift

// What can the guard do right now? `local` says what is already saved on the phone for this shift.
export function shiftActions(shift, local, now = new Date()) {
  const t = now.getTime();
  const start = new Date(shift.start_at).getTime();
  const end = new Date(shift.end_at).getTime();
  const checkedIn = shift.status === 'in_progress' || shift.status === 'completed' || !!local.checkIn;
  const checkedOut = shift.status === 'completed' || !!local.checkOut;
  let checkInBlock = null;
  if (checkedIn) checkInBlock = 'You are already checked in.';
  else if (shift.status === 'cancelled') checkInBlock = 'This shift was cancelled.';
  else if (t < start - CHECK_IN_OPENS_MIN * 60000) checkInBlock = `Check-in opens at ${kampalaTime(new Date(start - CHECK_IN_OPENS_MIN * 60000).toISOString())}.`;
  else if (t > end) checkInBlock = 'This shift has ended.';
  return {
    checkedIn, checkedOut,
    canCheckIn: !checkInBlock, checkInBlock,
    canCheckOut: checkedIn && !checkedOut,
    canScan: !checkedOut && t >= start - CHECK_IN_OPENS_MIN * 60000 && t <= end + 30 * 60000,
  };
}

// Words a guard understands for each reason the server can give.
const REASONS = {
  UNKNOWN_TAG: 'This code is not a known checkpoint.',
  WRONG_SITE: 'This checkpoint belongs to a different site.',
  OUTSIDE_SHIFT: 'Scanned outside your shift time.',
  CHECKPOINT_INACTIVE: 'This checkpoint is switched off.',
  NOT_YOUR_SHIFT: 'This shift is not on your roster.',
  ID_IN_USE: 'This event id was already used.',
};
export const reasonText = (reason) => {
  if (!reason) return '';
  const code = String(reason).split(':')[0].trim();
  return REASONS[code] || String(reason);
};

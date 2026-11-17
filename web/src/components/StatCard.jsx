import { Link } from 'react-router-dom';
import { Activity, CalendarDays, ChevronRight, CircleAlert, CircleCheck, Clock, Flag, Gauge, Route, TriangleAlert, UserX, Users, Wallet } from 'lucide-react';

// Picks an icon from the label so every card gets a fitting one; pass `icon` to override.
const BY_LABEL = [
  [/no-?show/i, UserX], [/guard|people|staff/i, Users], [/flag/i, Flag], [/incident/i, TriangleAlert],
  [/round|checkpoint|patrol|walk/i, Route], [/late|hour|time/i, Clock], [/compliance|percent|%/i, Gauge],
  [/shift|schedul|roster|week/i, CalendarDays], [/pay|gross|net|ugx|total|cost|allowance/i, Wallet],
];
const BY_TONE = { good: CircleCheck, warn: CircleAlert, bad: TriangleAlert };

// `progress` (0 to 100) is optional and draws a thin meter under the value.
// `to` is optional: when given, the whole card is a link to that page.
export default function StatCard({ label, value, hint, tone = 'default', icon, progress, to }) {
  const found = BY_LABEL.find(([re]) => re.test(String(label)));
  const Icon = icon || (found && found[1]) || BY_TONE[tone] || Activity;
  const Wrapper = to ? Link : 'div';
  const wrapperProps = to ? { to, className: `stat-card tone-${tone} is-link` } : { className: `stat-card tone-${tone}` };
  return (
    <Wrapper {...wrapperProps}>
      <div className="stat-top">
        <div className="stat-label">{label}</div>
        <div className="stat-icon"><Icon size={18} strokeWidth={1.9} aria-hidden="true" /></div>
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
      {typeof progress === 'number' && (
        <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
      )}
      {to && <span className="stat-go" aria-hidden="true">View details<ChevronRight size={14} /></span>}
    </Wrapper>
  );
}

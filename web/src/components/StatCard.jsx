import { Activity, CalendarDays, CircleAlert, CircleCheck, Clock, Flag, Gauge, Route, TriangleAlert, UserX, Users, Wallet } from 'lucide-react';

// Picks an icon from the label so every card gets a fitting one; pass `icon` to override.
const BY_LABEL = [
  [/no-?show/i, UserX], [/guard|people|staff/i, Users], [/flag/i, Flag], [/incident/i, TriangleAlert],
  [/round|checkpoint|patrol|walk/i, Route], [/late|hour|time/i, Clock], [/compliance|percent|%/i, Gauge],
  [/shift|schedul|roster|week/i, CalendarDays], [/pay|gross|net|ugx|total|cost|allowance/i, Wallet],
];
const BY_TONE = { good: CircleCheck, warn: CircleAlert, bad: TriangleAlert };

export default function StatCard({ label, value, hint, tone = 'default', icon }) {
  const found = BY_LABEL.find(([re]) => re.test(String(label)));
  const Icon = icon || (found && found[1]) || BY_TONE[tone] || Activity;
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon"><Icon size={20} strokeWidth={1.9} aria-hidden="true" /></div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

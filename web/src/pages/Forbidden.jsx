import { Lock } from 'lucide-react';

export default function Forbidden() {
  return (
    <div className="card center-card">
      <span className="center-icon"><Lock size={26} strokeWidth={1.7} aria-hidden="true" /></span>
      <h1>No access</h1>
      <p className="muted">Your role is not allowed to open this page.</p>
    </div>
  );
}

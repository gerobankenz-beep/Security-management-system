import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="card center-card">
      <span className="center-icon"><Compass size={26} strokeWidth={1.7} aria-hidden="true" /></span>
      <h1>Page not found</h1>
      <p className="muted">The page you are looking for does not exist or has moved.</p>
      <Link className="btn btn-primary" to="/">Go to the start page</Link>
    </div>
  );
}

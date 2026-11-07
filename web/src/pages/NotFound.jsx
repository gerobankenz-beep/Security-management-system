import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card center-card">
      <h1>Page not found</h1>
      <p><Link to="/">Go to the start page</Link></p>
    </div>
  );
}

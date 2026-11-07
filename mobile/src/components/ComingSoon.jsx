import PageHeader from './PageHeader';

// Placeholder for screens nobody has built yet. It tells the owner exactly what to build.
export default function ComingSoon({ title, task, endpoints = [], notes }) {
  return (
    <>
      <PageHeader title={title} subtitle={`Owner: ${task}`} />
      <div className="card">
        <p>This screen is not built yet.</p>
        {endpoints.length > 0 && (
          <>
            <p><strong>Endpoints from the API contract:</strong></p>
            <ul>{endpoints.map((e) => <li key={e}><code>{e}</code></li>)}</ul>
          </>
        )}
        {notes && <p className="muted">{notes}</p>}
        <p className="muted">Steps: add functions in <code>src/api/</code>, a mock in <code>src/mocks/</code>, then replace this placeholder in <code>src/pages/</code>.</p>
      </div>
    </>
  );
}

import { Inbox } from 'lucide-react';

// columns: [{ key: 'name', label: 'Name', render?: (row) => node, align?: 'left' | 'center' | 'right' }]
//
// Alignment: pass `align` to choose. Without it, a column is right-aligned when it is a row-action column
// (empty label) or when every plain value in it is a number, so figures line up on the right.
const NUMERIC = /^-?\d[\d,]*(\.\d+)?%?$/;
const NEVER_NUMERIC = /phone|employee|code|tag|date|time|^no\.?$/i; // digits that are labels, not quantities

function alignOf(column, rows) {
  if (column.align) return column.align;
  if (column.label === '') return 'right';
  if (column.render || NEVER_NUMERIC.test(column.key)) return 'left';
  const values = rows.map((r) => r[column.key]).filter((v) => v !== null && v !== undefined && v !== '');
  const numeric = values.length > 0 && values.every((v) => typeof v === 'number' || NUMERIC.test(String(v).trim()));
  return numeric ? 'right' : 'left';
}

const classFor = (align, column) => {
  if (column.label === '') return 'col-actions';
  return align === 'right' ? 'col-right' : align === 'center' ? 'col-center' : undefined;
};

export default function DataTable({ columns, rows, empty = 'Nothing to show yet.' }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state">
        <Inbox size={22} strokeWidth={1.7} aria-hidden="true" />
        <p>{empty}</p>
      </div>
    );
  }
  const layout = columns.map((c) => classFor(alignOf(c, rows), c));
  return (
    <div className="table-wrap">
      <table className="responsive">
        <thead>
          <tr>{columns.map((c, i) => <th key={c.key} className={layout[i]}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((c, j) => <td key={c.key} className={layout[j]} data-label={c.label || undefined}>{c.render ? c.render(row) : String(row[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

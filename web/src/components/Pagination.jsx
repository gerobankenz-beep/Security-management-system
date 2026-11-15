import { ChevronLeft, ChevronRight } from 'lucide-react';

// meta comes straight from the API: { page, per_page, total }
export default function Pagination({ meta, onChange }) {
  if (!meta) return null;
  const pages = Math.max(Math.ceil(meta.total / meta.per_page), 1);
  return (
    <div className="pagination">
      <button className="btn" disabled={meta.page <= 1} onClick={() => onChange(meta.page - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
      <span>Page {meta.page} of {pages} ({meta.total} total)</span>
      <button className="btn" disabled={meta.page >= pages} onClick={() => onChange(meta.page + 1)}>Next<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  );
}

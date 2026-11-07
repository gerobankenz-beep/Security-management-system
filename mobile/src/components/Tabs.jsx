export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key}
          className={active === t.key ? 'tab active' : 'tab'} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  );
}

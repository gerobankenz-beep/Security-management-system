// One labelled input with its error message underneath.
//   <FormField id="email" label="Email" error={errors.email}><input id="email" ... /></FormField>
export default function FormField({ id, label, error, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <div className="hint">{hint}</div>}
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}

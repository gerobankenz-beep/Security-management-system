import { useState } from 'react';

// A button that needs a second click. The first click changes the label to "Click again to confirm".
export default function ConfirmButton({ label, confirmLabel = 'Click again to confirm', onConfirm, className = 'btn', disabled }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button" className={armed ? `${className} btn-danger` : className} disabled={disabled}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

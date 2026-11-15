import { useId } from 'react';

// Shield with a four-point "nova" spark. Used in the sidebar, login page and favicon.
export default function Logo({ className = 'brand-mark' }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-label="The Nova Protective Systems logo">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2d62f0" />
          <stop offset="1" stopColor="#12305d" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 4.5 6.8v8.1c0 7 4.8 12.2 11.5 14.6 6.7-2.4 11.5-7.6 11.5-14.6V6.8L16 2.5Z" fill={`url(#${id})`} stroke="rgba(255,255,255,.18)" strokeWidth=".6" />
      <path d="m16 8.2 1.9 5.9 5.9 1.9-5.9 1.9-1.9 5.9-1.9-5.9-5.9-1.9 5.9-1.9L16 8.2Z" fill="#f2b134" />
    </svg>
  );
}

import type { JSX } from 'react';

/**
 * The Toopo mark: three nodes joined by two solid (certain) links and one dashed
 * link in the inferred accent — the trust contract, in miniature. Inherits the
 * current text colour; the dashed stroke uses the one saturated token.
 */
export function BrandMark({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="18" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.6 8 L11 15.6 M16.4 7.6 L13 15.8" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8.2 6.8 L15.6 6.2"
        stroke="var(--tp-inferred)"
        strokeWidth="1.4"
        strokeDasharray="2 2.2"
      />
    </svg>
  );
}

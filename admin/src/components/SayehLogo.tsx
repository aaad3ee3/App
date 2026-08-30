/**
 * The Sayeh mark: a navy `S` whose lower half becomes a gold ribbon.
 *
 * Inline SVG rather than an image file so it stays crisp at any size and inherits the
 * palette from CSS custom properties — and so it needs no network request, which keeps
 * it working under the strict CSP in deploy/security-headers.conf.
 */
export function SayehLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role="img"
      aria-label="سايح"
    >
      <path
        d="M22 80c18 6 44 5 51-11 6-14-6-23-23-27v15c9 2 12 5 10 9-3 6-20 7-32 3z"
        fill="var(--gold)"
      />
      <path
        d="M78 20c-18-6-44-5-51 11-6 14 6 23 23 27V43c-9-2-12-5-10-9 3-6 20-7 32-3z"
        fill="var(--navy)"
      />
    </svg>
  );
}

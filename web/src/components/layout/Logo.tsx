export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#8b5cf6" />
      <circle cx="16" cy="9.5" r="2.4" fill="#fff" />
      <circle cx="9.5" cy="19" r="2.4" fill="#fff" opacity=".9" />
      <circle cx="21.5" cy="22" r="2.4" fill="#fff" opacity=".8" />
      <path d="M16 11.9 10.4 17M10.8 20.2l8.5 1.6M16.7 11.6l4.2 8.3" stroke="#fff" strokeWidth="1.2" strokeOpacity=".6" fill="none" />
    </svg>
  );
}

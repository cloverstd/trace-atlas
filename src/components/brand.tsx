import { Link } from 'react-router-dom';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" to="/" aria-label="Trace Atlas 首页">
      <span className="brand-mark">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M7 23 13 7l5 12 7-10M5 25l20-4"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="13" cy="7" r="2.3" fill="currentColor" />
        </svg>
      </span>
      <span>
        trace<span className="brand-light">atlas</span>
        {!compact && <small>每一步，都有迹可循</small>}
      </span>
    </Link>
  );
}

interface LogoMarkProps {
  size?: number
  className?: string
}

export function LogoMark({ size = 36, className = '' }: LogoMarkProps) {
  const s = size
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 36 36"
      fill="none"
      className={className}
    >
      <defs>
        <linearGradient id="lg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4a017" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="lg-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.08)" />
        </linearGradient>
      </defs>
      <rect x="6" y="14" width="24" height="16" rx="3" fill="url(#lg-body)" />
      <rect x="6" y="14" width="24" height="16" rx="3" fill="url(#lg-shine)" />
      <rect x="6" y="14" width="24" height="16" rx="3" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
      <rect x="10" y="10" width="16" height="6" rx="2" fill="url(#lg-body)" opacity="0.85" />
      <rect x="10" y="10" width="16" height="6" rx="2" fill="url(#lg-shine)" />
      <circle cx="12" cy="32" r="2.5" fill="url(#lg-body)" />
      <circle cx="12" cy="32" r="2.5" fill="url(#lg-shine)" />
      <circle cx="24" cy="32" r="2.5" fill="url(#lg-body)" />
      <circle cx="24" cy="32" r="2.5" fill="url(#lg-shine)" />
      <rect x="8" y="14" width="4" height="10" rx="0.5" fill="rgba(255,255,255,0.2)" />
      <text x="18" y="25.5" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">&#8377;</text>
      <circle cx="17" cy="11" r="1.2" fill="white" opacity="0.3" />
    </svg>
  )
}

export function LogoFull({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative">
        <LogoMark size={32} />
        <div className="absolute -inset-1 bg-gradient-to-r from-gold/30 to-gold/10 rounded-xl blur-sm" />
      </div>
      <div className="flex flex-col">
        <span className="text-base font-bold tracking-tight gradient-text-purple-400">
          GriefCart
        </span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface LifeEmberProps {
  className?: string
}

export function LifeEmber({ className = '' }: LifeEmberProps) {
  const [phase, setPhase] = useState(0)
  const [embers, setEmbers] = useState<{ id: number; x: number; delay: number; size: number }[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase(p => (p + 1) % 60)
    }, 1200)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setEmbers(
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: 20 + Math.random() * 60,
        delay: Math.random() * 3,
        size: 1.5 + Math.random() * 2.5,
      }))
    )
  }, [])

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <div className="relative h-28 w-full max-w-[200px]">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-16 rounded-t-full bg-gradient-to-t from-gold/25 to-gold/5 blur-xl" />

        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-14 h-[1px] bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

        <svg viewBox="0 0 200 120" className="h-full w-full" preserveAspectRatio="xMidYMax meet">
          <defs>
            <radialGradient id="ember-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f0c84a" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#d4a017" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#d4a017" stopOpacity="0" />
            </radialGradient>
            <filter id="ember-blur">
              <feGaussianBlur stdDeviation="1.5" />
            </filter>
          </defs>

          <ellipse cx="100" cy="105" rx="18" ry="3" fill="url(#ember-glow)" opacity="0.7" />

          {embers.map((ember) => {
            const floatY = Math.sin((phase + ember.delay * 10) * 0.3) * 8
            const driftX = Math.sin((phase + ember.delay * 7) * 0.2) * 6
            const opacity = 0.2 + Math.sin((phase + ember.delay * 5) * 0.15) * 0.15
            return (
              <circle
                key={ember.id}
                cx={100 + driftX}
                cy={100 + floatY - 15 - ember.delay * 3}
                r={ember.size}
                fill="#f0c84a"
                opacity={Math.max(0, opacity)}
                filter="url(#ember-blur)"
              />
            )
          })}

          <text x="100" y="28" textAnchor="middle" fill="#d4a017" fontSize="8" opacity="0.5" letterSpacing="3">
            LIFE EMBER
          </text>
          <text x="100" y="40" textAnchor="middle" fill="#c0c0c0" fontSize="9" opacity="0.35" letterSpacing="1">
            Your echo remains
          </text>
        </svg>

        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-20 h-[2px] bg-gradient-to-r from-transparent via-gold/40 to-transparent rounded-full blur-[2px]" />
      </div>
    </div>
  )
}

export function Soulprint({ className = '' }: { className?: string }) {
  const [points, setPoints] = useState<{ x: number; y: number; r: number; speed: number; phase: number }[]>([])

  useEffect(() => {
    setPoints(
      Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2
        const radius = 20 + Math.random() * 25
        return {
          x: 50 + Math.cos(angle) * radius,
          y: 50 + Math.sin(angle) * radius,
          r: 1 + Math.random() * 2.5,
          speed: 0.3 + Math.random() * 0.5,
          phase: Math.random() * Math.PI * 2,
        }
      })
    )
  }, [])

  const t = Date.now() / 1000

  return (
    <div className={cn('relative', className)}>
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <defs>
          <radialGradient id="soul-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f0c84a" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#d4a017" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#d4a017" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="50" cy="50" r="25" fill="url(#soul-core)" />

        {points.map((p, i) => {
          const pulse = Math.sin(t * p.speed + p.phase) * 3
          return (
            <circle
              key={i}
              cx={p.x + Math.sin(t * p.speed * 0.7 + p.phase) * 2}
              cy={p.y + Math.cos(t * p.speed * 0.7 + p.phase) * 2}
              r={p.r + Math.max(0, pulse * 0.2)}
              fill="#c0c0c0"
              opacity={0.25 + Math.sin(t * p.speed + p.phase) * 0.12}
            />
          )
        })}

        {Array.from({ length: 6 }, (_, i) => {
          const angle = (i / 6) * Math.PI * 2 + t * 0.05
          const r = 18 + Math.sin(t * 0.3 + i) * 4
          return (
            <circle
              key={`orbit-${i}`}
              cx={50 + Math.cos(angle) * r}
              cy={50 + Math.sin(angle) * r}
              r="0.8"
              fill="#d4a017"
              opacity={0.4}
            />
          )
        })}

        <circle cx="50" cy="50" r="3" fill="#f0c84a" opacity="0.6">
          <animate attributeName="r" values="2;3.5;2" dur="3s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="3s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  )
}

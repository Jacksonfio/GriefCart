interface Point { x: number; y: number }

interface ChartSparklineProps {
  data?: Point[]
  color?: string
  height?: number
  width?: number
  className?: string
}

const defaultData: Point[] = [
  { x: 0, y: 45 }, { x: 1, y: 42 }, { x: 2, y: 48 }, { x: 3, y: 44 },
  { x: 4, y: 52 }, { x: 5, y: 49 }, { x: 6, y: 55 }, { x: 7, y: 53 },
  { x: 8, y: 58 }, { x: 9, y: 60 }, { x: 10, y: 56 }, { x: 11, y: 62 },
  { x: 12, y: 59 }, { x: 13, y: 65 }, { x: 14, y: 63 }, { x: 15, y: 70 },
  { x: 16, y: 68 }, { x: 17, y: 72 }, { x: 18, y: 75 }, { x: 19, y: 71 },
]

export function ChartSparkline({
  data = defaultData,
  color = '#b91c1c',
  height = 40,
  width = 120,
  className = '',
}: ChartSparklineProps) {
  const maxY = Math.max(...data.map(d => d.y))
  const minY = Math.min(...data.map(d => d.y))
  const range = maxY - minY || 1
  const stepX = width / (data.length - 1)

  const points = data.map((d, i) => ({
    x: i * stepX,
    y: height - ((d.y - minY) / range) * (height - 4) - 2,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
  const areaD = `${pathD} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <defs>
        <linearGradient id={`spark-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-fill-${color.replace('#', '')})`} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-[0_0_4px_rgba(185,28,28,0.3)]"
        style={{ strokeDasharray: '800', strokeDashoffset: '800', animation: 'drawLine 1.5s ease-out forwards' }}
      />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={color} className="drop-shadow-[0_0_4px_rgba(185,28,28,0.5)]" />
    </svg>
  )
}

export function ChartCandlestick({ className = '' }: { className?: string }) {
  const candles = [
    { x: 10, open: 50, close: 55, high: 58, low: 48 },
    { x: 30, open: 55, close: 52, high: 57, low: 50 },
    { x: 50, open: 52, close: 58, high: 60, low: 51 },
    { x: 70, open: 58, close: 62, high: 64, low: 56 },
    { x: 90, open: 62, close: 59, high: 63, low: 57 },
    { x: 110, open: 59, close: 65, high: 67, low: 58 },
  ]

  return (
    <svg width="130" height="44" viewBox="0 0 130 44" className={className}>
      {candles.map((c, i) => {
        const isUp = c.close >= c.open
        const color = isUp ? '#b91c1c' : '#d97706'
        const bodyTop = Math.min(c.open, c.close)
        const bodyBottom = Math.max(c.open, c.close)
        const yScale = (v: number) => 42 - ((v - 48) / (67 - 48)) * 38
        return (
          <g key={i}>
            <line x1={c.x} y1={yScale(c.high)} x2={c.x} y2={yScale(c.low)} stroke={color} strokeWidth="1" opacity="0.5" />
            <rect x={c.x - 4} y={yScale(bodyTop)} width="8" height={Math.max(yScale(bodyBottom) - yScale(bodyTop), 1.5)} rx="1" fill={color} opacity="0.85" />
          </g>
        )
      })}
    </svg>
  )
}

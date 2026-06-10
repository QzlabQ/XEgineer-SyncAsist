'use client'

/**
 * Small inline dot-pulse spinner — 3 dots pulsing in sequence.
 * Sized like Loader2 (~12-16px), uses emerald accent color.
 */
interface InlineSpinnerProps {
  size?: number
  className?: string
}

export function InlineSpinner({ size = 14, className = '' }: InlineSpinnerProps) {
  const dotSize = Math.round(size * 0.25)
  const gap = Math.round(size * 0.15)
  const color = 'var(--accent)'

  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap: `${gap}px`, width: size, height: size, justifyContent: 'center' }}
      role="status"
      aria-label="加载中"
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: color,
            display: 'inline-block',
            animation: `inline-dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite both`,
          }}
        />
      ))}
      <style>{`
        @keyframes inline-dot-pulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.7); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  )
}

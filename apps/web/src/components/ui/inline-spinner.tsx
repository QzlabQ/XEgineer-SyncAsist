'use client'

/**
 * Small inline spinner using DotmSquare3, sized like Loader2 (~14-16px).
 * Use as drop-in replacement for <Loader2 size={N} className="animate-spin" />.
 */
import { DotmSquare3 } from './dotm-square-3'

interface InlineSpinnerProps {
  size?: number
  className?: string
}

export function InlineSpinner({ size = 14, className = '' }: InlineSpinnerProps) {
  return <DotmSquare3 size={size} className={`text-[var(--accent)] ${className}`} />
}

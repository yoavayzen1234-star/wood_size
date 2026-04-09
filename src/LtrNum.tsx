import type { ReactNode } from 'react'

type LtrNumProps = {
  children: ReactNode
  className?: string
  /** לנגישות — תיאור המספר למשתמשי קוראי מסך */
  ariaLabel?: string
}

/** מספרים ב־LTR עם ריווח טאבולרי (עמוד בעברית) */
export function LtrNum({ children, className = '', ariaLabel }: LtrNumProps) {
  return (
    <span dir="ltr" className={`tabular-nums ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </span>
  )
}


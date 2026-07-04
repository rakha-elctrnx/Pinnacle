import { type ButtonHTMLAttributes, type ReactNode } from 'react'

/**
 * Predefined color variants that map to token-based classes.
 * Extend as needed — keep values token-driven, not arbitrary colors.
 */
const variantMap = {
  default:
    'text-text-muted hover:bg-bg-hover hover:text-text-primary active:bg-bg-muted',
  active:
    'bg-primary text-text-inverse hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-muted',
  danger:
    'text-text-secondary hover:bg-red-500/10 hover:text-danger active:bg-red-500/15',
  success:
    'text-success hover:bg-emerald-500/10 hover:text-success-text active:bg-emerald-500/15',
  accent:
    'text-primary hover:bg-primary/10 active:bg-primary/15',
} as const

/** Disabled variant — muted icon + flat bg to clearly signal "not actionable". */
const disabledClasses =
  'text-[var(--color-disabled-text)]'

export type ActionButtonVariant = keyof typeof variantMap

interface ActionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Lucide icon node. */
  icon: ReactNode
  /** Accessible label — also used as `title` if no explicit title is provided. */
  'aria-label': string
  /** Visual variant (default: `'default'`). */
  variant?: ActionButtonVariant
}

/**
 * Icon-only action button: `rounded-lg p-1.5` + token-driven hover colors.
 *
 * @example
 * <ActionButton icon={<Sun size={16} />} aria-label="Theme" onClick={toggle} />
 * <ActionButton icon={<Trash2 size={16} />} aria-label="Delete" variant="danger" />
 */
export function ActionButton({
  icon,
  variant = 'default',
  className = '',
  title,
  ...rest
}: ActionButtonProps) {
  const isDisabled = rest.disabled
  return (
    <button
      type="button"
      className={`rounded-lg p-1.5 transition cursor-pointer ${
        isDisabled
          ? disabledClasses
          : `${variantMap[variant]} active:scale-95`
      } disabled:cursor-not-allowed ${className}`}
      title={title ?? rest['aria-label']}
      {...rest}
    >
      {icon}
    </button>
  )
}

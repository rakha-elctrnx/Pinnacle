import { type ButtonHTMLAttributes, type ReactNode } from 'react'

/**
 * Predefined color variants that map to token-based classes.
 * Extend as needed — keep values token-driven, not arbitrary colors.
 */
const variantMap = {
  default:
    'text-text-muted hover:bg-bg-hover hover:text-text-primary',
  active:
    'bg-bg-hover text-text-primary hover:bg-bg-hover/80 hover:text-text-primary',
  secondary:
    'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
  danger:
    'text-text-secondary hover:bg-bg-hover hover:text-red-400',
  success:
    'text-text-muted hover:bg-emerald-500/10 hover:text-emerald-400',
  accent:
    'text-primary hover:bg-bg-hover',
} as const

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
  return (
    <button
      type="button"
      className={`rounded-lg p-1.5 transition cursor-pointer disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-bg-subtle ${variantMap[variant]} ${className}`}
      title={title ?? rest['aria-label']}
      {...rest}
    >
      {icon}
    </button>
  )
}

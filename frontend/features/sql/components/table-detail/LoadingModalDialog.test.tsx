import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingModalDialog } from './LoadingModalDialog'

describe('LoadingModalDialog', () => {
  it('does not render when open is false', () => {
    render(<LoadingModalDialog open={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a modal dialog centered on table container when open is true with elapsed ms indicator', () => {
    render(<LoadingModalDialog open={true} label="Loading table data..." />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()
    expect(dialog.className).toContain('absolute inset-0 z-40')
    expect(screen.getByText('Loading table data...')).toBeDefined()
    expect(screen.getByText('(0ms)')).toBeDefined()
  })
})

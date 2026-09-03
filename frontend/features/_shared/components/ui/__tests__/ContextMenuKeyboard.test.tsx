// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { GenericContextMenu } from '../ContextMenu'
import type { ContextMenuItem } from '../ContextMenu'

/**
 * Host component that keeps a "trigger" button in the DOM and conditionally
 * renders the context menu. When the menu calls onClose it unmounts the menu
 * (mirroring DataExplorerLayout-driven focus restoration).
 */
function MenuHost({
  items,
  onClose,
}: {
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
        Trigger
      </button>
      {open && (
        <GenericContextMenu
          x={10}
          y={10}
          items={items}
          ariaLabel="Test menu"
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        />
      )}
    </div>
  )
}

function renderMenu(items: ContextMenuItem[], onClose = vi.fn()) {
  const rendered = render(<MenuHost items={items} onClose={onClose} />)
  const trigger = rendered.getByTestId('trigger') as HTMLButtonElement
  trigger.focus()
  fireEvent.click(trigger)
  return { ...rendered, onClose }
}

function menuItems() {
  const menus = document.querySelectorAll('[role="menu"]')
  const menu = menus[0]
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).map(
    (el) => el.textContent ?? '',
  )
}

afterEach(() => {
  cleanup()
})

describe('GenericContextMenu keyboard navigation', () => {
  it('ArrowDown/ArrowUp skip dividers and disabled items', async () => {
    const action = vi.fn()
    const { getByRole } = renderMenu([
      { label: 'One', action },
      { divider: true },
      { label: 'Disabled', disabled: true },
      { label: 'Three', action },
    ])
    const menu = getByRole('menu')

    // Initial active item is index 0 ("One").
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Three')
    })

    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('One')
    })

    // Divider and disabled rows are present but never focused for nav.
    expect(menuItems()).toEqual(['One', 'Disabled', 'Three'])
  })

  it('opens a submenu with ArrowRight and navigates within it', async () => {
    const subAction = vi.fn()
    const { getByRole } = renderMenu([
      {
        label: 'Open',
        children: [
          { label: 'Sub One', action: vi.fn() },
          { label: 'Sub Two', action: subAction },
        ],
      },
    ])
    const menu = getByRole('menu')

    fireEvent.keyDown(menu, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menu"]').length).toBe(2)
    })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Sub One')
    })

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Sub Two')
    })

    fireEvent.keyDown(menu, { key: 'Enter' })
    await waitFor(() => {
      expect(subAction).toHaveBeenCalled()
    })
  })

  it('opens a submenu with Enter and closes it with ArrowLeft', async () => {
    const { getByRole } = renderMenu([
      { label: 'Open', children: [{ label: 'Child', action: vi.fn() }] },
    ])
    const menu = getByRole('menu')

    fireEvent.keyDown(menu, { key: 'Enter' })
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menu"]').length).toBe(2)
    })

    fireEvent.keyDown(menu, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menu"]').length).toBe(1)
    })
    // Focus returns to the parent item.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Open')
    })
  })

  it('Escape inside a submenu closes the submenu first', async () => {
    const { getByRole } = renderMenu([
      { label: 'Parent', children: [{ label: 'Child', action: vi.fn() }] },
    ])
    const menu = getByRole('menu')

    fireEvent.keyDown(menu, { key: 'Enter' })
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menu"]').length).toBe(2)
    })

    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menu"]').length).toBe(1)
    })
    expect(getByRole('menu')).toBeTruthy()
  })

  it('executes the active item action on Enter and Space', async () => {
    const action1 = vi.fn()
    const action2 = vi.fn()
    const { getByRole, onClose } = renderMenu([
      { label: 'First', action: action1 },
      { label: 'Second', action: action2 },
    ])
    const menu = getByRole('menu')

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Second')
    })

    fireEvent.keyDown(menu, { key: 'Enter' })
    await waitFor(() => {
      expect(action2).toHaveBeenCalled()
    })
    expect(onClose).toHaveBeenCalled()
    cleanup()

    // Space activates too (fresh mount keeps focus on the trigger).
    const second = renderMenu([{ label: 'Only', action: action1 }])
    fireEvent.keyDown(second.getByRole('menu'), { key: ' ' })
    await waitFor(() => {
      expect(action1).toHaveBeenCalled()
    })
  })

  it('restores focus to the trigger element on close', async () => {
    const onClose = vi.fn()
    const { getByRole } = renderMenu(
      [{ label: 'One', action: vi.fn() }],
      onClose,
    )
    const trigger = document.querySelector('[data-testid="trigger"]') as
      | HTMLButtonElement
      | undefined
    expect(trigger).toBeTruthy()
    // When menu opens, it immediately sets activeIndex=0 and focuses item 0 ('One')
    expect(document.activeElement?.textContent).toBe('One')

    // Move focus into the menu first.
    const menu = getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('One')
    })

    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    // After unmount the menu should restore focus to the trigger.
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('focuses the first interactive item when item 0 is a divider or disabled', async () => {
    const action = vi.fn()
    const { getByRole } = renderMenu([
      { divider: true },
      { label: 'Disabled', disabled: true },
      { label: 'First Active', action },
      { label: 'Second', action: vi.fn() },
    ])
    const menu = getByRole('menu')

    // On mount activeIndex should skip the leading divider and disabled row and
    // focus the first interactive item, never an inert row.
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('First Active')
    })

    // ArrowDown continues from there into the real interactive items.
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Second')
    })
  })

  it('keeps the menu inert when every item is a divider', async () => {
    const { getByRole } = renderMenu([{ divider: true }, { divider: true }])
    const menu = getByRole('menu')
    await waitFor(() => {
      expect(menu.querySelectorAll('[role="separator"]').length).toBe(2)
    })
    // No actionable menuitem exists (dividers are role=separator) and none is
    // focused.
    expect(menu.querySelectorAll('[role="menuitem"]').length).toBe(0)
    expect(
      menu.querySelectorAll('[role="menuitem"][tabindex="0"]').length,
    ).toBe(0)
    expect(
      Array.from(document.querySelectorAll('[role="menuitem"]')).filter(
        (el) => document.activeElement === el,
      ).length,
    ).toBe(0)
  })

  it('renders submenu dividers as separators instead of empty menu items', async () => {
    const { getByRole } = renderMenu([
      {
        label: 'Move to',
        children: [
          { label: 'Production', action: vi.fn() },
          { divider: true },
          { label: 'New Folder', action: vi.fn() },
        ],
      },
    ])

    const parentMenu = getByRole('menu')
    fireEvent.mouseEnter(parentMenu.querySelector('[role="menuitem"]')!)

    const submenu = await waitFor(() => getByRole('menu', { name: 'Move to' }))
    expect(submenu.querySelectorAll('[role="separator"]')).toHaveLength(1)
    expect(
      Array.from(submenu.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent,
      ),
    ).toEqual(['Production', 'New Folder'])
  })

  it('expands the root menu from the right-click coordinates', async () => {
    const animate = vi.fn()
    const originalAnimate = HTMLElement.prototype.animate
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.animate = animate
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        top: 10,
        left: 10,
        right: 170,
        bottom: 110,
        width: 160,
        height: 100,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }) as DOMRect

    try {
      const { getByRole } = renderMenu([{ label: 'Open', action: vi.fn() }])
      const menu = getByRole('menu') as HTMLElement

      await waitFor(() => expect(animate).toHaveBeenCalled())
      expect(menu.style.transformOrigin).toBe('0px 0px')
      expect(animate).toHaveBeenCalledWith(
        [
          { opacity: 0, transform: 'scale(0.78)', filter: 'blur(4px)' },
          { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' },
        ],
        { duration: 190, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      )
    } finally {
      HTMLElement.prototype.animate = originalAnimate
      HTMLElement.prototype.getBoundingClientRect = originalRect
    }
  })

  it('anchors an opened submenu to its parent menu item (not fixed)', async () => {
    const { getByRole } = renderMenu([
      {
        label: 'Move to',
        children: [
          { label: 'Connection', action: vi.fn() },
          { label: 'Database', action: vi.fn() },
        ],
      },
    ])
    const menu = getByRole('menu')

    // Open via hover — the path used for real sidebar menus.
    const parentItem = menu.querySelector('[role="menuitem"]') as HTMLElement
    fireEvent.mouseEnter(parentItem)
    await waitFor(() => {
      expect(document.querySelectorAll('[role="menu"]').length).toBe(2)
    })

    const submenu = getByRole('menu', { name: 'Move to' }) as HTMLElement
    const wrapper = submenu.parentElement as HTMLElement

    // The submenu is a DOM child of the parent item's `relative` wrapper and
    // positioned by CSS relative to it — not to the viewport.
    expect(wrapper.className).toContain('relative')
    expect(submenu.className).toContain('absolute')
    // Anchored to the parent item's top-right edge with the 2px overlap.
    expect(submenu.className).toContain('top-0')
    expect(submenu.className).toContain('left-[calc(100%-2px)]')
    // No fixed positioning and no inline viewport coordinates.
    expect(submenu.className).not.toContain('fixed')
    expect(submenu.getAttribute('style')).toBeNull()

    // The root menu is the only viewport-positioned element.
    expect(Array.from(document.querySelectorAll('.fixed'))).toEqual([menu])
  })
})

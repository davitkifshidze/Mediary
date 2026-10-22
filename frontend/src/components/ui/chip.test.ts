import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **ამრჩევის ჩიპი — მონიშნულზე ✓ და სავსე ფონი**.

   შენი სიტყვები: „რომ ირჩევ მუქად არის — უფრო ეგ კარგია, და დამატებით
   პატარა პტიჩკის აიქონის რომ გავყოლოთ… რომელიც მონიშნულია". მოწმდება:
   `check`-იან ჩიპზე ✓ მხოლოდ მონიშნულზეა და უფერო მონიშნულიც სავსეა;
   ფილტრის ჩიპი (`check`-ის გარეშე) ძველებურია — ✓ არ აქვს.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(props: Record<string, unknown>) {
  const { Chip } = await import('@/components/ui/chip')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(Chip, props as Parameters<typeof Chip>[0], 'RPG')))
  return container.querySelector('button')!
}

describe('Chip', () => {
  it('a picker chip shows ✓ and a filled background only when picked', async () => {
    const on = await mount({ active: true, check: true })
    expect(on.querySelector('[data-testid="chip-check"]')).not.toBeNull()
    expect(on.className).toContain('bg-primary')
    expect(on.className).toContain('text-primary-foreground')
    act(() => root?.unmount())
    container?.remove()

    const off = await mount({ active: false, check: true })
    expect(off.querySelector('[data-testid="chip-check"]')).toBeNull()
    expect(off.className).not.toContain('bg-primary')
  })

  it('a filter chip keeps its quiet picked look without ✓', async () => {
    const chip = await mount({ active: true })
    expect(chip.querySelector('[data-testid="chip-check"]')).toBeNull()
    expect(chip.className).toContain('bg-secondary')
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createContext, createElement as h, useContext, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'

/* ============================================================
   **კლასიფიკატორის იქვე დამატება** — საერთო კომპონენტი.

   ⚠️ მოწმდება ქცევა და არა Radix: `./select` აქ უბრალო ღილაკებითაა
   ჩანაცვლებული (jsdom-ში Radix-ის სია მაჩვენებლის მოვლენებს ითხოვს), რომ
   ჩანდეს სწორედ ჩვენი ლოგიკა — სიის ბოლო პუნქტი და გვერდითა „+" **ერთსა და
   იმავე ფანჯარას** ხსნის, ბოლო პუნქტის არჩევა მნიშვნელობას არ ცვლის, ფანჯრის
   შენახული მნიშვნელობა კი მაშინვე არჩეულია. ფანჯრის გარეშე სია ჩვეულებრივია.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./select', () => {
  const Ctx = createContext<(value: string) => void>(() => {})
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) =>
      h(Ctx.Provider, { value: onValueChange }, children),
    SelectTrigger: ({ id, className }: { id?: string; className?: string }) => h('span', { id, className, 'data-testid': 'trigger' }),
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => h('div', { 'data-testid': 'options' }, children),
    SelectItem: ({ value, children, ...rest }: { value: string; children: ReactNode }) => {
      const pick = useContext(Ctx)
      return h('button', { type: 'button', 'data-value': value, onClick: () => pick(value), ...rest }, children)
    },
  }
})

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  return container
}

const click = (el: Element | null | undefined) => act(async () => (el as HTMLElement).click())

/** ფანჯრის ნაცვალი: „შენახვა" ახალ მნიშვნელობას ირჩევს და ხურავს */
const dialog = (close: () => void, pick: (value: string) => void) =>
  h(
    'div',
    { role: 'dialog' },
    h('button', { 'data-testid': 'save', onClick: () => (pick('42'), close()) }),
    h('button', { 'data-testid': 'cancel', onClick: close }),
  )

async function select(props: Record<string, unknown> = {}) {
  const { SelectWithAdd } = await import('./inline-add')
  const { SelectItem } = await import('./select')
  const onValueChange = vi.fn()
  const el = await mount(
    h(
      SelectWithAdd,
      { value: '1', onValueChange, addLabel: 'კატეგორიის დამატება', dialog, ...props } as never,
      h(SelectItem, { value: '1' } as never, 'ერთი'),
      h(SelectItem, { value: '2' } as never, 'ორი'),
    ),
  )
  return { el, onValueChange }
}

describe('SelectWithAdd', () => {
  it('ends the list with “add new” and puts a plus beside the field', async () => {
    const { el } = await select()

    const options = [...el.querySelectorAll('[data-testid="options"] button')]
    expect(options.map((o) => o.textContent)).toEqual(['ერთი', 'ორი', 'ახლის დამატება'])
    expect(options[2].getAttribute('data-inline-add')).toBe('item')

    const plus = el.querySelector('[data-inline-add="button"]')!
    expect(plus.getAttribute('aria-label')).toBe('კატეგორიის დამატება')
    expect(plus.getAttribute('title')).toBe('კატეგორიის დამატება')
  })

  it('opens the same dialog from the last option and from the plus — the option never becomes the value', async () => {
    const { el, onValueChange } = await select()

    await click(el.querySelector('[data-inline-add="item"]'))
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(onValueChange).not.toHaveBeenCalled()

    await click(el.querySelector('[data-testid="cancel"]'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await click(el.querySelector('[data-inline-add="button"]'))
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  })

  it('selects the saved value at once', async () => {
    const { el, onValueChange } = await select()

    await click(el.querySelector('[data-inline-add="button"]'))
    await click(el.querySelector('[data-testid="save"]'))

    expect(onValueChange).toHaveBeenCalledWith('42')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('still passes an ordinary choice through', async () => {
    const { el, onValueChange } = await select()

    await click(el.querySelector('[data-value="2"]'))
    expect(onValueChange).toHaveBeenCalledWith('2')
  })

  it('is a plain select without a dialog — no plus, no extra option', async () => {
    const { el } = await select({ dialog: undefined })

    expect(el.querySelector('[data-inline-add="button"]')).toBeNull()
    expect(el.querySelector('[data-inline-add="item"]')).toBeNull()
    expect(el.querySelectorAll('[data-testid="options"] button')).toHaveLength(2)
  })

  it('marks the field invalid and keeps its id on the trigger', async () => {
    const { el } = await select({ id: 'c-category', invalid: true })
    const trigger = el.querySelector('[data-testid="trigger"]')!

    expect(trigger.id).toBe('c-category')
    expect(trigger.className).toContain('border-destructive')
  })
})

describe('AddChip and useInlineAdd', () => {
  it('draws a dashed “add new” chip, or names what is added', async () => {
    const { AddChip } = await import('./inline-add')
    const el = await mount(h('div', null, h(AddChip, { onClick: () => {} }), h(AddChip, { onClick: () => {}, label: 'ახალი ალბომი' })))
    const chips = [...el.querySelectorAll('[data-inline-add="chip"]')]

    expect(chips.map((c) => c.textContent)).toEqual(['ახლის დამატება', 'ახალი ალბომი'])
    for (const chip of chips) {
      expect(chip.className).toContain('border-dashed')
      expect(chip.querySelector('svg.lucide-plus')).not.toBeNull()
    }
  })

  it('gives a chip row the same dialog and picks what it saved', async () => {
    const { AddChip, useInlineAdd } = await import('./inline-add')
    const picked = vi.fn()
    function Row() {
      const add = useInlineAdd(dialog, picked)
      return h('div', null, add.available && h(AddChip, { onClick: add.open }), add.node)
    }
    const el = await mount(h(Row))

    await click(el.querySelector('[data-inline-add="chip"]'))
    await click(el.querySelector('[data-testid="save"]'))

    expect(picked).toHaveBeenCalledWith('42')
    expect(el.querySelector('[role="dialog"]')).toBeNull()
  })

  it('reports itself unavailable without a dialog', async () => {
    const { useInlineAdd } = await import('./inline-add')
    let available = true
    function Row() {
      available = useInlineAdd(undefined, () => {}).available
      return null
    }
    await mount(h(Row))

    expect(available).toBe(false)
  })
})

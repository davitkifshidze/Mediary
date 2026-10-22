import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import type { RecordLayout } from '@/lib/recordLayout'

/* ============================================================
   **ხედის გადამრთველი და ჩანაწერის სამი განლაგება**.

   ⚠️ მოწმდება: გადამრთველი სამ რეჟიმს აჩვენებს და არჩეულს `aria-pressed`-ით
   ნიშნავს; `RecordView` ერთი აღწერიდან სამნაირად იხატება (სტრიქონი — ზოლით,
   ბარათი — ფართო ფოტოთი და ზოლით, ბადე — ფოტო + სათაური, მოქმედებები
   ჰოვერზე); `useRecordLayout` შენახულს `module_user.settings`-იდან კითხულობს,
   უცნობ მნიშვნელობაზე ნაგულისხმევს იღებს და გადართვას **ჩუმად** ინახავს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  updateModuleSettings: vi.fn(),
  modules: [] as { key: string; user_settings?: Record<string, unknown> }[],
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({ all: mocks.modules, enabled: mocks.modules, mediaModules: [], pageModules: [], customModules: [], has: () => true, loading: false }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.modules = []
  vi.clearAllMocks()
})

async function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient()
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, node)))
  return container
}

const pressed = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLButtonElement>('[data-testid="view-toggle"] button')].find((b) => b.getAttribute('aria-pressed') === 'true')

describe('ViewToggle', () => {
  it('shows the three layouts with text and marks the current one', async () => {
    const { ViewToggle } = await import('@/components/ui/view-toggle')
    const onChange = vi.fn()
    const el = await render(h(ViewToggle, { value: 'rows', onChange }))

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons.map((b) => b.textContent)).toEqual([i18n.t('view.cards'), i18n.t('view.grid'), i18n.t('view.rows')])
    expect(pressed(el)?.textContent).toBe(i18n.t('view.rows'))
    // `PageHeader`-ის ზოლის სიმაღლე — ძებნისა და ღილაკების ტოლი
    expect(el.querySelector('[data-testid="view-toggle"]')?.className).toContain('h-10')

    await act(async () => buttons[1].click())
    expect(onChange).toHaveBeenCalledWith('grid')
  })
})

describe('RecordView', () => {
  async function view(layout: RecordLayout, extra: Record<string, unknown> = {}) {
    const { RecordList, RecordView } = await import('@/components/RecordView')
    const onOpen = vi.fn()
    const onEdit = vi.fn()
    const el = await render(
      h(RecordList, {
        layout,
        children: h(RecordView, {
          title: 'Dune',
          onOpen,
          openLabel: 'open',
          photo: 'https://img.test/dune.jpg',
          shape: 'poster',
          placeholder: h('span', null, 'no photo'),
          meta: h('span', null, '1965'),
          tags: ['sci-fi'],
          bar: h('div', { 'data-testid': 'bar' }, 'bar'),
          actions: [{ key: 'open', label: 'Open', run: onOpen }],
          onEdit,
          photoTestId: 'photo',
          titleTestId: 'title',
          ...extra,
        }),
      }),
    )
    return { el, onOpen, onEdit }
  }

  it('rows: the current row — small photo, title, meta, tags and the action bar', async () => {
    const { el, onOpen } = await view('rows')

    const li = el.querySelector('li')!
    expect(li.dataset.recordLayout).toBe('rows')
    expect(el.querySelector('[data-testid="record-list"]')?.className).toContain('space-y-2')
    expect(el.querySelector('[data-testid="photo"]')?.className).toContain('h-16 w-11')
    expect(li.textContent).toContain('1965')
    expect(li.textContent).toContain('#sci-fi')
    expect(el.querySelector('[data-testid="bar"]')).not.toBeNull()

    await act(async () => (el.querySelector('[data-testid="title"]') as HTMLButtonElement).click())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('cards: a wide photo on top with the whole poster, and the bar below', async () => {
    const { el } = await view('cards')

    expect(el.querySelector('li')!.dataset.recordLayout).toBe('cards')
    expect(el.querySelector('[data-testid="record-list"]')?.className).toContain('grid')
    const photo = el.querySelector('[data-testid="photo"]')!
    expect(photo.className).toContain('aspect-video')
    // პოსტერი ჩამოჭრის გარეშე
    expect(photo.querySelector('img')?.className).toContain('object-contain')
    expect(el.querySelector('[data-testid="record-card-bar"] [data-testid="bar"]')).not.toBeNull()
  })

  it('grid: photo and title only — edit and the full menu on hover, no bar', async () => {
    const { el, onEdit } = await view('grid')

    expect(el.querySelector('li')!.dataset.recordLayout).toBe('grid')
    expect(el.querySelector('[data-testid="photo"]')?.className).toContain('aspect-[2/3]')
    expect(el.querySelector('[data-testid="bar"]')).toBeNull()
    expect(el.textContent).not.toContain('1965')

    const hover = el.querySelector('[data-testid="record-tile-actions"]')!
    const buttons = [...hover.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent)).toEqual([i18n.t('actions.edit'), i18n.t('actions.more')])
    await act(async () => buttons[0].click())
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('without a photo draws the placeholder in every layout', async () => {
    for (const layout of ['rows', 'cards', 'grid'] as const) {
      const { el } = await view(layout, { photo: null })
      expect(el.querySelector('[data-testid="photo"]')?.textContent).toBe('no photo')
      act(() => root?.unmount())
      container?.remove()
    }
  })
})

describe('useRecordLayout', () => {
  async function harness(moduleKey: string, fallback: RecordLayout) {
    const { useRecordLayout } = await import('@/lib/recordLayout')
    const { ViewToggle } = await import('@/components/ui/view-toggle')

    function Harness() {
      const [layout, setLayout] = useRecordLayout(moduleKey, fallback)
      return h('div', { 'data-layout': layout }, h(ViewToggle, { value: layout, onChange: setLayout }))
    }

    return render(h(Harness))
  }

  it('reads the saved view of the module and falls back when there is none or it is unknown', async () => {
    mocks.modules = [{ key: 'book', user_settings: { view: 'grid' } }, { key: 'game', user_settings: { view: 'tiles' } }]

    let el = await harness('book', 'rows')
    expect(el.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('grid')
    act(() => root?.unmount())
    container?.remove()

    el = await harness('game', 'rows')
    expect(el.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('rows')
  })

  it('switching shows at once and is saved quietly on the module', async () => {
    mocks.updateModuleSettings.mockResolvedValue(undefined)
    const el = await harness('bookmark', 'rows')

    const cards = [...el.querySelectorAll<HTMLButtonElement>('button')][0]
    await act(async () => cards.click())

    expect(el.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('cards')
    expect(mocks.updateModuleSettings).toHaveBeenCalledWith('bookmark', { view: 'cards' })
  })

  it('a failed save keeps the chosen view on screen', async () => {
    mocks.updateModuleSettings.mockRejectedValue(new Error('offline'))
    const el = await harness('note', 'rows')

    await act(async () => [...el.querySelectorAll<HTMLButtonElement>('button')][1].click())

    expect(el.querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('grid')
  })
})

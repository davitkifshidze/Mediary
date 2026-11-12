import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SerpEngine } from '@/api/web'
import { WebSourcePicker } from '@/components/WebSourcePicker'
import i18n from '@/i18n'

/* ============================================================
   **„სად ვეძებთ" — წყაროები ბარათებად.**

   ⚠️ მოწმდება: ბარათი ამბობს ფასს (უფასო · კრედიტით და დარჩენილი ბიუჯეტი · შენი გასაღები);
   მონიშნული ბარათი ცხადია; „ყველას მონიშვნა" ყველას ნიშნავს, „გასუფთავება" პირველს ტოვებს;
   ბოლო მონიშნული წყარო არ იხსნება.
   ============================================================ */

const ENGINES: SerpEngine[] = [
  { key: 'wikimedia', name: 'Wikimedia', safe_search: false, free: true, uses_quota: false },
  { key: 'google_images', name: 'Google', safe_search: true, free: false, uses_quota: true },
  { key: 'serper', name: 'Serper', safe_search: true, free: false, uses_quota: false, paged: true },
]

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(selected: string[], onChange = vi.fn()) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      h(
        TooltipProvider,
        null,
        h(WebSourcePicker, { engines: ENGINES, selected, onChange, quota: { used: 8, limit: 250, remaining: 242 } }),
      ),
    ),
  )

  return { box: container, onChange }
}

const card = (box: HTMLElement, key: string) => box.querySelector<HTMLButtonElement>(`button[data-source="${key}"]`)!
const tool = (box: HTMLElement, id: string) => box.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!

describe('WebSourcePicker', () => {
  it('draws every source as a card that says what it costs', async () => {
    const { box } = await mount(['wikimedia'])

    expect(box.querySelectorAll('[data-testid="web-sources"] button[data-kind="card"]')).toHaveLength(3)
    expect(card(box, 'wikimedia').textContent).toContain(i18n.t('web.sourceFree'))
    // SerpApi-ის წყაროზე — დარჩენილი ბიუჯეტი
    expect(card(box, 'google_images').textContent).toContain(i18n.t('web.sourceCredit'))
    expect(card(box, 'google_images').textContent).toContain(i18n.t('web.remaining', { count: 242 }))
    // Serper თავისი გასაღებით მუშაობს და იმ ბიუჯეტს არ ეხება
    expect(card(box, 'serper').textContent).toContain(i18n.t('web.sourceOwnKey'))
    expect(card(box, 'serper').textContent).not.toContain('242')

    // მონიშნულია მხოლოდ პირველი
    expect(card(box, 'wikimedia').getAttribute('aria-pressed')).toBe('true')
    expect(card(box, 'google_images').getAttribute('aria-pressed')).toBe('false')
  })

  it('selects all with one button and clears back to the first with the other', async () => {
    const first = await mount(['wikimedia'])

    // გასასუფთავებელი არაფერია, სანამ მხოლოდ პირველია მონიშნული
    expect(tool(first.box, 'sources-clear').disabled).toBe(true)
    await act(async () => tool(first.box, 'sources-all').click())
    expect(first.onChange).toHaveBeenCalledWith(['wikimedia', 'google_images', 'serper'])

    act(() => root?.unmount())
    container?.remove()

    const all = await mount(['wikimedia', 'google_images', 'serper'])
    expect(tool(all.box, 'sources-all').disabled).toBe(true)
    await act(async () => tool(all.box, 'sources-clear').click())
    expect(all.onChange).toHaveBeenCalledWith(['wikimedia'])
  })

  it('toggles a card but never leaves the search without a source', async () => {
    const { box, onChange } = await mount(['wikimedia'])

    await act(async () => card(box, 'serper').click())
    expect(onChange).toHaveBeenLastCalledWith(['wikimedia', 'serper'])

    // ბოლო მონიშნული ბარათი არ იხსნება
    await act(async () => card(box, 'wikimedia').click())
    expect(onChange).toHaveBeenLastCalledWith(['wikimedia'])
  })
})

/* ფანჯრის ორი წვრილმანი, რომელიც საერთო კომპონენტებზე დგას და წყაროდან მოწმდება:
   „გასუფთავება" ნამდვილი ღილაკია (ჩარჩო, ფონი, აიქონი, ჰოვერი — `Button outline`), ნაპოვნი
   ფოტოს ნიშანი კი საერთო `SelectMark`-ია — თეთრი ✓, ფილაზე ჰოვერისას წითელი ✕. */
const DIALOG = import.meta.glob<string>('./WebImageDialog.tsx', { query: '?raw', import: 'default', eager: true })['./WebImageDialog.tsx']

describe('WebImageDialog', () => {
  it('keeps the clear button a framed button with an icon', () => {
    expect(DIALOG).toMatch(/<Button\s+type="button"\s+variant="outline"\s+disabled=\{!query\}[\s\S]{0,220}<X className="size-4" \/>\s+\{t\('actions\.clear'\)\}/)
  })

  it('marks a found photo with the shared selection mark inside the clickable tile', () => {
    expect(DIALOG).toContain('<SelectMark checked={on} size="sm" onPhoto')
    expect(DIALOG).toContain('data-kind="tile"')
  })
})

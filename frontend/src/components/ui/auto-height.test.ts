import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **მოდალის სიმაღლე** (Tasks §5 → Tasks §37).

   ⚠️ jsdom განლაგებას არ ითვლის, ამიტომ მოწმდება წმინდა ფუნქციები
   (`fitHeight`, `layoutHeight`, `shouldAnimate`) და `AutoHeight`-ის ქცევა
   ყალბი `ResizeObserver`-ით: სიმაღლე ინლაინ `style.height`-ით „იცვლება"
   (jsdom-ის `getComputedStyle` მას კითხულობს).
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fitHeight', () => {
  it('rounds a fractional height up — no extra pixel any more (§37.1)', async () => {
    const { fitHeight } = await import('@/components/ui/auto-height')

    expect(fitHeight(612.4)).toBe(613)
    expect(fitHeight(612)).toBe(612)
  })

  it('ignores a hidden (0) or broken measurement', async () => {
    const { fitHeight } = await import('@/components/ui/auto-height')

    expect(fitHeight(0)).toBeNull()
    expect(fitHeight(Number.NaN)).toBeNull()
    expect(fitHeight(-3)).toBeNull()
  })
})

describe('layoutHeight (§37.1)', () => {
  it('reads the layout height while the dialog is still scaled to 0.96', async () => {
    const { layoutHeight } = await import('@/components/ui/auto-height')
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.style.height = '612.4px'
    // გახსნის `scale(0.96)` — ეკრანზე ყუთი 4%-ით მოკლეა; ადრე სწორედ ეს იზომებოდა
    el.getBoundingClientRect = () => ({ height: 587.9, width: 0, top: 0, left: 0, right: 0, bottom: 587.9, x: 0, y: 0, toJSON: () => ({}) })

    expect(layoutHeight(el)).toBeCloseTo(612.4)
    el.remove()
  })
})

describe('shouldAnimate (§37.3)', () => {
  it('skips the first measurement and a few-pixel wobble, keeps a running animation going', async () => {
    const { shouldAnimate } = await import('@/components/ui/auto-height')

    expect(shouldAnimate(null, 400, false)).toBe(false)
    expect(shouldAnimate(400, 403, false)).toBe(false)
    expect(shouldAnimate(400, 460, false)).toBe(true)
    expect(shouldAnimate(400, 402, true)).toBe(true)
  })
})

describe('AutoHeight (§37)', () => {
  /** ყალბი `ResizeObserver` — `fire()` ცვლილებას ხელით აცნობებს */
  function stubObserver() {
    const observers: (() => void)[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb)
        }
        observe() {}
        disconnect() {}
      },
    )
    return () => act(() => observers.forEach((cb) => cb()))
  }

  async function mount(scroll: boolean) {
    const { AutoHeight } = await import('@/components/ui/auto-height')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(h(AutoHeight, { scroll, children: h('p', { className: 'mt-4' }, 'x') })))
    const outer = container.firstElementChild as HTMLDivElement
    const inner = outer.firstElementChild as HTMLDivElement
    return { outer, inner }
  }

  it('keeps the first child top margin inside the measured box (§37.2)', async () => {
    const { inner } = await mount(true)

    // `flow-root` — `mt-4` აღარ „გადმოდის" შიდა ყუთიდან
    expect(inner.className).toContain('flow-root')
    expect(inner.firstElementChild?.className).toBe('mt-4')
  })

  it('hides the scrollbar only visually while growing — the body never stops scrolling (§37.3/§37.5)', async () => {
    vi.useFakeTimers()
    const fire = stubObserver()
    const { outer, inner } = await mount(true)
    let boxHeight = 200
    Object.defineProperty(outer, 'clientHeight', { get: () => boxHeight })
    // Windows-ის ზოლი — 15 px; `--sb-gutter` მოდალის მარჯვენა პადინგს აკლდება (`.fb-modal-body`)
    Object.defineProperty(outer, 'offsetWidth', { get: () => 600 })
    Object.defineProperty(outer, 'clientWidth', { get: () => 585 })

    inner.style.height = '200px'
    fire()
    expect(outer.style.getPropertyValue('--sb-gutter')).toBe('15px')
    expect(outer.style.height).toBe('200px')
    expect(outer.className).not.toContain('fb-autoheight') // პირველი გაზომვა — უანიმაციოდ

    // ჩანართი გაიზარდა: ანიმაცია, ზოლი ვიზუალურად დამალულია, გადახვევა კი ჩართულია
    inner.style.height = '400px'
    fire()
    expect(outer.style.height).toBe('400px')
    expect(outer.className).toContain('fb-autoheight')
    expect(outer.hasAttribute('data-settling')).toBe(true)
    expect(outer.className).toContain('overflow-y-auto')
    expect(outer.className).not.toContain('overflow-hidden')

    act(() => vi.advanceTimersByTime(300))
    expect(outer.hasAttribute('data-settling')).toBe(false)

    // რამდენიმე px-ის რყევა — უანიმაციოდ
    boxHeight = 400
    inner.style.height = '403px'
    fire()
    expect(outer.style.height).toBe('403px')
    expect(outer.className).not.toContain('fb-autoheight')
  })

  it('leaves a legitimate scrollbar alone when the box is already at its limit', async () => {
    const fire = stubObserver()
    const { outer, inner } = await mount(true)
    // ყუთი ზღვარზეა (90vh): შიგთავსი 1200, ხილული 700 — ზოლი ჩანს და უნდა დარჩეს
    Object.defineProperty(outer, 'clientHeight', { get: () => 700 })

    inner.style.height = '1200px'
    fire()
    inner.style.height = '1500px'
    fire()

    expect(outer.className).toContain('fb-autoheight')
    expect(outer.hasAttribute('data-settling')).toBe(false)
  })
})

describe('Textarea autoGrow', () => {
  it('renders without a resize handle and keeps the row floor', async () => {
    const { Textarea } = await import('@/components/ui/textarea')

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(h(Textarea, { rows: 4, autoGrow: true, value: 'x', onChange: () => {} })))

    const el = container.querySelector('textarea')!
    expect(el.className).toContain('resize-none')
    expect(el.rows).toBe(4)
    // jsdom-ში `scrollHeight` 0-ია — ინლაინ სიმაღლე არ იწერება
    expect(el.style.height).toBe('')
  })
})

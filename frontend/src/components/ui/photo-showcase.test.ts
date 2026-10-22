import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **ფოტოების ვიტრინა — გვერდიგვერდ და ავტოსლაიდით**.

   ⚠️ მოწმდება: მთავარი ფოტო `sm`-იდან ნახევარ სიგანეზეა, ესკიზები მარჯვნივ
   სვეტად (ტელეფონზე — ზოლად); ფოტოები ყოველ წამში თავისით იცვლება და ბოლოდან
   პირველზე ბრუნდება; ჰოვერზე ჩერდება; `autoplay={false}` — მხოლოდ ხელით; ერთ
   ფოტოზე ესკიზები და ავტოსლაიდი არ არის.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.useRealTimers()
})

const ITEMS = [1, 2, 3].map((id) => ({ id, src: `photos/${id}.jpg`, title: `photo ${id}` }))

async function mount(props: Record<string, unknown> = {}) {
  const { PhotoShowcase } = await import('@/components/ui/photo-showcase')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(PhotoShowcase, { items: ITEMS, ...props })))
  return container
}

/** რომელი ფოტოა მთავარი — მიმდინარე ესკიზის წარწერით */
const current = (el: HTMLElement) => el.querySelector('[data-testid="showcase-thumbs"] [aria-current="true"]')?.getAttribute('aria-label')

describe('PhotoShowcase', () => {
  it('puts the main photo at half width with the thumbnails beside it as a column', async () => {
    const el = await mount({ autoplay: false })

    const main = el.querySelector('[data-testid="showcase-main"]')!
    expect(main.className).toContain('sm:w-1/2')
    expect(main.parentElement!.className).toContain('sm:flex')
    const thumbs = el.querySelector('[data-testid="showcase-thumbs"]')!
    expect(thumbs.className).toContain('sm:flex-col')
    expect(thumbs.className).toContain('sm:overflow-y-auto')
    expect(thumbs.querySelectorAll('button')).toHaveLength(3)
  })

  it('slides by itself every second and wraps from the last photo to the first', async () => {
    vi.useFakeTimers()
    const el = await mount()
    expect(current(el)).toBe('photo 1')

    await act(async () => vi.advanceTimersByTime(1000))
    expect(current(el)).toBe('photo 2')
    await act(async () => vi.advanceTimersByTime(2000))
    expect(current(el)).toBe('photo 1')
  })

  it('stops while the pointer is over it', async () => {
    vi.useFakeTimers()
    const el = await mount()
    const showcase = el.querySelector<HTMLElement>('[data-testid="photo-showcase"]')!

    await act(async () => showcase.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
    await act(async () => vi.advanceTimersByTime(3000))
    expect(current(el)).toBe('photo 1')

    await act(async () => showcase.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
    await act(async () => vi.advanceTimersByTime(1000))
    expect(current(el)).toBe('photo 2')
  })

  it('autoplay={false} changes photos only by hand', async () => {
    vi.useFakeTimers()
    const el = await mount({ autoplay: false })

    await act(async () => vi.advanceTimersByTime(3000))
    expect(current(el)).toBe('photo 1')
    await act(async () => el.querySelectorAll<HTMLButtonElement>('[data-testid="showcase-thumbs"] button')[2].click())
    expect(current(el)).toBe('photo 3')
  })

  it('a single photo has no thumbnails and no sliding', async () => {
    vi.useFakeTimers()
    const el = await mount({ items: ITEMS.slice(0, 1) })

    expect(el.querySelector('[data-testid="showcase-thumbs"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(3000))
    expect(el.querySelector('[data-testid="showcase-main"] img')?.getAttribute('alt')).toBe('photo 1')
  })
})

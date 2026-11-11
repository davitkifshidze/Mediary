import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'
import css from '@/index.css?raw'

/* ============================================================
   **მთავარი ფოტოს ჩარჩო**.

   ⚠️ მოწმდება კლასებით (snapshot-ის გარეშე; jsdom განლაგებას არ ითვლის):
   `fill` ჩარჩო `sm`-დან `absolute inset-0`-ია — ზომას სვეტი (`MediaRow`)
   წყვეტს და არა ფოტო; ვიწროზე ფიქსირებული ფორმა რჩება; ფოტოიან ჩარჩოს
   „შეცვლა" და „წაშლა" ქვედა ზოლში აქვს (ერთ რიგში, თანაბრად), შუაში კი
   თვალი ფოტოს დიდად ხსნის; ახალი ფაილი ჩაგდებითაც იცვლება. ზოლის ხილვადობა
   CSS-ისაა (`index.css`) და ტექსტად მოწმდება.
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
  const { PosterUploader } = await import('@/components/PosterUploader')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(h(PosterUploader, { preview: null, onSelect: () => {}, onClear: () => {}, ...props } as Parameters<typeof PosterUploader>[0])),
  )
  return container
}

describe('PosterUploader', () => {
  it('fill: from sm up the frame fills the column (absolute) — the photo can no longer size it', async () => {
    const el = await mount({ fill: true })
    const box = el.querySelector('[data-testid="poster-dropzone"]')!
    for (const cls of ['sm:absolute', 'sm:inset-0', 'sm:aspect-auto', 'sm:w-auto']) expect(box.className).toContain(cls)
    // ვიწროზე — ფიქსირებული ფორმა
    expect(box.className).toContain('aspect-[2/3]')
    expect(box.className).toContain('w-40')
    // ძველი `sm:h-full` (ლეიბლის ქვემოთ ~26 px-ით სცდებოდა) აღარ არის
    expect(box.className).not.toContain('sm:h-full')
  })

  it('the empty frame says “upload or drop” and keeps the form’s own hint as a second line', async () => {
    const el = await mount({ fill: true, variant: 'wide', hint: 'თუ არ ატვირთე, BGG-დან ჩამოვა.' })
    const box = el.querySelector('[data-testid="poster-dropzone"]')!
    expect(box.className).toContain('aspect-video')
    expect(box.className).toContain('border-dashed')
    expect(box.textContent).toContain('ატვირთე ან ჩააგდე')
    expect(box.textContent).toContain('BGG')
  })

  it('a photo frame never grows past its column and the photo covers it', async () => {
    const el = await mount({ fill: true, preview: 'https://img.test/p.jpg' })
    const frame = el.querySelector('[data-testid="poster-preview"]')!
    expect(frame.className).toContain('sm:absolute')
    expect(frame.className).toContain('overflow-hidden')
    expect(frame.querySelector('img')?.className).toContain('size-full')
    expect(frame.querySelector('img')?.className).toContain('object-cover')
  })

  it('a photo frame keeps Change and Delete in one strip at the bottom edge, equally wide', async () => {
    const onClear = vi.fn()
    const el = await mount({ fill: true, preview: 'https://img.test/p.jpg', onClear })
    const frame = el.querySelector('[data-testid="poster-preview"]')!
    // ჩარჩო ზოლის მასპინძელია — მასზე ჰოვერი ზოლს აჩენს
    expect(frame.className).toContain('fb-photo-host')

    const bar = frame.querySelector('[data-testid="poster-actions"]')!
    for (const cls of ['fb-photo-bar', 'absolute', 'inset-x-0', 'bottom-0', 'grid', 'grid-cols-2']) {
      expect(bar.className).toContain(cls)
    }
    // მთელ ფოტოზე გადაფარებული მუქი ფენა აღარ არის
    expect([...frame.querySelectorAll('div')].some((d) => d.className.includes('inset-0') && d.className.includes('bg-black'))).toBe(false)

    const buttons = [...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(buttons).toEqual(['შეცვლა', 'წაშლა'])

    act(() => (frame.querySelector('button[aria-label="remove"]') as HTMLButtonElement).click())
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('the eye in the middle opens the photo large', async () => {
    const el = await mount({ fill: true, preview: 'blob:http://localhost/abc' })
    const eye = el.querySelector<HTMLButtonElement>('[data-testid="poster-view"]')!

    expect(eye.className).toContain('fb-photo-eye')
    expect(eye.getAttribute('aria-label')).toBe('ფოტოს გადიდება')
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => eye.click())

    // ⚠️ `blob:` მისამართს არც გაფართოება აქვს, არც `mime` — მნახველი მაინც ფოტოს ხატავს
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('მთავარი ფოტო')
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('blob:http://localhost/abc')
  })

  it('the strip shows on hover and focus, and always on a touch screen', () => {
    expect(css).toMatch(/\.fb-photo-bar,\s*\.fb-photo-eye \{ opacity: 0; pointer-events: none;/)
    expect(css).toContain('.fb-photo-host:hover .fb-photo-bar,')
    expect(css).toContain('.fb-photo-host:focus-within .fb-photo-bar,')
    expect(css).toMatch(/@media \(hover: none\) \{\s*\.fb-photo-bar,\s*\.fb-photo-eye \{ opacity: 1; pointer-events: auto; \}/)
  })

  it('dropping a new file on a photo frame replaces the photo', async () => {
    const onSelect = vi.fn()
    const el = await mount({ fill: true, preview: 'https://img.test/p.jpg', onSelect })
    const frame = el.querySelector('[data-testid="poster-preview"]')!
    const file = new File(['x'], 'new.png', { type: 'image/png' })

    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file], items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], types: ['Files'] },
    })
    await act(async () => {
      frame.dispatchEvent(drop)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onSelect).toHaveBeenCalledWith(file)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/i18n'

/* ============================================================
   **მთავარი ფოტოს ჩარჩო** (Tasks §14.1 → Tasks §38).

   ⚠️ მოწმდება კლასებით (snapshot-ის გარეშე; jsdom განლაგებას არ ითვლის):
   `fill` ჩარჩო `sm`-დან `absolute inset-0`-ია — ზომას სვეტი (`MediaRow`)
   წყვეტს და არა ფოტო; ვიწროზე ფიქსირებული ფორმა რჩება; ფოტოიან ჩარჩოს
   „შეცვლა" და „წაშლა" აქვს, ახალი ფაილი კი ჩაგდებითაც იცვლება.
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
  it('fill: from sm up the frame fills the column (absolute) — the photo can no longer size it (§38.1)', async () => {
    const el = await mount({ fill: true })
    const box = el.querySelector('[data-testid="poster-dropzone"]')!
    for (const cls of ['sm:absolute', 'sm:inset-0', 'sm:aspect-auto', 'sm:w-auto']) expect(box.className).toContain(cls)
    // ვიწროზე — ფიქსირებული ფორმა
    expect(box.className).toContain('aspect-[2/3]')
    expect(box.className).toContain('w-40')
    // ძველი `sm:h-full` (ლეიბლის ქვემოთ ~26 px-ით სცდებოდა) აღარ არის
    expect(box.className).not.toContain('sm:h-full')
  })

  it('the empty frame says “upload or drop” and keeps the form’s own hint as a second line (§38.5)', async () => {
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

  it('a photo frame offers Change and Delete on hover — hidden buttons take no taps (§38.5)', async () => {
    const onClear = vi.fn()
    const el = await mount({ fill: true, preview: 'https://img.test/p.jpg', onClear })
    const frame = el.querySelector('[data-testid="poster-preview"]')!
    const overlay = frame.querySelector('.pointer-events-none')!
    expect(overlay.className).toContain('group-hover:pointer-events-auto')
    expect(overlay.className).toContain('opacity-0')

    const buttons = [...frame.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(buttons).toEqual(['შეცვლა', 'წაშლა'])

    act(() => (frame.querySelector('button[aria-label="remove"]') as HTMLButtonElement).click())
    expect(onClear).toHaveBeenCalledTimes(1)
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

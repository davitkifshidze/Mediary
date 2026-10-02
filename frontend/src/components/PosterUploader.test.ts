import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **ფორმის ფოტოს ყუთი — ზომა მეზობლებისაა** (Tasks §14.1).

   ⚠️ მოწმდება კლასებით (snapshot-ის გარეშე): `fill` ყუთს `sm:h-full`-ს და
   ავტომატურ სიგანეს აძლევს, ვიწროზე კი ფიქსირებული ზომა რჩება; `fill`-ის
   გარეშე ძველი ფიქსირებული ზომაა; ფოტოთი ყუთი იმავე ზომისაა და ფოტო მას ავსებს.
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
  it('fill: the box takes the neighbours’ height from sm up and keeps a fixed size below', async () => {
    const el = await mount({ fill: true })
    const box = el.querySelector('[data-testid="poster-dropzone"]')!
    expect(box.className).toContain('sm:h-full')
    expect(box.className).toContain('sm:w-auto')
    expect(box.className).toContain('aspect-[2/3]')
    expect(box.className).toContain('w-40')
  })

  it('without fill the old fixed shapes stay; wide is 16:9', async () => {
    const poster = await mount({})
    expect(poster.querySelector('[data-testid="poster-dropzone"]')?.className).not.toContain('sm:h-full')

    act(() => root?.unmount())
    container?.remove()

    const wide = await mount({ variant: 'wide', fill: true })
    const box = wide.querySelector('[data-testid="poster-dropzone"]')!
    expect(box.className).toContain('aspect-video')
    expect(box.className).toContain('sm:max-w-xs')
  })

  it('with a preview the frame has the same shape and the photo covers it', async () => {
    const el = await mount({ fill: true, preview: 'https://img.test/p.jpg' })
    const frame = el.querySelector('[data-testid="poster-preview"]')!
    expect(frame.className).toContain('sm:h-full')
    expect(frame.querySelector('img')?.className).toContain('object-cover')
    expect(frame.querySelector('button[aria-label="remove"]')).toBeTruthy()
  })
})

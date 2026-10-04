import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { GalleryOwnedImage } from '@/api/gallery'
import i18n from '@/i18n'

/* ============================================================
   **ფოტოს ჩაკეტვა გალერეიდან (Tasks §35.5).**

   პირველად სისტემური ალბომი „ჩაკეტილი ფოტოები" არ არსებობს — სერვერი 409
   `locked_album_password_required`-ით ითხოვს პაროლს; ფანჯარა პაროლს იღებს
   და **იმავე ფოტოებს** ხელახლა აგზავნის.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  lockGalleryPhotos: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await import('@/components/gallery/GalleryPhotoGrid')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const photo = (id: number) =>
  ({
    id,
    url: `gallery/images/${id}.jpg`,
    original_name: `photo-${id}.jpg`,
    mime: 'image/jpeg',
    size: 1024,
    created_at: '2026-10-04T10:00:00+04:00',
    source: 'tmdb',
    source_url: null,
    is_thumbnail: false,
    category: 'backdrop',
    album_id: null,
    width: 400,
    height: 600,
    owner: null,
  }) as unknown as GalleryOwnedImage

function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('GalleryPhotoGrid — lock a photo', () => {
  it('asks for the locked album password the first time and sends the same photos again', async () => {
    mocks.lockGalleryPhotos
      .mockRejectedValueOnce(
        new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 409,
          statusText: 'Conflict',
          headers: {},
          config: {} as never,
          data: { message: 'locked_album_password_required' },
        }),
      )
      .mockResolvedValueOnce({ album_id: 5, created: true, locked: 1 })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const { GalleryPhotoGrid } = await import('@/components/gallery/GalleryPhotoGrid')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    await act(async () =>
      root!.render(
        h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(GalleryPhotoGrid, { images: [photo(11)] }))))),
      ),
    )
    await flush()

    await act(async () => (container!.querySelector(`[aria-label="${i18n.t('actions.more')}"]`) as HTMLButtonElement).click())
    await flush()
    // `⋯` — მარჯვენა კლიკის იგივე სია; პუნქტები ბადის გარეთ, ღილაკებად იხატება
    const item = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === i18n.t('lock.photo') && !container!.contains(b),
    )!
    await act(async () => item.click())
    await flush()

    expect(mocks.lockGalleryPhotos).toHaveBeenCalledWith([11], undefined)
    expect(document.getElementById('locked-photos-form')).toBeTruthy()

    type('locked-photos-password', 'secret1')
    type('locked-photos-repeat', 'secret1')
    await act(async () => (document.getElementById('locked-photos-form') as HTMLFormElement).requestSubmit())
    await flush()

    expect(mocks.lockGalleryPhotos).toHaveBeenLastCalledWith([11], 'secret1')
    expect(document.getElementById('locked-photos-form')).toBeNull()
  })
})

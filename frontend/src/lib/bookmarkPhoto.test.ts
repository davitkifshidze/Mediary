import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import type { Bookmark } from '@/api/bookmarks'
import { FeedbackProvider } from '@/components/ui/feedback'

/* ============================================================
   **ბუკმარკის გატეხილი ფოტო და „ბმულიდან განახლება".**

   ⚠️ მოწმდება: გატეხილი დაშორებული ფოტო **ერთხელ**, ჩუმად ახლდება ბმულიდან;
   თუ გვერდმა ახალი მისამართი მოგვცა — სია თავიდან იკითხება, თუ არა — ფოტოს
   ადგილას ცარიელი მდგომარეობაა; მეორე ჩავარდნა სერვერს აღარ აწუხებს;
   ატვირთული ფოტო ბმულიდან საერთოდ არ ახლდება; მასობრივი განახლება მხოლოდ
   ბმულიდან მოსულ (ან უფოტო) ბუკმარკებს ეხება და ერთი ჩავარდნა დანარჩენს არ აჩერებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  refreshBookmarkFromLink: vi.fn(),
  fetchBookmarks: vi.fn(),
}))

vi.mock('@/api/bookmarks', async (original) => ({
  ...(await original<typeof import('@/api/bookmarks')>()),
  refreshBookmarkFromLink: mocks.refreshBookmarkFromLink,
  fetchBookmarks: mocks.fetchBookmarks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
let client: QueryClient

afterEach(async () => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
  const { resetBookmarkPhotos } = await import('@/lib/bookmarkPhoto')
  resetBookmarkPhotos()
})

async function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  client = new QueryClient()
  await act(async () => root!.render(h(QueryClientProvider, { client }, h(FeedbackProvider, null, node))))
  return container
}

const REMOTE = 'https://shop.test/dead.jpg'
const bookmark = (id: number, image: string | null): Bookmark => ({ id, image }) as Bookmark
const changed = (image: string) => ({ bookmark: bookmark(1, image), imageFound: true, imageChanged: true })
const unchanged = { bookmark: bookmark(1, REMOTE), imageFound: false, imageChanged: false }

/** ჰუკის პასუხი ტესტს გარეთ გამოაქვს — ყოველ დახატვაზე ახლდება */
async function usePhoto() {
  const { useBookmarkPhoto } = await import('@/lib/bookmarkPhoto')
  const out: { current: ReturnType<typeof useBookmarkPhoto> | null } = { current: null }

  function Probe() {
    out.current = useBookmarkPhoto()
    return null
  }

  await render(h(Probe))
  return out as { current: ReturnType<typeof useBookmarkPhoto> }
}

describe('isRemoteImage', () => {
  it('tells a page address from one of our own file paths', async () => {
    const { isRemoteImage } = await import('@/lib/bookmarkPhoto')

    expect(isRemoteImage('https://shop.test/a.jpg')).toBe(true)
    expect(isRemoteImage('HTTP://shop.test/a.jpg')).toBe(true)
    expect(isRemoteImage('bookmarks/thumbnails/a.jpg')).toBe(false)
    expect(isRemoteImage('gallery/images/a.jpg')).toBe(false)
    expect(isRemoteImage(null)).toBe(false)
  })
})

describe('a broken bookmark photo', () => {
  it('is refreshed from the link once, silently, and the list is read again when the address changed', async () => {
    mocks.refreshBookmarkFromLink.mockResolvedValue(changed('https://shop.test/new.jpg'))
    const photo = await usePhoto()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await act(async () => photo.current.onError(bookmark(1, REMOTE)))

    expect(mocks.refreshBookmarkFromLink).toHaveBeenCalledTimes(1)
    expect(mocks.refreshBookmarkFromLink).toHaveBeenCalledWith(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookmarks'] })
    // ძველი მისამართი გატეხილად არ ითვლება — სია ახალს მოიტანს
    expect(photo.current.photoOf(bookmark(1, 'https://shop.test/new.jpg'))).toBe('https://shop.test/new.jpg')
  })

  it('becomes an empty state when the page has nothing new', async () => {
    mocks.refreshBookmarkFromLink.mockResolvedValue(unchanged)
    const photo = await usePhoto()

    expect(photo.current.photoOf(bookmark(1, REMOTE))).toBe(REMOTE)
    await act(async () => photo.current.onError(bookmark(1, REMOTE)))

    expect(photo.current.photoOf(bookmark(1, REMOTE))).toBeNull()
    // სხვა ბუკმარკის იგივე მისამართი ამით არ იმალება
    expect(photo.current.photoOf(bookmark(2, REMOTE))).toBe(REMOTE)
  })

  it('never asks the server twice for the same bookmark', async () => {
    mocks.refreshBookmarkFromLink.mockResolvedValue(changed('https://shop.test/new.jpg'))
    const photo = await usePhoto()

    await act(async () => photo.current.onError(bookmark(1, REMOTE)))
    // ახალი მისამართიც ვერ ჩაიტვირთა
    await act(async () => photo.current.onError(bookmark(1, 'https://shop.test/new.jpg')))

    expect(mocks.refreshBookmarkFromLink).toHaveBeenCalledTimes(1)
    expect(photo.current.photoOf(bookmark(1, 'https://shop.test/new.jpg'))).toBeNull()
  })

  it('stays quiet when the refresh itself fails', async () => {
    mocks.refreshBookmarkFromLink.mockRejectedValue(new Error('403'))
    const photo = await usePhoto()

    await act(async () => photo.current.onError(bookmark(1, REMOTE)))

    expect(photo.current.photoOf(bookmark(1, REMOTE))).toBeNull()
    expect(document.body.textContent).not.toContain('403')
  })

  it('does not go to the link for an uploaded photo', async () => {
    const photo = await usePhoto()

    await act(async () => photo.current.onError(bookmark(1, 'bookmarks/thumbnails/a.jpg')))

    expect(mocks.refreshBookmarkFromLink).not.toHaveBeenCalled()
    expect(photo.current.photoOf(bookmark(1, 'bookmarks/thumbnails/a.jpg'))).toBeNull()
  })
})

describe('refreshing the photos of a whole list', () => {
  async function useBulk() {
    const { useRefreshPhotos } = await import('@/lib/bookmarkPhoto')
    const out: { current: ReturnType<typeof useRefreshPhotos> | null } = { current: null }

    function Probe() {
      out.current = useRefreshPhotos()
      return null
    }

    await render(h(Probe))
    return out as { current: ReturnType<typeof useRefreshPhotos> }
  }

  it('targets every bookmark of the filter whose photo comes from a link, or that has none', async () => {
    mocks.fetchBookmarks.mockResolvedValue({
      items: [bookmark(1, REMOTE), bookmark(2, 'bookmarks/thumbnails/a.jpg'), bookmark(3, null)],
      total: 3,
      lastPage: 1,
    })
    const bulk = await useBulk()

    const list = await bulk.current.targets({ q: 'shoes', page: 3, per_page: 10 })

    // მთელი ფილტრი და არა მიმდინარე გვერდი
    expect(mocks.fetchBookmarks).toHaveBeenCalledWith({ q: 'shoes', page: undefined, per_page: undefined, all: true })
    expect(list.map((b) => b.id)).toEqual([1, 3])
  })

  it('goes through all of them even when one fails, and reads the list again', async () => {
    mocks.refreshBookmarkFromLink
      .mockResolvedValueOnce(changed('https://shop.test/new.jpg'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(unchanged)
      .mockResolvedValueOnce(changed('https://shop.test/other.jpg'))
    const bulk = await useBulk()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await act(async () => bulk.current.run([1, 2, 3, 4].map((id) => bookmark(id, REMOTE))))

    expect(mocks.refreshBookmarkFromLink).toHaveBeenCalledTimes(4)
    expect(bulk.current.progress).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookmarks'] })
    // ჯამი: ორი ფოტო შეიცვალა ოთხი ბუკმარკიდან
    expect(document.body.textContent).toContain('2')
    expect(document.body.textContent).toContain('4')
  })
})

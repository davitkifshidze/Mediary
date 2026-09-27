import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { TrashPayload } from '@/api/trash'
import { LOCKED_PHOTO_PLACEHOLDER } from '@/lib/lockedPhoto'
import { formatBytes } from '@/lib/utils'
import i18n from '@/i18n'

/* ============================================================
   **ურნის გვერდი — ყველა სახე ერთად** (Tasks §29, ეტაპი 1).

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს: ფაილის ჯგუფს საკუთარი სახელი
   აქვს (i18n) და ჩანაწერს — მოდულისა; ჩაკეტილი ალბომის ფოტო ბუნდოვანი
   ფილაა და არა ნამდვილი ესკიზი; აღუდგენელ ელემენტზე ღილაკი გამორთულია და
   მიზეზი იწერება; „მშობელიც ურნაშია" ითქმის; ურნის მოცულობა ჩანს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  restore: vi.fn(async () => ({ restored: true as const, with_parent: false })),
}))

const payload: TrashPayload = {
  keep_days: 30,
  bytes: 2_097_152,
  data: [
    {
      kind: 'movie',
      category: 'record',
      module: 'movie',
      name_ka: 'ფილმები',
      name_en: 'Movies',
      icon: 'Film',
      color: '#6366f1',
      total: 1,
      bytes: 1_048_576,
      items: [
        {
          id: 1, title: 'Inception', subtitle: null, trashed_at: '2026-09-20T10:00:00+04:00',
          expires_in_days: 22, size: 1_048_576, preview: { src: 'movies/posters/i.jpg', private: false },
          locked: false, when: null, count: null, module: null, offers_records: false, replaceable: false, scope: null, parent: null, restorable: true, blocked: null,
        },
      ],
    },
    {
      kind: 'gallery_image',
      category: 'item',
      module: 'gallery',
      name_ka: null,
      name_en: null,
      icon: 'Images',
      color: '#a855f7',
      total: 1,
      bytes: 300,
      items: [
        {
          id: 7, title: 'private-shot.jpg', subtitle: 'პირადი', trashed_at: '2026-09-21T10:00:00+04:00',
          expires_in_days: 23, size: 300, preview: null, locked: true, when: null, count: null, module: null, offers_records: false, replaceable: false, scope: null, parent: null, restorable: true, blocked: null,
        },
      ],
    },
    {
      kind: 'video_file',
      category: 'item',
      module: 'video',
      name_ka: null,
      name_en: null,
      icon: 'Video',
      color: '#ef4444',
      total: 1,
      bytes: 100,
      items: [
        {
          id: 9, title: 'paper.pdf', subtitle: 'Talk', trashed_at: '2026-09-21T10:00:00+04:00',
          expires_in_days: 23, size: 100, preview: null, locked: false, when: null, count: null, module: null, offers_records: false, replaceable: false, scope: null,
          parent: { kind: 'video', id: 3, title: 'Talk', trashed: true }, restorable: true, blocked: null,
        },
      ],
    },
    {
      kind: 'book_file',
      category: 'item',
      module: 'book',
      name_ka: null,
      name_en: null,
      icon: 'BookOpen',
      color: '#f59e0b',
      total: 1,
      bytes: 50,
      items: [
        {
          id: 11, title: 'ebook.epub', subtitle: 'Dune', trashed_at: '2026-09-21T10:00:00+04:00',
          expires_in_days: 23, size: 50, preview: null, locked: false, when: null, count: null, module: null, offers_records: false, replaceable: false, scope: null,
          parent: { kind: 'book', id: 4, title: 'Dune', trashed: false }, restorable: false, blocked: 'module_disabled',
        },
      ],
    },
    {
      kind: 'chat_message',
      category: 'message',
      module: 'chat',
      name_ka: null,
      name_en: null,
      icon: null,
      color: null,
      total: 1,
      bytes: 0,
      items: [
        {
          id: 13, title: 'გამარჯობა', subtitle: 'alice', trashed_at: '2026-09-21T10:00:00+04:00',
          expires_in_days: 23, size: 0, preview: null, locked: false, when: '2026-09-20T09:00:00+04:00', count: null, module: null,
          offers_records: false, replaceable: false, scope: 'both', parent: null, restorable: true, blocked: null,
        },
      ],
    },
  ],
}

vi.mock('@/api/trash', async (original) => ({
  ...(await original<typeof import('@/api/trash')>()),
  fetchTrash: vi.fn(async () => payload),
  restoreFromTrash: mocks.restore,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { TrashPage } = await import('@/pages/TrashPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        null,
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(TrashPage)))),
      ),
    ),
  )
  await flush()
}

/** ელემენტის რიგი სათაურით */
const row = (title: string) =>
  [...document.querySelectorAll('li')].find((li) => li.textContent?.includes(title)) as HTMLLIElement

const restoreButton = (li: HTMLLIElement) =>
  [...li.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('trash.restore'))) as HTMLButtonElement

describe('TrashPage', () => {
  it('names a record group after its module and a file group after its kind', async () => {
    await mount()

    const headings = [...document.querySelectorAll('h2')].map((h2) => h2.textContent)
    expect(headings).toContain('ფილმები')
    expect(headings).toContain(i18n.t('trash.kinds.gallery_image'))
    expect(headings).toContain(i18n.t('trash.kinds.video_file'))
  })

  it('says how much space the trash holds', async () => {
    await mount()

    expect(document.body.textContent).toContain(i18n.t('trash.bytes', { size: formatBytes(2_097_152) }))
  })

  it('draws a locked photo as the placeholder, never as its file', async () => {
    await mount()

    const img = row('private-shot.jpg').querySelector('img')
    expect(img?.getAttribute('src')).toBe(LOCKED_PHOTO_PLACEHOLDER)
  })

  it('warns that restoring a file brings its trashed record back too', async () => {
    await mount()

    expect(row('paper.pdf').textContent).toContain(i18n.t('trash.parentTrashed', { name: 'Talk' }))
  })

  it('disables restore and says why when an item cannot come back', async () => {
    await mount()

    const li = row('ebook.epub')
    expect(restoreButton(li).disabled).toBe(true)
    expect(li.textContent).toContain(i18n.t('trash.blocked.module_disabled'))
  })

  /* ⚠️ ეტაპი 5 — წერილი საბოლოოდ არ იშლება (§4.6), ამიტომ დადასტურება
     ფაილის „N MB გათავისუფლდება"-ს კი არა, „აღარ აღდგება"-ს ამბობს */
  it('shows a chat message with its scope and says deleting it only forgets it', async () => {
    await mount()

    const li = row('გამარჯობა')
    expect(li.textContent).toContain('alice')
    expect(li.textContent).toContain(i18n.t('trash.scope.both'))

    const remove = [...li.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('trash.deleteNow'))) as HTMLButtonElement
    await act(async () => remove.click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('trash.deleteMessageHint', { name: 'გამარჯობა' }))
  })

  it('restores by kind and id', async () => {
    await mount()

    await act(async () => restoreButton(row('paper.pdf')).click())
    await flush()

    expect(mocks.restore).toHaveBeenCalledWith('video_file', 9, { records: false, replace: false })
  })
})

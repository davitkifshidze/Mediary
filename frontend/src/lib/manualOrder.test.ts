import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { PAGE_ALL } from '@/lib/pageSize'
import bookmarks from '@/pages/BookmarksPage.tsx?raw'
import notes from '@/pages/NotesPage.tsx?raw'
import songs from '@/pages/SongsPage.tsx?raw'

/* ============================================================
   **ხელით დალაგება სიაში.**

   ⚠️ მოწმდება hook-ი: სხვა დალაგებაზე ის არაფერს აკეთებს (სახელური და
   მენიუს პუნქტები არ ჩანს); „ხელით"-ზე სია ერთი გვერდია, გადათრევა
   **მაშინვე** ჩანს (ოპტიმისტურად) და ინახება, „თავში" / „ბოლოში" იმავე
   მოთხოვნას აგზავნის; სერვერის ახალი სია ლოკალურ რიგს ცვლის, შეცდომა კი
   ძველ რიგს აბრუნებს. სამი გვერდი წყაროდან მოწმდება — ერთი და იგივე მიბმა.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const feedback = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/components/ui/feedback', () => ({ useToast: () => feedback }))

const { MANUAL_SORT, manualPageSize, useManualOrder } = await import('./manualOrder')

type Item = { id: number }
type Api = ReturnType<typeof useManualOrder<Item>>

let root: Root | null = null
let container: HTMLDivElement | null = null
let api: Api

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  feedback.toast.mockClear()
})

interface Props {
  sort: string
  items: Item[]
  save: (ids: number[]) => Promise<unknown>
  onSaved: () => void
}

function Probe(props: Props) {
  api = useManualOrder(props)
  return null
}

async function render(props: Props) {
  if (!root) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  const client = (render as unknown as { client?: QueryClient }).client ?? new QueryClient()
  ;(render as unknown as { client?: QueryClient }).client = client
  await act(async () => root!.render(h(QueryClientProvider, { client }, h(Probe, props))))
}

const items = (...ids: number[]): Item[] => ids.map((id) => ({ id }))
const order = () => api.items.map((item) => item.id)

describe('manualPageSize', () => {
  it('turns the list into one page only while the order is manual', () => {
    expect(manualPageSize(MANUAL_SORT, 10)).toBe(PAGE_ALL)
    expect(manualPageSize('newest', 10)).toBe(10)
  })
})

describe('useManualOrder', () => {
  it('stays out of the way on any other sort — no handle, no menu items', async () => {
    await render({ sort: 'newest', items: items(1, 2, 3), save: vi.fn(), onSaved: vi.fn() })

    expect(api.active).toBe(false)
    expect(api.sortable).toBeUndefined()
    expect(api.sortId({ id: 2 })).toBeUndefined()
    expect(api.actions({ id: 2 })).toEqual([])
    expect(order()).toEqual([1, 2, 3])
  })

  it('shows a dropped record in its place at once and saves the order', async () => {
    let settle: () => void = () => {}
    const save = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)))
    const onSaved = vi.fn()
    await render({ sort: MANUAL_SORT, items: items(1, 2, 3), save, onSaved })

    expect(api.sortable!.ids).toEqual([1, 2, 3])
    expect(api.sortId({ id: 2 })).toBe(2)

    await act(async () => api.sortable!.onReorder([3, 1, 2]))

    // სერვერს ჯერ არ უპასუხია — სია უკვე ახალი რიგითაა
    expect(order()).toEqual([3, 1, 2])
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith([3, 1, 2], expect.anything())
    expect(onSaved).not.toHaveBeenCalled()

    await act(async () => settle())
    expect(onSaved).toHaveBeenCalledTimes(1)
    // განახლებული სია ჯერ არ მოსულა — რიგი არ ხტება უკან
    expect(order()).toEqual([3, 1, 2])
  })

  it('lets the server list take over once it changes', async () => {
    const props = { sort: MANUAL_SORT, save: vi.fn(async () => {}), onSaved: vi.fn() }
    await render({ ...props, items: items(1, 2, 3) })
    await act(async () => api.sortable!.onReorder([3, 1, 2]))

    // ახალი ჩანაწერი თავში — ლოკალური რიგი იმ ძველ სიას ეკუთვნოდა
    await render({ ...props, items: items(9, 3, 1, 2) })
    expect(order()).toEqual([9, 3, 1, 2])
  })

  it('offers “to the top” and “to the bottom”, disabled at the ends', async () => {
    const save = vi.fn(async () => {})
    await render({ sort: MANUAL_SORT, items: items(1, 2, 3), save, onSaved: vi.fn() })

    const [top, bottom] = api.actions({ id: 2 })
    expect([top.key, bottom.key]).toEqual(['to-top', 'to-bottom'])
    expect([top.label, bottom.label]).toEqual(['თავში', 'ბოლოში'])
    expect(top.separator).toBe(true)
    expect([top.disabled, bottom.disabled]).toEqual([false, false])

    expect(api.actions({ id: 1 })[0].disabled).toBe(true)
    expect(api.actions({ id: 3 })[1].disabled).toBe(true)

    await act(async () => top.run!())
    expect(save).toHaveBeenLastCalledWith([2, 1, 3], expect.anything())
    expect(order()).toEqual([2, 1, 3])

    await act(async () => api.actions({ id: 2 })[1].run!())
    expect(save).toHaveBeenLastCalledWith([1, 3, 2], expect.anything())
    expect(order()).toEqual([1, 3, 2])
  })

  it('goes back to the saved order when the request fails', async () => {
    const save = vi.fn(async () => {
      throw new Error('offline')
    })
    await render({ sort: MANUAL_SORT, items: items(1, 2, 3), save, onSaved: vi.fn() })

    await act(async () => api.sortable!.onReorder([3, 2, 1]))

    expect(order()).toEqual([1, 2, 3])
    expect(feedback.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }))
  })
})

describe('the three list pages', () => {
  const PAGES: [name: string, source: string, save: string, item: string][] = [
    ['bookmarks', bookmarks, 'reorderBookmarks', 'bookmark'],
    ['notes', notes, 'reorderNotes', 'note'],
    ['songs', songs, 'reorderSongs', 'song'],
  ]

  it.each(PAGES)('%s: manual is a sort option, the list is one page, records get a handle', (_name, source, save, item) => {
    expect(source).toContain("const SORTS = ['newest', MANUAL_SORT, ")
    expect(source).toContain('pageSize: manualPageSize(sort, pageSize),')
    expect(source).toContain(`save: ${save},`)
    expect(source).toContain('<RecordList layout={layout} sortable={manual.sortable}>')
    expect(source).toContain(`sortId={manual.sortId(${item})}`)
    expect(source).toContain(`actions={[...actions, ...manual.actions(${item})]}`)
    // ერთგვერდიან სიაში გვერდის ზომის ამრჩევის ნაცვლად ახსნა ჩანს
    expect(source).toMatch(/manual\.active \? \(\s*<InfoHint info=\{t\('order\.hint'\)\} \/>/)
  })
})

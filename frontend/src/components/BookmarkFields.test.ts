import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Bookmark, BookmarkOwnField } from '@/api/bookmarks'
import i18n from '@/i18n'

/* ============================================================
   **ბუკმარკის საკუთარი ველები**.

   ⚠️ მოწმდება: თითო ველი ერთ ხაზზეა კოპირების ღილაკით; საიდუმლო ველი წერტილებადაა
   (მუდმივი სიგრძით), თვალი აჩვენებს, „კოპირება" კი ჩვენების გარეშეც ნამდვილ
   მნიშვნელობას იღებს; წაუკითხავი მნიშვნელობა ამას ცხადად ამბობს; რედაქტორი მთელ
   სიას აგზავნის — `id`-ებით, ცარიელი რიგის გარეშე — და 20-ზე მეტს არ ამატებს.
   ============================================================ */

const bookmark = { id: 5, title: 'მანქანის საბუთები' } as Bookmark

const fields: BookmarkOwnField[] = [
  { id: 1, label: 'ტექპასპორტი', value: 'AB1234567', is_secret: false, readable: true },
  { id: 2, label: 'PIN', value: '4821', is_secret: true, readable: true },
  { id: 3, label: 'ძველი კოდი', value: null, is_secret: false, readable: false },
]

const mocks = vi.hoisted(() => ({
  fetchBookmarkFields: vi.fn(),
  setBookmarkFields: vi.fn(),
  copyText: vi.fn(),
}))

vi.mock('@/api/bookmarks', async (original) => ({
  ...(await original<typeof import('@/api/bookmarks')>()),
  fetchBookmarkFields: mocks.fetchBookmarkFields,
  setBookmarkFields: mocks.setBookmarkFields,
}))

vi.mock('@/lib/clipboard', () => ({ copyText: mocks.copyText }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/components/BookmarkFields')
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(list: BookmarkOwnField[] = fields) {
  mocks.fetchBookmarkFields.mockResolvedValue(list)
  mocks.copyText.mockResolvedValue(true)
  mocks.setBookmarkFields.mockImplementation(async (_id: number, sent: unknown[]) =>
    sent.map((row, i) => ({ id: 100 + i, readable: true, ...(row as object) })),
  )

  const { BookmarkFieldsSection } = await import('@/components/BookmarkFields')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(BookmarkFieldsSection, { bookmark })))),
    ),
  )
  await flush()
  return container
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="bookmark-field"]')]
const valueOf = (row: HTMLElement) => row.querySelector('[data-testid="bookmark-field-value"]')?.textContent
const type = async (input: HTMLInputElement, text: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('BookmarkFields', () => {
  it('shows one row per field and copies the value with one press', async () => {
    await mount()

    expect(mocks.fetchBookmarkFields).toHaveBeenCalledWith(5)
    expect(rows()).toHaveLength(3)
    expect(rows()[0].textContent).toContain('ტექპასპორტი')
    expect(valueOf(rows()[0])).toBe('AB1234567')
    // ღია ველს თვალი არ სჭირდება
    expect(rows()[0].querySelector('[data-testid="bookmark-field-eye"]')).toBeNull()

    await act(async () => rows()[0].querySelector<HTMLButtonElement>('[data-testid="bookmark-field-copy"]')!.click())
    await flush()

    expect(mocks.copyText).toHaveBeenCalledWith('AB1234567')
    expect(document.body.textContent).toContain(i18n.t('bookmarks.fields.copied', { label: 'ტექპასპორტი' }))
  })

  it('keeps a secret field as dots until the eye is pressed, yet copies the real value', async () => {
    await mount()
    const secret = rows()[1]

    expect(valueOf(secret)).toBe('••••••••')
    expect(secret.textContent).not.toContain('4821')
    // წერტილების რაოდენობა მნიშვნელობის სიგრძეს არ იმეორებს
    expect(valueOf(secret)?.length).not.toBe('4821'.length)

    await act(async () => secret.querySelector<HTMLButtonElement>('[data-testid="bookmark-field-copy"]')!.click())
    await flush()
    expect(mocks.copyText).toHaveBeenCalledWith('4821')
    expect(valueOf(rows()[1])).toBe('••••••••')

    await act(async () => rows()[1].querySelector<HTMLButtonElement>('[data-testid="bookmark-field-eye"]')!.click())
    expect(valueOf(rows()[1])).toBe('4821')
    await act(async () => rows()[1].querySelector<HTMLButtonElement>('[data-testid="bookmark-field-eye"]')!.click())
    expect(valueOf(rows()[1])).toBe('••••••••')
  })

  it('says when a value cannot be decrypted and does not offer to copy nothing', async () => {
    await mount()
    const broken = rows()[2]

    expect(broken.querySelector('[data-testid="bookmark-field-unreadable"]')?.textContent).toContain(i18n.t('bookmarks.fields.unreadable'))
    expect(broken.querySelector<HTMLButtonElement>('[data-testid="bookmark-field-copy"]')!.disabled).toBe(true)
  })

  it('the editor sends the whole list — ids kept, an untouched empty row left out', async () => {
    await mount()

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="bookmark-fields-edit"]')!.click())
    await flush()

    const form = () => document.querySelector<HTMLFormElement>('[data-testid="bookmark-fields-form"]')!
    const editRows = () => [...form().querySelectorAll<HTMLElement>('[data-testid="bookmark-field-row"]')]
    expect(editRows()).toHaveLength(3)
    // რედაქტორში საიდუმლო მნიშვნელობაც ღიაა — ჩასმულს აკრეფისას ამოწმებ
    expect(editRows()[1].querySelectorAll<HTMLInputElement>('input')[1].value).toBe('4821')

    await type(editRows()[0].querySelectorAll<HTMLInputElement>('input')[1], 'CD7654321')
    // მეორე ველი იშლება, ერთი ახალი ივსება, კიდევ ერთი ცარიელი რჩება
    await act(async () => editRows()[1].querySelector<HTMLButtonElement>('[data-testid="bookmark-field-remove"]')!.click())
    await act(async () => form().querySelector<HTMLButtonElement>('[data-testid="bookmark-field-new"]')!.click())
    await act(async () => form().querySelector<HTMLButtonElement>('[data-testid="bookmark-field-new"]')!.click())
    const added = editRows()[2].querySelectorAll<HTMLInputElement>('input')
    await type(added[0], ' ნომერი ')
    await type(added[1], 'QQ-777-QQ')
    await act(async () => editRows()[2].querySelector<HTMLButtonElement>('[role="switch"]')!.click())

    await act(async () => form().querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    await flush()

    expect(mocks.setBookmarkFields).toHaveBeenCalledWith(5, [
      { id: 1, label: 'ტექპასპორტი', value: 'CD7654321', is_secret: false },
      // წაუკითხავი ველი ცარიელი მნიშვნელობით მიდის — სერვერი შიფრს არ ეხება
      { id: 3, label: 'ძველი კოდი', value: null, is_secret: false },
      { id: undefined, label: 'ნომერი', value: 'QQ-777-QQ', is_secret: true },
    ])
    // ფანჯარა დაიხურა და სია პასუხით განახლდა — ხელახალი მოთხოვნის გარეშე
    expect(document.querySelector('[data-testid="bookmark-fields-form"]')).toBeNull()
    expect(rows().map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('ნომერი')]))
    expect(mocks.fetchBookmarkFields).toHaveBeenCalledTimes(1)
  })

  it('an empty bookmark shows an empty state with "add a field" and the editor stops at the limit', async () => {
    await mount([])

    expect(document.body.textContent).toContain(i18n.t('bookmarks.fields.empty'))
    expect(document.querySelector('[data-testid="bookmark-fields-edit"]')).toBeNull()

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="bookmark-fields-add"]')!.click())
    await flush()

    const add = () => document.querySelector<HTMLButtonElement>('[data-testid="bookmark-field-new"]')!
    // ცარიელ სიაზე რედაქტორი ერთი ცარიელი რიგით იხსნება
    expect(document.querySelectorAll('[data-testid="bookmark-field-row"]')).toHaveLength(1)
    for (let i = 0; i < 19; i++) await act(async () => add().click())

    expect(document.querySelectorAll('[data-testid="bookmark-field-row"]')).toHaveLength(20)
    expect(add().disabled).toBe(true)
  })
})

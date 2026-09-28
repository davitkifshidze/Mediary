import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ImportPlan } from '@/api/import'
import i18n from '@/i18n'

/* ============================================================
   **„ექსპორტ & იმპორტი"** (Tasks §31).

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს:
   · ჩანართი URL-იდან იკითხება და უცნობი მნიშვნელობა ექსპორტზე ბრუნდება;
   · ფორმატი ბარათზეა — ღილაკი **ამ** მოდულს და **ამ** ფორმატს აგზავნის,
     ცარიელ მოდულზე კი გამორთულია;
   · ZIP ბარათი ატვირთვების ბიბლიოთეკას `all`-ით ითხოვს;
   · **წყაროს ბარათი მიმართულებაა და არა ბრძანება**: არჩეული ბარათი
     გეგმას ძალით არ ეგზავნება (Letterboxd-ის ფაილი IMDb-ის რუკით
     წაიკითხებოდა და ყველა რიგი „გაუმართავი" გამოვიდოდა), ამოცნობის შემდეგ
     ბარათი ამოცნობილზე გადადის და სხვაობა ხმამაღლა ითქმება;
   · ჩანართის გადართვა არჩეულ ფაილს არ კარგავს.
   ============================================================ */

const api = vi.hoisted(() => ({
  downloadExport: vi.fn(async () => {}),
  downloadStorageFiles: vi.fn(async () => {}),
  planImport: vi.fn(),
}))

vi.mock('@/api/export', async (original) => ({
  ...(await original<typeof import('@/api/export')>()),
  fetchExportModules: vi.fn(async () => ({
    data: [
      { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#6366f1', count: 3, fields: 20 },
      // ⚠️ ცარიელი — მისი ფაილი მხოლოდ სათაურების რიგი იქნებოდა
      { key: 'book', name_ka: 'წიგნები', name_en: 'Books', icon: 'BookOpen', color: '#f59e0b', count: 0, fields: 18 },
    ],
    formats: ['json', 'csv'],
  })),
  downloadExport: api.downloadExport,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchStorageFiles: vi.fn(async () => ({ files: [], total: 5, bytes: 2048, modules: {} })),
  downloadStorageFiles: api.downloadStorageFiles,
}))

vi.mock('@/api/import', async (original) => ({
  ...(await original<typeof import('@/api/import')>()),
  fetchImportSources: vi.fn(async () => ({
    data: [
      { key: 'letterboxd', label: 'Letterboxd', module: 'movie', columns: ['title'] },
      { key: 'imdb', label: 'IMDb', module: 'movie', columns: ['imdb_id'] },
      { key: 'goodreads', label: 'Goodreads', module: 'book', columns: ['isbn'] },
      { key: 'steam', label: 'Steam', module: 'game', columns: ['external_id'] },
    ],
    max_rows: 5000,
  })),
  planImport: api.planImport,
}))

/* ⚠️ ერთი და იგივე ობიექტი ყოველ გამოძახებაზე (CLAUDE.md-ის წესი):
   ახალი ობიექტი ყოველ რენდერზე ეფექტებს უსასრულოდ აბრუნებდა */
const modules = vi.hoisted(() => {
  const all = [
    { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies' },
    { key: 'book', name_ka: 'წიგნები', name_en: 'Books' },
    { key: 'game', name_ka: 'თამაშები', name_en: 'Games' },
  ]
  // თამაშები გამორთულია — Steam-ის ბარათი უნდა ამბობდეს
  return { all, enabled: all.slice(0, 2), has: (key: string) => key === 'movie' || key === 'book' }
})
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  api.downloadExport.mockClear()
  api.downloadStorageFiles.mockClear()
  api.planImport.mockReset()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(url = '/transfer') {
  const { TransferPage } = await import('@/pages/TransferPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [url] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(TransferPage))),
      ),
    ),
  )
  await flush()
}

/** ჭრილის ბარათი (`ScopeCard`-ის `aria-pressed`) წარწერით */
const card = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) =>
    b.textContent?.includes(text),
  )

const button = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)

async function click(el: HTMLElement | undefined) {
  expect(el).toBeTruthy()
  await act(async () => el!.click())
  await flush()
}

async function chooseFile(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await flush()
}

const plan = (source: string): ImportPlan => ({
  source,
  module: 'movie',
  headers: ['Name', 'Year'],
  mapping: { title: 'Name', year: 'Year' },
  items: [
    {
      line: 2, title: 'Alien', year: 1979, imdb_id: null, isbn: null, author: null,
      external_id: null, rating: null, status: 'done', done_at: null, state: 'new',
    },
  ],
  counts: { new: 1, duplicate: 0, invalid: 0 },
  total: 1,
  truncated: false,
})

describe('TransferPage', () => {
  it('opens on export, reads the tab from the URL and falls back on an unknown one', async () => {
    await mount()
    expect(card(i18n.t('transfer.tabExport'))?.getAttribute('aria-pressed')).toBe('true')
    expect(document.body.textContent).toContain(i18n.t('transfer.zipTitle'))

    act(() => root!.unmount())
    container!.remove()
    await mount('/transfer?tab=import')
    expect(card(i18n.t('transfer.tabImport'))?.getAttribute('aria-pressed')).toBe('true')

    act(() => root!.unmount())
    container!.remove()
    await mount('/transfer?tab=nonsense')
    expect(card(i18n.t('transfer.tabExport'))?.getAttribute('aria-pressed')).toBe('true')
  })

  it('downloads the card’s own module and format, and never an empty module', async () => {
    await mount()

    const movie = [...document.querySelectorAll('li')].find((li) => li.textContent?.includes('ფილმები'))!
    await click(button('CSV', movie))
    expect(api.downloadExport).toHaveBeenCalledWith('movie', 'csv')

    await click(button('JSON', movie))
    expect(api.downloadExport).toHaveBeenLastCalledWith('movie', 'json')

    const book = [...document.querySelectorAll('li')].find((li) => li.textContent?.includes('წიგნები'))!
    expect(book.textContent).toContain(i18n.t('transfer.noRecords'))
    expect(button('CSV', book)?.disabled).toBe(true)
    expect(button('JSON', book)?.disabled).toBe(true)
  })

  it('packs every uploaded file into the ZIP', async () => {
    await mount()

    const zip = [...document.querySelectorAll('li')].find((li) => li.textContent?.includes(i18n.t('transfer.zipTitle')))!
    expect(zip.textContent).toContain('5')
    await click(button('ZIP', zip))

    expect(api.downloadStorageFiles).toHaveBeenCalledWith({ all: true })
  })

  it('treats the chosen source as guidance, not as a forced format', async () => {
    api.planImport.mockResolvedValue(plan('letterboxd'))
    await mount('/transfer?tab=import')

    await click(card('IMDb'))
    expect(document.body.textContent).toContain(i18n.t('transfer.howTitle', { source: 'IMDb' }))

    const file = new File(['Name,Year\nAlien,1979'], 'watched.csv', { type: 'text/csv' })
    await chooseFile(file)
    await click(button(i18n.t('import.read')))

    // ⚠️ ბარათი ძალით არ მიდის — სერვერი ფაილს სვეტებით ცნობს
    expect(api.planImport).toHaveBeenCalledWith(file, undefined)
    expect(document.body.textContent).toContain(
      i18n.t('transfer.detectedOther', { detected: 'Letterboxd', chosen: 'IMDb' }),
    )
    // ამოცნობილი ბარათი მოინიშნა, თქმული კი — აღარ
    expect(card('Letterboxd')?.getAttribute('aria-pressed')).toBe('true')
    expect(card('IMDb')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('forces the source only when the format was not recognised and you pick it', async () => {
    const unknown = Object.assign(new Error('422'), {
      isAxiosError: true,
      response: { status: 422, data: { message: 'import_source_unknown', headers: ['Foo', 'Bar'] } },
    })
    api.planImport.mockRejectedValueOnce(unknown).mockResolvedValueOnce(plan('imdb'))
    await mount('/transfer?tab=import')

    const file = new File(['Foo,Bar'], 'mystery.csv', { type: 'text/csv' })
    await chooseFile(file)
    await click(button(i18n.t('import.read')))

    expect(document.body.textContent).toContain('Foo · Bar')
    await click(button(i18n.t('transfer.readAs', { source: 'IMDb' })))

    expect(api.planImport).toHaveBeenLastCalledWith(file, 'imdb')
    // ⚠️ ცხადად არჩეულზე „სხვა აღმოჩნდა" არ ითქმება — შენ თვითონ თქვი
    expect(document.body.textContent).not.toContain(
      i18n.t('transfer.detectedOther', { detected: 'IMDb', chosen: 'IMDb' }),
    )
    expect(card('IMDb')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('says why a source is unavailable when its module is off', async () => {
    await mount('/transfer?tab=import')

    const steam = card('Steam')!
    expect(steam.disabled).toBe(true)
    expect(steam.textContent).toContain(i18n.t('transfer.moduleOff', { module: 'თამაშები' }))
  })

  it('keeps the chosen file when switching tabs', async () => {
    await mount('/transfer?tab=import')
    await chooseFile(new File(['x'], 'ratings.csv', { type: 'text/csv' }))
    const input = () => document.querySelector<HTMLInputElement>('input[type="file"]')!

    await click(card(i18n.t('transfer.tabExport')))
    // იმპორტი დამალულია და არა მოხსნილი
    expect(input().closest('[hidden]')).not.toBeNull()

    await click(card(i18n.t('transfer.tabImport')))
    expect(input().closest('[hidden]')).toBeNull()
    expect(document.body.textContent).toContain('ratings.csv')
  })
})

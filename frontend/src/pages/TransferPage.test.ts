import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ImportPlan } from '@/api/import'
import i18n from '@/i18n'

/* ============================================================
   **„ექსპორტ & იმპორტი"**.

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს:
   · ჩანართი URL-იდან იკითხება და უცნობი მნიშვნელობა ექსპორტზე ბრუნდება;
   · ფორმატი ბარათზეა — ღილაკი **ამ** მოდულს და **ამ** ფორმატს აგზავნის,
     ცარიელ მოდულზე კი გამორთულია;
   · ZIP ბარათი ატვირთვების ბიბლიოთეკას `all`-ით ითხოვს; „ჩემი სრული ექსპორტი"
    ფაილებით ან მათ გარეშე;
   · იმპორტი მხოლოდ Mediary-ის ფაილიდან: გეგმა თითო მოდულზე ამბობს
     „დაემატება · გამოტოვდება · ვერ ჩაიწერება", შეუძლებელი მოდული მიზეზით ჩანს
     და რიგში არ მიდის; CSV-ის ორაზროვნებაზე „წაიკითხე, როგორც …";
   · ჩანართის გადართვა არჩეულ ფაილს არ კარგავს.
   ============================================================ */

const api = vi.hoisted(() => ({
  downloadExport: vi.fn(async () => {}),
  downloadArchive: vi.fn(async () => {}),
  downloadStorageFiles: vi.fn(async () => {}),
  planImport: vi.fn(),
  enqueueImport: vi.fn(),
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
  downloadArchive: api.downloadArchive,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchStorageFiles: vi.fn(async () => ({ files: [], total: 5, bytes: 2048, modules: {} })),
  downloadStorageFiles: api.downloadStorageFiles,
}))

vi.mock('@/api/import', async (original) => ({
  ...(await original<typeof import('@/api/import')>()),
  fetchImportSources: vi.fn(async () => ({
    data: [{ key: 'mediary', label: 'Mediary', formats: ['json', 'csv', 'zip'] }],
    max_rows: 20000,
    limits: { file: 25600, archive: 1048576 },
  })),
  planImport: api.planImport,
  discardImport: vi.fn(async () => {}),
}))

/* რიგი — ერთი და იგივე ობიექტი ყოველ გამოძახებაზე (CLAUDE.md-ის წესი) */
const queue = vi.hoisted(() => ({ value: { enqueueImport: (() => {}) as unknown, isBusy: false } }))
vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => queue.value,
}))

/* ⚠️ ერთი და იგივე ობიექტი ყოველ გამოძახებაზე (CLAUDE.md-ის წესი):
   ახალი ობიექტი ყოველ რენდერზე ეფექტებს უსასრულოდ აბრუნებდა */
const modules = vi.hoisted(() => {
  const all = [
    { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies' },
    { key: 'book', name_ka: 'წიგნები', name_en: 'Books' },
    { key: 'series', name_ka: 'სერიალები', name_en: 'Series' },
    { key: 'anime', name_ka: 'ანიმე', name_en: 'Anime' },
  ]
  return { all, enabled: all, has: () => true }
})
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => modules,
}))

/* „ბაზის" ჩანართი მხოლოდ სუპერადმინს; ერთი და იგივე ობიექტი ყოველ გამოძახებაზე */
const auth = vi.hoisted(() => ({ value: { isAdmin: false, user: { id: 1 } } as Record<string, unknown> }))
vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => auth.value,
}))

vi.mock('@/api/database', async (original) => ({
  ...(await original<typeof import('@/api/database')>()),
  fetchDatabaseTables: vi.fn(async () => ({ data: [], modules: [], sql_available: true })),
}))

vi.mock('@/api/backups', async (original) => ({
  ...(await original<typeof import('@/api/backups')>()),
  fetchBackups: vi.fn(async () => ({
    data: [],
    meta: { database: 'mediary', available: true, driver: 'mysql', auto: { enabled: true, at: '03:00', keep: 7, last_at: null } },
  })),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  auth.value = { isAdmin: false, user: { id: 1 } }
  api.downloadExport.mockClear()
  api.downloadArchive.mockClear()
  api.downloadStorageFiles.mockClear()
  api.planImport.mockReset()
  api.enqueueImport.mockClear()
  queue.value = { enqueueImport: api.enqueueImport, isBusy: false }
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

/** გადამისამართების სამიზნე — სად აღმოვჩნდით */
function Where() {
  return h('p', { 'data-testid': 'where' }, useLocation().pathname)
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
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(
              Routes,
              null,
              h(Route, { path: '/transfer', element: h(TransferPage) }),
              h(Route, { path: '/share-links', element: h(Where) }),
            ),
          ),
        ),
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

/** სრული ექსპორტის გეგმა: ფილმები (2 ახალი, 1 უკვე მაქვს) და გამორთული წიგნები */
const plan = (): ImportPlan => ({
  token: 'a'.repeat(40),
  kind: 'zip',
  name: 'mediary-all.zip',
  files: 3,
  truncated: false,
  max_rows: 20000,
  modules: [
    {
      source: 'movie',
      module: 'movie',
      reason: null,
      name_ka: null,
      name_en: null,
      total: 3,
      counts: { new: 2, duplicate: 1, invalid: 0 },
      items: [
        { index: 0, title: 'Alien', year: 1979, state: 'new', reason: null },
        { index: 1, title: 'Heat', year: 1995, state: 'duplicate', reason: 'exists' },
        { index: 2, title: 'Ran', year: 1985, state: 'new', reason: null },
      ],
    },
    {
      source: 'book',
      module: 'book',
      reason: 'module_disabled',
      name_ka: null,
      name_en: null,
      total: 1,
      counts: { new: 0, duplicate: 0, invalid: 0 },
      items: [],
    },
  ],
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

  /* „გაზიარება" აქ მესამე ჩანართი იყო; ახლა თავისი განყოფილებაა.
     ⚠️ შენახული ძველი ბმული ექსპორტზე ჩუმად არ უნდა ჩამოვარდეს */
  it('has no share tab any more and sends the old share tab to its own section', async () => {
    await mount('/transfer')
    expect(card('გაზიარება')).toBeUndefined()

    act(() => root?.unmount())
    container?.remove()

    await mount('/transfer?tab=share')
    expect(document.querySelector('[data-testid="where"]')?.textContent).toBe('/share-links')
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

  /* ყველა მოდული ერთ ZIP-ში; ფაილები — შენი არჩევანით */
  it('downloads my full export with or without its files', async () => {
    await mount()

    const archive = document.querySelector<HTMLElement>('[data-testid="export-archive"]')!
    expect(archive.textContent).toContain(i18n.t('transfer.archive.count', { records: 3, modules: 2 }))
    await click(button('ZIP', archive))
    expect(api.downloadArchive).toHaveBeenLastCalledWith(true)

    await click(archive.querySelector<HTMLButtonElement>('button[role="checkbox"]')!)
    await click(button('ZIP', archive))
    expect(api.downloadArchive).toHaveBeenLastCalledWith(false)
  })

  /* გეგმა თითო მოდულზე; შეუძლებელი მოდული მიზეზით და რიგის გარეშე */
  it('plans a Mediary file per module and queues only what is new', async () => {
    api.planImport.mockResolvedValue(plan())
    await mount('/transfer?tab=import')

    const file = new File(['PK'], 'mediary-all.zip', { type: 'application/zip' })
    await chooseFile(file)
    await click(button(i18n.t('import.read')))

    expect(api.planImport).toHaveBeenCalledWith(file, undefined)
    expect(document.body.textContent).toContain(i18n.t('import.summary', { new: 2, duplicate: 1, invalid: 0 }))
    expect(document.body.textContent).toContain(i18n.t('import.archiveFiles', { count: 3 }))

    const book = document.querySelector<HTMLElement>('li[data-module="book"]')!
    expect(book.textContent).toContain(i18n.t('import.reason.module_disabled', { name: 'წიგნები' }))
    expect(book.querySelector<HTMLButtonElement>('button[role="checkbox"]')!.disabled).toBe(true)

    // ფილმის რიგები ჩანს — მიზეზით
    expect(document.querySelector('[data-testid="import-rows"]')?.textContent).toContain('Heat')

    await click(button(i18n.t('import.run', { count: 2 })))
    expect(api.enqueueImport).toHaveBeenCalledTimes(1)
    const [token, source, module, items] = api.enqueueImport.mock.calls[0] as [string, string, string, { index: number }[]]
    expect([token, source, module]).toEqual(['a'.repeat(40), 'movie', 'movie'])
    expect(items.map((i) => i.index)).toEqual([0, 2])
  })

  it('asks which module when a CSV fits more than one', async () => {
    const ambiguous = Object.assign(new Error('422'), {
      isAxiosError: true,
      response: { status: 422, data: { message: 'import_module_ambiguous', modules: ['series', 'anime'] } },
    })
    api.planImport.mockRejectedValueOnce(ambiguous).mockResolvedValueOnce(plan())
    await mount('/transfer?tab=import')

    const file = new File(['id,title_ka'], 'shows.csv', { type: 'text/csv' })
    await chooseFile(file)
    await click(button(i18n.t('import.read')))

    expect(document.querySelector('[data-testid="import-ambiguous"]')).not.toBeNull()
    await click(button(i18n.t('import.readAs', { module: 'ანიმე' })))

    expect(api.planImport).toHaveBeenLastCalledWith(file, 'anime')
    expect(document.querySelector('[data-testid="import-ambiguous"]')).toBeNull()
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

describe('TransferPage — the database tab', () => {
  it('shows the database tab, with the backups, only to the super admin', async () => {
    await mount('/transfer?tab=database')
    // ჩვეულებრივ ანგარიშზე ჩანართი არ არის და მისამართი ექსპორტზე ბრუნდება
    expect(card(i18n.t('transfer.tabDatabase'))).toBeUndefined()
    expect(card(i18n.t('transfer.tabExport'))?.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('[data-testid="backups-panel"]')).toBeNull()
    act(() => root?.unmount())
    container?.remove()

    auth.value = { isAdmin: true, user: { id: 1, is_super_admin: true } }
    await mount('/transfer?tab=database')
    await flush()
    expect(card(i18n.t('transfer.tabDatabase'))?.getAttribute('aria-pressed')).toBe('true')
    const panel = document.querySelector<HTMLElement>('[data-testid="backups-panel"]')!
    expect(panel.closest('[hidden]')).toBeNull()
    expect(panel.textContent).toContain(i18n.t('backups.create'))
  })
})

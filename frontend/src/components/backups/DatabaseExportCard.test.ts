import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **მთლიანი ბაზის ექსპორტი**.

   ⚠️ მოწმდება: ჯგუფები მოდულის სახელით · საერთო · სისტემა; ცხრილის მონიშვნა
   საჭიროებებსაც ნიშნავს და ამას ამბობს; საჭირო ცხრილის მოხსნა გაფრთხილებას
   იძლევა (და არ იბლოკება); საიდუმლო ცხრილი აღნიშნულია; ჩამოტვირთვა ზუსტად
   მონიშნულს და არჩეულ ფორმატს აგზავნის; `mysqldump`-ის გარეშე SQL გამორთულია.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchDatabaseTables: vi.fn(),
  downloadDatabase: vi.fn(async () => {}),
  modules: { all: [{ key: 'movie', name_ka: 'ფილმები', name_en: 'Movies' }] },
}))

vi.mock('@/api/database', async (original) => ({
  ...(await original<typeof import('@/api/database')>()),
  fetchDatabaseTables: mocks.fetchDatabaseTables,
  downloadDatabase: mocks.downloadDatabase,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
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

const row = (table: string, owner: string, requires: string[] = [], extra: Record<string, unknown> = {}) => ({
  table,
  owner,
  rows: 3,
  bytes: 2048,
  sensitive: false,
  requires,
  ...extra,
})

async function mount(sqlAvailable = true) {
  mocks.fetchDatabaseTables.mockResolvedValue({
    data: [
      row('movies', 'movie', ['movie_translations', 'genreables']),
      row('movie_translations', 'movie', ['movies', 'genreables']),
      row('genreables', 'shared:genres'),
      row('users', 'system', [], { sensitive: true }),
    ],
    modules: ['movie', 'series'],
    sql_available: sqlAvailable,
  })
  const { DatabaseExportCard } = await import('@/components/backups/DatabaseExportCard')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(DatabaseExportCard)))))
  await flush()
  return container
}

const box = (el: HTMLElement, label: string) => el.querySelector<HTMLButtonElement>(`button[role="checkbox"][aria-label="${label}"]`)!
const checked = (el: HTMLElement, label: string) => box(el, label).getAttribute('aria-checked') === 'true'

describe('DatabaseExportCard', () => {
  it('groups the tables and ticks what a table needs along with it', async () => {
    const el = await mount()

    const owners = [...el.querySelectorAll<HTMLElement>('fieldset')].map((f) => f.dataset.owner)
    expect(owners).toEqual(['movie', 'shared:genres', 'system'])
    expect(el.textContent).toContain('ფილმები')
    expect(el.textContent).toContain(i18n.t('transfer.db.shared.genres'))
    expect(el.textContent).toContain(i18n.t('transfer.db.sensitive'))

    await act(async () => box(el, 'movies').click())
    expect(checked(el, 'movies')).toBe(true)
    expect(checked(el, 'movie_translations')).toBe(true)
    expect(checked(el, 'genreables')).toBe(true)
    expect(checked(el, 'users')).toBe(false)
    expect(el.querySelector('[data-testid="database-added"]')?.textContent).toBe(
      i18n.t('transfer.db.autoAdded', { tables: 'movie_translations, genreables' }),
    )

    // საჭიროს მოხსნა — დაშვებულია, მაგრამ გაფრთხილებით
    await act(async () => box(el, 'genreables').click())
    expect(checked(el, 'genreables')).toBe(false)
    expect(el.querySelector('[data-testid="database-warning"]')?.textContent).toContain('movies')
  })

  it('downloads exactly the ticked tables in the chosen format; SQL needs mysqldump', async () => {
    const el = await mount(false)

    await act(async () => box(el, 'users').click())
    const download = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(i18n.t('transfer.db.download', { count: 1 })),
    )!
    await act(async () => download.click())
    await flush()
    expect(mocks.downloadDatabase).toHaveBeenCalledWith(['users'], 'json')

    const sql = [...el.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) =>
      b.textContent?.includes(i18n.t('transfer.db.formatSql')),
    )!
    expect(sql.disabled).toBe(true)
  })
})

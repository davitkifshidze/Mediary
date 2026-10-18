import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **ცხრილების ჩანაცვლება JSON-ის ZIP-ით**.

   ⚠️ მოწმდება: აკრძალული (`users`) და ბაზაში არმყოფი ცხრილი ვერ მოინიშნება;
   მონიშვნა საჭიროებებსაც ნიშნავს და ამას ამბობს; ჩანაცვლება მხოლოდ
   აკრეფილი `REPLACE`-ით იხსნება და ზუსტად მონიშნულს აგზავნის.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  inspectDatabaseImport: vi.fn(),
  replaceDatabaseTables: vi.fn(),
  discardDatabaseImport: vi.fn(async () => {}),
}))

vi.mock('@/api/database', async (original) => ({
  ...(await original<typeof import('@/api/database')>()),
  inspectDatabaseImport: mocks.inspectDatabaseImport,
  replaceDatabaseTables: mocks.replaceDatabaseTables,
  discardDatabaseImport: mocks.discardDatabaseImport,
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

const table = (name: string, extra: Record<string, unknown> = {}) => ({
  table: name,
  rows: 2,
  exists: true,
  blocked: false,
  owner: 'video',
  requires: [] as string[],
  dropped_columns: [] as string[],
  missing_columns: [] as string[],
  ...extra,
})

async function mount() {
  mocks.inspectDatabaseImport.mockResolvedValue({
    token: 't'.repeat(40),
    created_at: null,
    driver: 'mysql',
    tables: [
      table('video_notes', { requires: ['videos'] }),
      table('videos', { requires: ['video_notes'] }),
      table('users', { owner: 'system', blocked: true }),
      table('old_table', { exists: false }),
    ],
  })
  mocks.replaceDatabaseTables.mockResolvedValue({ data: { video_notes: { deleted: 1, inserted: 2, dropped_columns: [] } }, safety_backup_id: 7 })

  const { DatabaseImportCard } = await import('@/components/backups/DatabaseImportCard')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(DatabaseImportCard)))))
  await flush()

  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  Object.defineProperty(input, 'files', { value: [new File(['PK'], 'db.zip')], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  await act(async () => button(container!, i18n.t('import.read'))!.click())
  await flush()

  return container
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)
const box = (el: HTMLElement, label: string) => el.querySelector<HTMLButtonElement>(`button[role="checkbox"][aria-label="${label}"]`)!

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DatabaseImportCard', () => {
  it('replaces exactly the ticked tables, with what they need, after REPLACE is typed', async () => {
    const el = await mount()

    expect(box(el, 'users').disabled).toBe(true)
    expect(box(el, 'old_table').disabled).toBe(true)
    expect(el.textContent).toContain(i18n.t('transfer.dbImport.missing'))

    await act(async () => box(el, 'video_notes').click())
    expect(box(el, 'videos').getAttribute('aria-checked')).toBe('true')
    expect(el.querySelector('[data-testid="database-import-added"]')?.textContent).toBe(
      i18n.t('transfer.db.autoAdded', { tables: 'videos' }),
    )

    const replace = button(el, i18n.t('transfer.dbImport.replace', { count: 2 }))!
    expect(replace.disabled).toBe(true)

    await type(el.querySelector<HTMLInputElement>('input[placeholder="REPLACE"]')!, 'REPLACE')
    expect(replace.disabled).toBe(false)

    await act(async () => replace.click())
    await flush()
    expect(mocks.replaceDatabaseTables).toHaveBeenCalledWith('t'.repeat(40), ['video_notes', 'videos'], 'REPLACE')
  })
})

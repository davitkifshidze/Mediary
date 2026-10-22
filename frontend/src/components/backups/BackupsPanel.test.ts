import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **ბაზის ასლების პანელი**.

   ⚠️ მოწმდება: რიგის ღილაკები აიქონი + ტექსტია (`h-9`) და იმავე სიიდან
   იხატება, რაც მარჯვენა კლიკის მენიუ — ჩამოტვირთვა · შიგთავსი · აღდგენა ·
   წაშლა (ბორდერიანი წაშლის ოჯახით); სტატუსი იმავე სიმაღლისაა და რიგის
   თავშია; მიმდინარე ასლზე ღილაკები გამორთულია; სია გვერდებადაა (10);
   „შენიშვნა" „დამპის აღების" გვერდითაა, დაგეგმილი ასლი — `i`-იანი ერთი ხაზი.
   ============================================================ */

const backup = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `mediary-${id}.sql.gz`,
  size: 4096,
  status: 'ready',
  stale: false,
  error: null,
  driver: 'mysql',
  tables: 40,
  note: null,
  source: 'dump',
  user: null,
  created_at: '2026-10-20 03:00:00',
  finished_at: '2026-10-20 03:01:00',
  ...extra,
})

const mocks = vi.hoisted(() => ({ fetchBackups: vi.fn() }))

vi.mock('@/api/backups', async (original) => ({
  ...(await original<typeof import('@/api/backups')>()),
  fetchBackups: mocks.fetchBackups,
}))

/* ერთი და იგივე ობიექტი ყოველ გამოძახებაზე */
const auth = vi.hoisted(() => ({ value: { isAdmin: true, user: { id: 1, is_super_admin: true } } }))
vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => auth.value,
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

async function mount(rows: ReturnType<typeof backup>[]) {
  mocks.fetchBackups.mockResolvedValue({
    data: rows,
    meta: {
      database: 'mediary',
      available: true,
      restore_available: true,
      driver: 'mysql',
      max_upload_kb: 1024,
      auto: { enabled: true, at: '03:00', keep: 7, last_at: null },
    },
  })
  const { BackupsPanel } = await import('@/components/backups/BackupsPanel')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(BackupsPanel)))))
  await flush()
  return container
}

const rowActions = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-testid="backup-actions"]')]

describe('BackupsPanel', () => {
  it('draws the row actions as h-9 buttons with text, the status in front of them', async () => {
    const el = await mount([backup(1), backup(2, { status: 'running' })])

    const [ready, running] = rowActions(el)
    const buttons = [...ready.querySelectorAll('button')]
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      i18n.t('actions.download'),
      i18n.t('backups.view'),
      i18n.t('backups.restore'),
      i18n.t('actions.delete'),
    ])
    buttons.forEach((b) => expect(b.className).toContain('h-9'))
    // წაშლა — ბორდერიანი წაშლის ოჯახი, დანარჩენი — outline
    expect(buttons[3].className).toContain('border-destructive')
    expect(buttons[0].className).not.toContain('border-destructive')

    const badge = ready.firstElementChild as HTMLElement
    expect(badge.tagName).toBe('SPAN')
    expect(badge.className).toContain('h-9')
    expect(badge.textContent).toBe(i18n.t('backups.status.ready'))

    // მიმდინარე ასლი ჯერ არც ჩამოიტვირთება და არც აღდგება — წაშლა კი შეიძლება
    const off = [...running.querySelectorAll('button')].map((b) => b.disabled)
    expect(off).toEqual([true, true, true, false])
  })

  it('pages the list by ten', async () => {
    const el = await mount(Array.from({ length: 12 }, (_, i) => backup(i + 1)))

    expect(rowActions(el)).toHaveLength(10)
    expect(el.querySelector('[data-testid="pagination"]')).not.toBeNull()
  })

  it('keeps the note beside "take a dump" and the schedule on one line with an i', async () => {
    const el = await mount([])

    const create = el.querySelector<HTMLElement>('[data-testid="backups-create"]')!
    expect(create.querySelector('label[for="backup-note"]')?.textContent).toContain(i18n.t('backups.note'))
    expect(create.textContent).toContain(i18n.t('backups.create'))

    const auto = el.querySelector<HTMLElement>('[data-testid="backups-auto"]')!
    expect(auto.textContent).toContain(i18n.t('backups.auto'))
    expect(auto.textContent).toContain(i18n.t('backups.autoOn', { at: '03:00', keep: 7 }))
    expect(auto.querySelector('button')).not.toBeNull()
    // შესავალი აბზაცად აღარ დგას — ის სათაურის i-შია
    expect(el.textContent).not.toContain(i18n.t('backups.intro'))
  })
})

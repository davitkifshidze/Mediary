import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **ურნის ვადა `/settings`-ზე** (Tasks §29, ეტაპი 6).

   ⚠️ მოწმდება ის, რასაც ტიპი ვერ ხედავს: შეუნახავ ვადაზე გვერდი სერვერს
   ეკითხება და **შენახვამდე** ამბობს, რამდენი წაიშლება მომდევნო ღამით;
   უცვლელ ვადაზე ჩუმადაა; და აკრეფა ინსტალაციის ზღვარზე იკვეცება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  dirty: { value: true },
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე — სხვაგვარად რენდერის ციკლი არ ჩერდება
  settings: { trashDays: 7 },
  fetch: vi.fn(async (days: number) => ({
    days,
    saved_days: 30,
    default_days: 30,
    max_days: 365,
    default_max_days: 365,
    max_days_ceiling: 3650,
    prune_at: '03:30',
    expiring: 3,
  })),
  // §34.1 — ზედა ზღვარს მხოლოდ სუპერადმინი ცვლის
  auth: { value: { user: null } as Record<string, unknown> },
  updateMax: vi.fn(async (days: number | null) => ({ max_days: days ?? 365, default_max_days: 365 })),
}))

vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth.value }))

vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useSettings: () => ({ settings: mocks.settings, set: mocks.set, isDirty: () => mocks.dirty.value }),
}))

vi.mock('@/api/trash', async (original) => ({
  ...(await original<typeof import('@/api/trash')>()),
  fetchTrashRetention: mocks.fetch,
  updateTrashMaxDays: mocks.updateMax,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.dirty.value = true
  mocks.settings.trashDays = 7
  mocks.auth.value = { user: null }
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { TrashRetentionSetting } = await import('@/components/TrashRetentionSetting')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(TrashRetentionSetting)))),
  )
  await flush()
}

const expiringText = () => i18n.t('settings.trashDaysExpiring', { count: 3, time: '03:30' })

describe('TrashRetentionSetting', () => {
  it('says before saving how many items the next cleanup will delete', async () => {
    await mount()

    expect(mocks.fetch).toHaveBeenCalledWith(7)
    expect(container!.textContent).toContain(expiringText())
  })

  it('stays quiet while the period is unchanged', async () => {
    mocks.dirty.value = false
    await mount()

    expect(container!.textContent).not.toContain(expiringText())
  })

  it('clamps typing to the installation cap', async () => {
    await mount()

    const input = container!.querySelector('input') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(input, '500')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(mocks.set).toHaveBeenCalledWith('trashDays', 365)
  })

  /** §34.1 — ზედა ზღვარი ყველასთვის: ხაზი და რედაქტორი მხოლოდ სუპერადმინს */
  it('lets only a super admin change the ceiling for everyone', async () => {
    await mount()
    expect(container!.textContent).not.toContain(i18n.t('settings.trashCeiling', { max: 365 }))

    act(() => root?.unmount())
    container?.remove()
    mocks.auth.value = { user: { id: 1, is_super_admin: true } }
    await mount()
    expect(container!.textContent).toContain(i18n.t('settings.trashCeiling', { max: 365 }))

    const edit = [...container!.querySelectorAll('button')].find((b) => b.textContent === i18n.t('actions.edit'))!
    await act(async () => edit.click())
    await flush()

    const input = document.body.querySelector(`input[aria-label="${i18n.t('settings.trashCeilingTitle')}"]`) as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(input, '60')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const save = [...document.body.querySelectorAll('button')].find((b) => b.textContent === i18n.t('actions.save'))!
    await act(async () => save.click())
    await flush()

    expect(mocks.updateMax).toHaveBeenCalledWith(60)
  })

  it('says so when a saved period is above the cap', async () => {
    mocks.settings.trashDays = 400
    await mount()

    expect(container!.textContent).toContain(i18n.t('settings.trashDaysCapped', { max: 365 }))
  })
})

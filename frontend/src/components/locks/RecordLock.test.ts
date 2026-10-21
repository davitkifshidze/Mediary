import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { MovieListItem } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **ჩაკეტვის ზოგადი ფანჯრები** — ერთი ფორმა ყველა ჩაკეტვადზე:
   ახალი ლოკი პაროლით და მინიშნებით, არსებულის შეცვლა დამალულზე ანგარიშის
   პაროლს ითხოვს, გახსნა ჩანაწერის მისამართზე მიდის; ბადეში დამალული ფილმი
   ბოქლომიანი ბარათია.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  putRecordLock: vi.fn(),
  unlockRecord: vi.fn(),
  relockRecord: vi.fn(),
}))

vi.mock('@/api/locks', async (original) => ({
  ...(await original<typeof import('@/api/locks')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await import('@/components/locks/RecordLock')
  await import('@/components/MovieGrid')
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

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(element: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, element))))),
  )
  await flush()
}

function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const record = (extra = {}) => ({ id: 12, name: 'Secret Diary', locked: false, unlocked: true, lock_hint: null, unlock_blocked_until: null, ...extra })

describe('RecordLockDialog', () => {
  it('puts a new lock with the password and the hint on the record address', async () => {
    mocks.putRecordLock.mockResolvedValue({})
    const onChanged = vi.fn()
    const { RecordLockDialog } = await import('@/components/locks/RecordLock')
    await render(h(RecordLockDialog, { base: '/media/movie/12', record: record(), onChanged, onClose: () => {}, hint: 'hint' }))

    // ველები სრულ სიგანეზეა და არა 12-სვეტიანი ბადის უჯრაში — ბადეში ისინი ერთმანეთზე გადადიოდა
    expect(document.querySelector('#record-lock-form .grid-cols-12')).toBeNull()
    expect(document.getElementById('record-lock-password')!.closest('form')!.querySelector('.space-y-4')).toBeTruthy()

    type('record-lock-password', 'secret1')
    type('record-lock-repeat', 'secret1')
    type('record-lock-hint', 'ზღვა')
    await act(async () => (document.getElementById('record-lock-form') as HTMLFormElement).requestSubmit())
    await flush()

    expect(mocks.putRecordLock).toHaveBeenCalledWith('/media/movie/12', { password: 'secret1', hint: 'ზღვა' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('asks for the account password before removing a lock the session has not opened', async () => {
    mocks.putRecordLock.mockResolvedValue({})
    const { RecordLockDialog } = await import('@/components/locks/RecordLock')
    await render(
      h(RecordLockDialog, { base: '/media/movie/12', record: record({ locked: true, unlocked: false }), onChanged: () => {}, onClose: () => {}, hint: 'hint' }),
    )

    expect(document.getElementById('record-lock-current')).toBeTruthy()

    await act(async () => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('lock.remove')))!.click())
    type('record-lock-current', 'account-pass')
    await act(async () => (document.getElementById('record-lock-form') as HTMLFormElement).requestSubmit())
    await flush()

    expect(mocks.putRecordLock).toHaveBeenCalledWith('/media/movie/12', { remove: true, account_password: 'account-pass' })
  })
})

describe('RecordUnlockDialog', () => {
  it('shows the hint and unlocks on the record address', async () => {
    mocks.unlockRecord.mockResolvedValue({})
    const onChanged = vi.fn()
    const { RecordUnlockDialog } = await import('@/components/locks/RecordLock')
    await render(
      h(RecordUnlockDialog, { base: '/media/series/3', record: record({ locked: true, unlocked: false, lock_hint: 'ზღვა' }), onChanged, onClose: () => {} }),
    )

    expect(document.body.textContent).toContain(i18n.t('lock.hintShown', { hint: 'ზღვა' }))
    expect(document.querySelector('#record-unlock-form .grid-cols-12')).toBeNull()

    type('record-unlock', 'secret1')
    await act(async () => (document.getElementById('record-unlock-form') as HTMLFormElement).requestSubmit())
    await flush()

    expect(mocks.unlockRecord).toHaveBeenCalledWith('/media/series/3', 'secret1')
    expect(onChanged).toHaveBeenCalled()
  })
})

describe('MovieGrid with a hidden record', () => {
  it('draws a padlock card that opens the unlock dialog instead of the record', async () => {
    const hidden = { id: 7, title_ka: null, title_en: 'Secret Diary', hidden: true, locked: true, unlocked: false, lock_hint: null } as unknown as MovieListItem
    const { MovieGrid } = await import('@/components/MovieGrid')
    await render(h(MovieGrid, { movies: [hidden], type: 'movie' }))

    const card = container!.querySelector('[data-testid="media-locked-card"]') as HTMLButtonElement
    expect(card.textContent).toContain('Secret Diary')
    expect(container!.querySelector('img')).toBeNull()

    await act(async () => card.click())
    await flush()

    expect(document.getElementById('record-unlock')).toBeTruthy()
  })
})

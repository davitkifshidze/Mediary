import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

/* ============================================================
   **ჟურნალის სიგნალები SPA-დან**.

   ⚠️ რა მოწმდება: გამორთულ ტიპზე ქსელში **არაფერი** მიდის; ჩართულზე დაჭერები
   რიგში გროვდება და ~5 წამში ერთ პაკეტად იგზავნება (წარწერით, როლით, გვერდით);
   ველზე (input) დაჭერა არ იწერება და მნიშვნელობა არსად ჩანს; ჩანაწერის გახსნა
   მხოლოდ ჩართულ `open`-ზე იგზავნება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  sendAuditEvents: vi.fn(),
  recordOpen: vi.fn(),
  recordVisit: vi.fn(),
  kinds: [] as string[],
}))

vi.mock('@/api/audit', async (original) => ({
  ...(await original<typeof import('@/api/audit')>()),
  sendAuditEvents: mocks.sendAuditEvents,
  recordOpen: mocks.recordOpen,
  recordVisit: mocks.recordVisit,
}))

vi.mock('@/lib/auth', () => {
  // ⚠️ იგივე ობიექტი ყოველ გამოძახებაზე (CLAUDE.md-ის წესი)
  const auth = { get user() { return { audit_kinds: mocks.kinds } } }
  return { useAuth: () => auth }
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.kinds = []
  vi.clearAllMocks()
  vi.useRealTimers()
})

async function mount(children: (lib: typeof import('@/lib/audit')) => ReturnType<typeof h>) {
  const lib = await import('@/lib/audit')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(MemoryRouter, { initialEntries: ['/books'] }, children(lib))))
  return container
}

function Events({ lib }: { lib: typeof import('@/lib/audit') }) {
  lib.useAuditEvents()
  return h('div', null, [
    h('button', { key: 'b', type: 'button', 'data-testid': 'save' }, h('span', null, 'შენახვა')),
    h('a', { key: 'a', href: '/movies', 'aria-label': 'ფილმები', 'data-testid': 'link', onClick: (e: Event) => e.preventDefault() }, 'x'),
    h('input', { key: 'i', 'data-testid': 'field', defaultValue: 'hunter2' }),
    h('div', { key: 't', role: 'tab', 'data-testid': 'tab' }, 'გახსნები'),
  ])
}

describe('useAuditEvents', () => {
  it('sends nothing when clicks are off', async () => {
    const el = await mount((lib) => h(Events, { lib }))

    act(() => (el.querySelector('[data-testid="save"]') as HTMLElement).click())
    act(() => vi.advanceTimersByTime(6000))

    expect(mocks.sendAuditEvents).not.toHaveBeenCalled()
  })

  it('collects clicks on interactive elements and sends them as one batch', async () => {
    mocks.kinds = ['click']
    const el = await mount((lib) => h(Events, { lib }))

    act(() => (el.querySelector('[data-testid="save"] span') as HTMLElement).click())
    act(() => (el.querySelector('[data-testid="link"]') as HTMLElement).click())
    act(() => (el.querySelector('[data-testid="tab"]') as HTMLElement).click())
    // ველი ინტერაქტიული ელემენტების სიაში არ არის — მისი დაჭერა (და მნიშვნელობა) არ იწერება
    act(() => (el.querySelector('[data-testid="field"]') as HTMLElement).click())

    expect(mocks.sendAuditEvents).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(5000))

    expect(mocks.sendAuditEvents).toHaveBeenCalledTimes(1)
    const [batch] = mocks.sendAuditEvents.mock.calls[0]
    expect(batch).toEqual([
      { action: 'click', path: '/books', label: 'შენახვა', role: 'button' },
      { action: 'click', path: '/books', label: 'ფილმები', role: 'link' },
      { action: 'click', path: '/books', label: 'გახსნები', role: 'tab' },
    ])
    expect(JSON.stringify(batch)).not.toContain('hunter2')
  })

  it('flushes on pagehide with keepalive', async () => {
    mocks.kinds = ['click']
    const el = await mount((lib) => h(Events, { lib }))

    act(() => (el.querySelector('[data-testid="save"]') as HTMLElement).click())
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(mocks.sendAuditEvents).toHaveBeenCalledWith([expect.objectContaining({ label: 'შენახვა' })], true)
  })
})

describe('useRecordOpen', () => {
  function Open({ lib, id }: { lib: typeof import('@/lib/audit'); id: number }) {
    lib.useRecordOpen('book', id)
    return null
  }

  it('records an open only while the kind is on', async () => {
    await mount((lib) => h(Open, { lib, id: 5 }))
    expect(mocks.recordOpen).not.toHaveBeenCalled()

    act(() => root?.unmount())
    container?.remove()

    mocks.kinds = ['open']
    await mount((lib) => h(Open, { lib, id: 5 }))
    expect(mocks.recordOpen).toHaveBeenCalledWith('book', 5)
  })
})

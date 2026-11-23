import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

/* ============================================================
   **ჟურნალის სიგნალები SPA-დან**.

   ⚠️ რა მოწმდება: გამორთულ ტიპზე ქსელში **არაფერი** მიდის; ჩართულზე დაჭერები
   რიგში გროვდება და ~5 წამში ერთ პაკეტად იგზავნება (წარწერით, როლით, გვერდით);
   ველზე (input) დაჭერა არ იწერება და მნიშვნელობა არსად ჩანს; ჩანაწერის გახსნა
   მხოლოდ ჩართულ `open`-ზე იგზავნება; მოდულის წესი (`audit_paths`) პასუხს
   მხოლოდ თავის მისამართებზე ცვლის — ორივე მიმართულებით.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  sendAuditEvents: vi.fn(),
  recordOpen: vi.fn(),
  recordVisit: vi.fn(),
  kinds: [] as string[],
  paths: {} as Record<string, Record<string, boolean>>,
}))

vi.mock('@/api/audit', async (original) => ({
  ...(await original<typeof import('@/api/audit')>()),
  sendAuditEvents: mocks.sendAuditEvents,
  recordOpen: mocks.recordOpen,
  recordVisit: mocks.recordVisit,
}))

vi.mock('@/lib/auth', () => {
  // ⚠️ იგივე ობიექტი ყოველ გამოძახებაზე (CLAUDE.md-ის წესი)
  const auth = { get user() { return { audit_kinds: mocks.kinds, audit_paths: mocks.paths } } }
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
  mocks.paths = {}
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

/** ჩატის სიის მსგავსი რიგები: ტექსტი წერილია, სახელი — `aria-label` */
function ContentRows({ lib }: { lib: typeof import('@/lib/audit') }) {
  lib.useAuditEvents()
  return h('ul', null, [
    h('li', { key: 'n' }, h('a', { href: '/chat/1', 'aria-label': 'ნინო', 'data-audit-content': '', 'data-testid': 'named', onClick: (e: Event) => e.preventDefault() }, 'პაროლი არის 1234')),
    h('li', { key: 'b', 'data-audit-content': '' }, h('button', { type: 'button', 'data-testid': 'bare' }, 'საიდუმლო წერილი')),
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

  it('sends no text of a content row — only its aria-label', async () => {
    mocks.kinds = ['click']
    const box = await mount((lib) => h(ContentRows, { lib }))

    act(() => (box.querySelector('[data-testid="named"]') as HTMLElement).click())
    act(() => (box.querySelector('[data-testid="bare"]') as HTMLElement).click())
    act(() => vi.advanceTimersByTime(5000))

    const [batch] = mocks.sendAuditEvents.mock.calls[0]
    expect(batch).toEqual([
      { action: 'click', path: '/books', label: 'ნინო', role: 'link' },
      { action: 'click', path: '/books', label: null, role: 'button' },
    ])
  })

  it('flushes on pagehide with keepalive', async () => {
    mocks.kinds = ['click']
    const el = await mount((lib) => h(Events, { lib }))

    act(() => (el.querySelector('[data-testid="save"]') as HTMLElement).click())
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(mocks.sendAuditEvents).toHaveBeenCalledWith([expect.objectContaining({ label: 'შენახვა' })], true)
  })

  it('keeps quiet on the pages of a module whose clicks are off', async () => {
    mocks.kinds = ['click']
    mocks.paths = { click: { books: false } }
    const el = await mount((lib) => h(Events, { lib }))

    act(() => (el.querySelector('[data-testid="save"]') as HTMLElement).click())
    act(() => vi.advanceTimersByTime(6000))

    expect(mocks.sendAuditEvents).not.toHaveBeenCalled()
  })

  it('sends clicks from the one module where they are on', async () => {
    mocks.paths = { click: { books: true } }
    const el = await mount((lib) => h(Events, { lib }))

    act(() => (el.querySelector('[data-testid="save"]') as HTMLElement).click())
    act(() => vi.advanceTimersByTime(5000))

    expect(mocks.sendAuditEvents).toHaveBeenCalledTimes(1)
    expect(mocks.sendAuditEvents.mock.calls[0][0]).toEqual([{ action: 'click', path: '/books', label: 'შენახვა', role: 'button' }])
  })
})

describe('useVisitTracker', () => {
  function Visit({ lib }: { lib: typeof import('@/lib/audit') }) {
    lib.useVisitTracker()
    return null
  }

  it('records the page unless its module has visits off', async () => {
    mocks.kinds = ['visit']
    mocks.paths = { visit: { books: false } }
    await mount((lib) => h(Visit, { lib }))
    expect(mocks.recordVisit).not.toHaveBeenCalled()

    act(() => root?.unmount())
    container?.remove()

    mocks.paths = { visit: { movies: false } }
    await mount((lib) => h(Visit, { lib }))
    expect(mocks.recordVisit).toHaveBeenCalledWith('/books')
  })

  it('records the page of the one module where visits are on', async () => {
    mocks.paths = { visit: { books: true } }
    await mount((lib) => h(Visit, { lib }))

    expect(mocks.recordVisit).toHaveBeenCalledWith('/books')
  })
})

describe('pathSegment', () => {
  it('is the first segment, or two for a private module', async () => {
    const { pathSegment } = await import('@/lib/audit')

    expect(pathSegment('/movies/7')).toBe('movies')
    expect(pathSegment('/c/c5-recipes/3')).toBe('c/c5-recipes')
    expect(pathSegment('/c')).toBe('c')
    expect(pathSegment('/')).toBe('')
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

  it('still reports the open when the kind is on in some module only', async () => {
    // ჩანაწერის მოდულს სერვერი ადგენს — SPA აგზავნის, თუ გახსნა სადმე მაინც იწერება
    mocks.paths = { open: { movies: true } }
    await mount((lib) => h(Open, { lib, id: 9 }))

    expect(mocks.recordOpen).toHaveBeenCalledWith('book', 9)
  })
})

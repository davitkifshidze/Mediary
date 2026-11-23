import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Actor } from '@/api/media'
import i18n from '@/i18n'

/* ============================================================
   **მსახიობის გვერდის თავი — ჩემი ნიშნები.**

   ⚠️ **ქართული ტექსტი**: ბიოგრაფია ენის მიხედვით ჩანს — ქართულ შიგთავსზე ქართული, თუ არის,
   თორემ ინგლისური; მანქანურ ქართულ სახელსა და ბიოგრაფიას „გადასამოწმებელია" ნიშანი აქვს,
   რომელიც დადასტურებით ან ხელით გასწორებით იხსნება; დადასტურებულ ტექსტს ნიშანი არ აქვს.

   ⚠️ მოწმდება: რჩეულის ღილაკი ჩემს ნიშანს ცვლის; გახსნების რიცხვი ბარათად არ იხატება —
   მხოლოდ `i`-ს მინიშნებაშია; „გახსნების განულება" მხოლოდ მაშინ ჩანს, როცა გასანულებელი
   არსებობს, და ერთ მსახიობს ეხება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  setActorFavorite: vi.fn(),
  resetActorOpens: vi.fn(),
  settleActorGeorgian: vi.fn(),
}))

// შიგთავსის ენა — ტესტი ცვლის
const lang = vi.hoisted(() => ({ value: 'ka' as 'ka' | 'en' }))
vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useContentLang: () => lang.value,
}))

vi.mock('@/api/actors', async (original) => ({
  ...(await original<typeof import('@/api/actors')>()),
  ...mocks,
}))

// ლოკის ღილაკები თავის ტესტებშია
vi.mock('@/components/locks/RecordLock', () => ({ RecordLockActions: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// პირველი იმპორტი სრულ გაშვებაში ნელია — ტესტის დროში არ ითვლება
beforeAll(async () => {
  await import('@/components/ActorHero')
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

const actor = (over: Partial<Actor> = {}): Actor => ({
  id: 7,
  name: 'Liam Neeson',
  name_ka: null,
  photo: null,
  tags: [],
  favorite: false,
  opens: 0,
  ...over,
})

async function mount(value: Actor) {
  const { ActorHero } = await import('@/components/ActorHero')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, null, h(TooltipProvider, null, h(FeedbackProvider, null, h(ActorHero, { actor: value, name: value.name })))),
      ),
    ),
  )
  await flush()

  return container
}

describe('ActorHero', () => {
  it('toggles my favourite and hides the reset while nothing was counted', async () => {
    mocks.setActorFavorite.mockResolvedValue({ favorite: true })
    const box = await mount(actor())

    const star = box.querySelector<HTMLButtonElement>('button[data-kind="toggle"]')!
    expect(star.getAttribute('aria-pressed')).toBe('false')
    await act(async () => star.click())
    await flush()

    expect(mocks.setActorFavorite).toHaveBeenCalledWith(7, true)
    expect(box.querySelector('[data-testid="actor-reset-opens"]')).toBeNull()
  })

  it('keeps the open count inside the hint and resets it for this actor only', async () => {
    mocks.resetActorOpens.mockResolvedValue({ reset: 1 })
    const box = await mount(actor({ favorite: true, opens: 12, known_for: 'Directing' }))

    // სფეროს წარწერა რჩება — ნათარგმნი
    expect(box.querySelector('[data-testid="actor-dept"]')!.textContent).toBe(i18n.t('actors.dept.directing'))

    expect(box.querySelector('button[data-kind="toggle"]')!.getAttribute('aria-pressed')).toBe('true')
    // რიცხვი გვერდზე ტექსტად არ წერია — მხოლოდ `i`-ს მინიშნებაშია
    expect(box.querySelector('[data-testid="actor-opens"]')!.textContent).not.toContain('12')

    await act(async () => box.querySelector<HTMLButtonElement>('[data-testid="actor-reset-opens"]')!.click())
    await flush()

    expect(mocks.resetActorOpens).toHaveBeenCalledWith(7)
    expect(document.body.textContent).toContain(i18n.t('actor.opensReset'))
  })
})

describe('ActorHero: Georgian text', () => {
  const BIO_EN = 'Born in Beirut.'
  const BIO_KA = 'დაიბადა ბეირუთში.'

  it('shows the biography in the content language and falls back to English', async () => {
    lang.value = 'ka'
    let box = await mount(actor({ biography: BIO_EN, biography_ka: BIO_KA }))
    expect(box.querySelector('[data-testid="actor-bio"]')!.textContent).toBe(BIO_KA)

    // ქართული არ არის — ინგლისური
    act(() => root?.unmount())
    box = await mount(actor({ biography: BIO_EN, biography_ka: null }))
    expect(box.querySelector('[data-testid="actor-bio"]')!.textContent).toBe(BIO_EN)

    // ინგლისურ შიგთავსზე ქართული ბიოგრაფია არ ფარავს ორიგინალს და ნიშანიც არ ჩანს
    act(() => root?.unmount())
    lang.value = 'en'
    box = await mount(actor({ biography: BIO_EN, biography_ka: BIO_KA, biography_ka_unverified: true }))
    expect(box.querySelector('[data-testid="actor-bio"]')!.textContent).toBe(BIO_EN)
    expect(box.querySelector('[data-testid="georgian-check-biography"]')).toBeNull()
    lang.value = 'ka'
  })

  it('marks machine-written Georgian text and lifts the mark by confirming or correcting', async () => {
    mocks.settleActorGeorgian.mockResolvedValue(undefined)
    const box = await mount(actor({ name_ka: 'ლიამ ნისონი', name_ka_unverified: true, biography: BIO_EN, biography_ka: BIO_KA, biography_ka_unverified: true, georgian_editable: true }))

    const name = box.querySelector<HTMLElement>('[data-testid="georgian-check-name"]')!
    const bio = box.querySelector<HTMLElement>('[data-testid="georgian-check-biography"]')!
    expect(name.textContent).toContain(i18n.t('actor.georgian.unverified.name'))
    expect(bio.textContent).toContain(i18n.t('actor.georgian.unverified.biography'))

    // დადასტურება — ტექსტის გარეშე
    await act(async () => bio.querySelector<HTMLButtonElement>('[data-testid="georgian-confirm-biography"]')!.click())
    await flush()
    expect(mocks.settleActorGeorgian).toHaveBeenLastCalledWith(7, 'biography', undefined)

    // გასწორება — ტექსტი იქვე იცვლება და ინახება
    await act(async () => name.querySelector<HTMLButtonElement>('[data-testid="georgian-fix-name"]')!.click())
    const input = box.querySelector<HTMLInputElement>('[data-testid="georgian-edit-name"] input')!
    expect(input.value).toBe('ლიამ ნისონი')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(input, ' ლაიამ ნისონი ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => box.querySelector<HTMLButtonElement>('[data-testid="georgian-save-name"]')!.click())
    await flush()
    expect(mocks.settleActorGeorgian).toHaveBeenLastCalledWith(7, 'name', 'ლაიამ ნისონი')
  })

  it('shows the mark without buttons to an account that cannot settle a shared actor', async () => {
    const box = await mount(actor({ name_ka: 'ლიამ ნისონი', name_ka_unverified: true, georgian_editable: false }))

    expect(box.querySelector('[data-testid="georgian-check-name"]')).not.toBeNull()
    expect(box.querySelector('[data-testid="georgian-confirm-name"]')).toBeNull()
    expect(box.querySelector('[data-testid="georgian-fix-name"]')).toBeNull()
  })

  it('shows no mark on confirmed or official text', async () => {
    const box = await mount(actor({ name_ka: 'ლიამ ნისონი', name_ka_unverified: false, biography: BIO_EN, biography_ka: BIO_KA, biography_ka_unverified: false }))

    expect(box.querySelector('[data-testid="georgian-check-name"]')).toBeNull()
    expect(box.querySelector('[data-testid="georgian-check-biography"]')).toBeNull()
  })
})

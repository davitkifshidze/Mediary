import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  GALLERY_FALLBACK_DEFAULTS,
  type GalleryCastMember,
  type GalleryPlan,
  type GalleryPlanItem,
} from '@/api/gallery'
import type { GalleryDownloadPin } from '@/components/GalleryDownloadDialog'
import '@/i18n'

/* ============================================================
   გალერეის ჩამოტვირთვის დიალოგი — **Tasks §18**.

   შენი სიტყვები: „ხელით რომ ვნიშნავ მსახიობებს, მოდალი სიმაღლეში იკლებს და
   მერე იზრდება“ · „როცა კონკრეტულ მსახიობზე ვდგავარ … „თითო მსახიობზე“
   შეუსაბამოა — სჯობს „მონიშნულ მსახიობზე““.

   ⚠️ **ხტომის მიზეზი ტიპებსაც და lint-საც უხილავია**: გეგმის მოთხოვნის
   გასაღები მთელი ფილტრია, ე.ი. ყოველი მონიშვნა ახალი მოთხოვნაა და `plan`
   პასუხამდე `undefined` ხდებოდა — „კონკრეტულის“ მთელი ბლოკი (ძებნის ველიც)
   იშლებოდა და ბრუნდებოდა. ამას მხოლოდ მონტირება და **დაკიდებული** მეორე
   მოთხოვნა აჩენს — ამიტომ ეს ფაილი ზუსტად ამას აკეთებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchGalleryPlan: vi.fn(),
  fetchGenres: vi.fn(),
  enqueueGallery: vi.fn(),
  toast: vi.fn(),
  /* ⚠️ **ერთი და იგივე ობიექტი ყოველ render-ზე.** პროვაიდერი მას
     მემოიზებით აძლევს; ახალი მასივი ყოველ გამოძახებაზე დიალოგის
     `[domains]`-ზე მიბმულ effect-ს უსასრულო ციკლში აგდებდა და ტესტი
     უბრალოდ ეკიდებოდა. */
  modules: { mediaModules: [{ key: 'movie', type: 'movie' }] },
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryPlan: mocks.fetchGalleryPlan,
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchGenres: mocks.fetchGenres,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useMergedStatuses: () => [],
}))

vi.mock('@/lib/settings', async (original) => ({
  ...(await original<typeof import('@/lib/settings')>()),
  useContentLang: () => 'ka',
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => ({ enqueueGallery: mocks.enqueueGallery, isBusy: false }),
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* ⚠️ jsdom-ს `ResizeObserver` არ აქვს — Radix-ის რადიოს და ჩამრთველს
   (`useSize`) და `AutoHeight`-ს ის სჭირდებათ. ზომა აქ არაფერს ამოწმებს. */
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const member = (id: number, name: string, gender = 2): GalleryCastMember => ({
  id,
  name,
  name_ka: null,
  gender,
  photo_path: null,
  has_tmdb: true,
  photos: 0,
})

const ALL = [member(1, 'Keanu Reeves'), member(2, 'Carrie-Anne Moss', 1), member(3, 'Laurence Fishburne')]

function plan(cast: GalleryCastMember[], items: GalleryPlanItem[] = []): GalleryPlan {
  return {
    target: 'actor',
    types: ['movie'],
    tmdb: true,
    items,
    count: items.length,
    eta_seconds: 0,
    skipped_without_tmdb: 0,
    skipped_with_photos: 0,
    estimated_bytes: 0,
    storage: { used: 0, quota: 1024, remaining: 1024, percent: 0, warn_at: 80, critical_at: 95 },
    fits: true,
    options: {} as GalleryPlan['options'],
    cast,
    cast_truncated: false,
    unknown_gender: 0,
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ დიალოგი მძიმე მოდულებს ტვირთავს (ჟანრები, ამრჩევები) — DEBT-12-ის გაკვეთილი
beforeAll(async () => {
  await import('@/components/GalleryDownloadDialog')
}, 60_000)

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

async function mount(pin?: GalleryDownloadPin) {
  const { GalleryDownloadDialog } = await import('@/components/GalleryDownloadDialog')
  mocks.fetchGenres.mockResolvedValue([])

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          MemoryRouter,
          null,
          h(
            TooltipProvider,
            null,
            h(GalleryDownloadDialog, {
              open: true,
              onOpenChange: () => {},
              defaults: GALLERY_FALLBACK_DEFAULTS,
              initialFlow: 'cast',
              pin,
            }),
          ),
        ),
      ),
    )
  })
  await flush()
}

/** დიალოგი პორტალშია — ყველაფერი `document.body`-ში იძებნება */
const body = () => document.body

function radio(value: string) {
  return body().querySelector<HTMLButtonElement>(`button[role="radio"][value="${value}"]`)
}

/** მსახიობის სტრიქონის ჩამრთველი — სახელით */
function actorCheckbox(name: string) {
  const row = [...body().querySelectorAll('label')].find((l) => l.textContent?.includes(name))
  return row?.querySelector<HTMLButtonElement>('button[role="checkbox"]') ?? null
}

function searchInput() {
  return body().querySelector<HTMLInputElement>('input[placeholder="მოძებნე მსახიობი…"]')
}

async function click(el: Element | null) {
  expect(el, 'ელემენტი ვერ მოიძებნა').toBeTruthy()
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await flush()
}

/** React-ის მართულ ველს მნიშვნელობა native setter-ით უნდა მიეცეს */
async function type(input: HTMLInputElement | null, value: string) {
  expect(input, 'ძებნის ველი ვერ მოიძებნა').toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openSelected() {
  await click(radio('selected'))
  expect(body().textContent).toContain('Keanu Reeves')
}

describe('GalleryDownloadDialog — Tasks §18', () => {
  it('მონიშვნისას სია და ძებნის ველი ადგილზე რჩება, სანამ ახალი გეგმა მოდის', async () => {
    mocks.fetchGalleryPlan.mockResolvedValue(plan(ALL))
    await mount()
    await openSelected()

    const input = searchInput()
    expect(input).toBeTruthy()

    // ⚠️ შემდეგი გეგმა **დაკიდებულია** — სწორედ ამ შუალედში ქრებოდა ბლოკი
    const before = mocks.fetchGalleryPlan.mock.calls.length
    mocks.fetchGalleryPlan.mockReturnValue(new Promise(() => {}))
    await click(actorCheckbox('Keanu Reeves'))

    expect(mocks.fetchGalleryPlan).toHaveBeenCalledTimes(before + 1)
    // იგივე ველი (და არა ახლად დახატული) — ფოკუსი და ტექსტი არ იკარგება
    expect(searchInput()).toBe(input)
    expect(body().textContent).toContain('Carrie-Anne Moss')
    expect(body().textContent).toContain('Laurence Fishburne')
    // ⚠️ ქვედა ზოლი წინა ჯამს ინარჩუნებს და „იტვირთება…“-ზე არ ხტება
    expect(body().textContent).toContain('მსახიობი 0 × თითოზე')
    expect(body().textContent).not.toContain('იტვირთება…')
  })

  it('ცარიელი ძებნა ველს არ აქრობს და „მსახიობი ვერ მოიძებნა“-ს ამბობს', async () => {
    mocks.fetchGalleryPlan.mockResolvedValue(plan(ALL))
    await mount()
    await openSelected()

    mocks.fetchGalleryPlan.mockResolvedValue(plan([]))
    await type(searchInput(), 'zzz')
    // ძებნა 350მწ-იანი პაუზით მიდის
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    await flush()

    expect(mocks.fetchGalleryPlan).toHaveBeenLastCalledWith(expect.objectContaining({ cast_q: 'zzz' }))
    expect(searchInput()).toBeTruthy()
    expect(searchInput()!.value).toBe('zzz')
    expect(body().textContent).toContain('მსახიობი ვერ მოიძებნა.')
    expect(radio('selected')).toBeTruthy()
  })

  it('წარწერა არჩევანს მიჰყვება: „თითო“ ჯგუფზე, „მონიშნულ მსახიობებზე“ რამდენიმეზე', async () => {
    mocks.fetchGalleryPlan.mockResolvedValue(plan(ALL))
    await mount()

    expect(body().textContent).toContain('რამდენი ფოტო ჩამოიტვირთოს თითო მსახიობზე')
    // „მსახიობები“ ორ ველს ერქვა — ჭერი ახლა „რამდენი მსახიობია“
    expect(body().textContent).toContain('რამდენი მსახიობი')
    expect(body().textContent).toContain('რომელი ჩანაწერების მსახიობებზე?')

    await openSelected()
    await click(actorCheckbox('Keanu Reeves'))
    expect(body().textContent).toContain('რამდენი ფოტო ჩამოიტვირთოს მონიშნულ მსახიობზე')

    await click(actorCheckbox('Carrie-Anne Moss'))
    expect(body().textContent).toContain('რამდენი ფოტო ჩამოიტვირთოს მონიშნულ მსახიობებზე')
    expect(body().textContent).not.toContain('თითო მსახიობზე')
  })

  it('ერთ მსახიობზე მიბმული ფანჯარა „მონიშნულ მსახიობზე“ ამბობს და ჩანაწერებზე არ ლაპარაკობს', async () => {
    mocks.fetchGalleryPlan.mockResolvedValue(plan([], [{ type: 'actor', id: 9, title: 'Keanu Reeves', year: null }]))
    await mount({ actor: { id: 9, name: 'Keanu Reeves' } })

    expect(body().textContent).toContain('რამდენი ფოტო ჩამოიტვირთოს მონიშნულ მსახიობზე')
    // §18.4 — ცრუ „ჩანაწერისგან დამოუკიდებელია…“ აღარ არსებობს
    expect(body().textContent).not.toContain('ჩანაწერისგან დამოუკიდებელია')

    // §18.5 — სათაურის i „ამ ჩანაწერების მსახიობებს“ აღარ ახსენებს
    const hint = body().querySelector<HTMLButtonElement>('button[aria-label="ინფორმაცია"]')
    await click(hint)
    expect(body().textContent).toContain('ფოტო მსახიობზე მიება და ყველა ფილმში ჩანს')
    expect(body().textContent).not.toContain('არჩეული ჩანაწერების მსახიობების')
  })

  it('გაშვებისას ტოსტი მსახიობებს ითვლის და არა ჩანაწერებს', async () => {
    const items: GalleryPlanItem[] = [
      { type: 'actor', id: 1, title: 'Keanu Reeves', year: null },
      { type: 'actor', id: 3, title: 'Laurence Fishburne', year: null },
    ]
    mocks.fetchGalleryPlan.mockResolvedValue(plan(ALL, items))
    await mount()

    const run = [...body().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'გაშვება')
    await click(run ?? null)

    expect(mocks.enqueueGallery).toHaveBeenCalledWith(items, expect.anything())
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: '2 მსახიობი რიგში დაემატა' }))
  })
})

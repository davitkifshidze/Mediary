import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'

/* ============================================================
   რეგრესია: **`counts` ყოველ რენდერზე ახალი ობიექტი იყო** (Tasks PERF-11).

   `const counts = summaryQ.data?.categories ?? {}` — ჩატვირთვისას ინლაინ
   `{}` ყოველ რენდერზე სხვა რეფერენციაა, ე.ი. `useMemo`-ს deps ყოველთვის
   იცვლებოდა და memo **არასდროს ინახებოდა**: `CutTabs` ყოველ რენდერზე ახალ
   `options` მასივს იღებდა და მთელი ბარათების რიგი თავიდან იხატებოდა.

   ⚠️ ამას ვერც `tsc` ხედავს და ვერც lint — და `eslint-disable` კომენტარი
   მას პირდაპირ ფარავდა. ერთადერთი გზა, რომ ეს ფაქტი დაფიქსირდეს,
   `options`-ის **რეფერენციის** დათვალიერებაა ორ რენდერს შორის.
   ============================================================ */

/** ყოველი რენდერის `options` — ტესტის ერთადერთი დაკვირვების წერტილი */
const seen: unknown[] = []

vi.mock('@/components/ui/cut-tabs', () => ({
  CutTabs: (props: { options: unknown }) => {
    seen.push(props.options)

    return null
  },
}))

// ბადეს ეს ტესტი არ ეხება — ის საკუთარ query-ებს აკეთებდა
vi.mock('@/components/gallery/GroupPhotos', () => ({ GroupPhotos: () => null }))

const mocks = vi.hoisted(() => ({ fetchGallerySummary: vi.fn() }))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  seen.length = 0
  vi.clearAllMocks()
})

/**
 * ჩამაგრება → query-ის დაწყნარება → **მხოლოდ ამის შემდეგ** ორი უცვლელი
 * რენდერი.
 *
 * ⚠️ დაწყნარებამდე გაზომვა სხვა რამეს შეადარებდა: პირველი რენდერი
 * `undefined`-ზეა, მეორე — უკვე მოსულ მონაცემზე, ე.ი. `options` ლეგიტიმურად
 * იცვლება და ტესტი გასწორებულ კოდზეც წითლდებოდა.
 */
async function mountThenRerenderTwice() {
  const { AllPhotosCut } = await import('@/components/gallery/AllPhotosCut')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const tree = () => h(QueryClientProvider, { client: qc }, h(AllPhotosCut, null))

  await act(async () => {
    root!.render(tree())
  })

  // ⚠️ ერთი `act` არ კმარა: react-query-ის პასუხი მომდევნო tick-ზე ჯდება
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  seen.length = 0

  // ორი რენდერი უცვლელი მდგომარეობით — ზუსტად ის, რასაც მშობელი აკეთებს
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      root!.render(tree())
    })
  }
}

describe('AllPhotosCut — PERF-11', () => {
  /* ⚠️ **ჩატვირთვის მდგომარეობაა და არა შეცდომა**: `data` `undefined`-ია,
     ე.ი. სწორედ ის შემთხვევა, სადაც ინლაინ `{}` იბადებოდა. */
  it('keeps the options array stable while the summary is loading', async () => {
    mocks.fetchGallerySummary.mockReturnValue(new Promise(() => {}))

    await mountThenRerenderTwice()

    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]).toBe(seen[seen.length - 1])
  })

  /* ⚠️ ჩატვირთვის შემდეგაც: react-query-ის `data` სტაბილური რეფერენციაა,
     ე.ი. memo იქაც უნდა შენარჩუნდეს — თორემ გასწორება ნახევრად იქნებოდა. */
  it('keeps it stable once the summary has arrived', async () => {
    mocks.fetchGallerySummary.mockResolvedValue({
      photos: 3,
      categories: { backdrop: 2, poster: 1 },
    })

    await mountThenRerenderTwice()

    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]).toBe(seen[seen.length - 1])
  })
})

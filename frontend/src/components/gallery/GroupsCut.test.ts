import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **ჯგუფში შესვლისას ვებძებნა უნდა გაიხსნას** (ეტაპი 3).

   ⚠️ ხარვეზი ისეთი იყო, რომ არც `tsc`-ს, არც lint-ს და არც სუფთა ფუნქციის
   ტესტს ვერ დაენახა: დიალოგები მხოლოდ ჯგუფების **სიის** დაბრუნებაში იდო,
   ღილაკები კი გახსნილი ჯგუფის შტოში, რომელიც `if (open)`-ით ადრე ბრუნდება.
   ე.ი. `state` იცვლებოდა და ეკრანზე **არაფერი ხდებოდა**. ერთადერთი, რაც ამას
   იჭერს, არის კომპონენტის ნამდვილი მიმაგრება — ამიტომ არსებობს ეს ფაილი.

   ⚠️ **ბიბლიოთეკა არ დამატებულა**: `react-dom/client` + `react`-ის `act()`
   საკმარისია, ე.ი. `@testing-library/react` კვლავ არ გვჭირდება. ფაილი `.ts`-ია
   (და არა `.tsx`) სწორედ იმიტომ, რომ `vitest.config.ts`-ის `include` არ
   შეიცვალოს — ელემენტები `createElement`-ით იწერება.
   ============================================================ */

const group = {
  kind: 'actor' as const,
  id: 7,
  title: 'Mel Gibson',
  title_ka: null,
  poster_path: null,
  photos: 12,
  bytes: 1024,
  has_tmdb: true,
}

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryGroups: vi.fn(async () => ({ groups: [group], previews: {} })),
  fetchGalleryPhotos: vi.fn(async () => ({ data: [], meta: { page: 1, per_page: 20, total: 0, last_page: 1 } })),
}))

vi.mock('@/api/web', async (original) => ({
  ...(await original<typeof import('@/api/web')>()),
  webSearchStatus: vi.fn(async () => ({
    configured: true,
    limit: 250,
    used: 0,
    remaining: 250,
    window_start: null,
    account: null,
    sources: { images: [{ key: 'wikimedia', name: 'Wikimedia', safe_search: false, free: true }], videos: [{ key: 'youtube', name: 'YouTube', safe_search: false, free: false }] },
  })),
}))

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ გაფრთხილებას წერს და ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mountGroupsCut() {
  const { GroupsCut } = await import('@/components/gallery/GroupsCut')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        // `TooltipProvider` `main.tsx`-შია — დიალოგის შიგნით tooltip-იც გვხვდება
        h(MemoryRouter, null, h(TooltipProvider, null, h(GroupsCut, { by: 'actor' }))),
      ),
    )
  })

  // ⚠️ ერთი `act` არ კმარა: react-query-ის პასუხი მომდევნო tick-ზე ჯდება
  await flush()

  return container
}

/** ქსელური პასუხების ჩამოჯდომა */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** ბარათზე დაჭერა = ჯგუფში შესვლა (`if (open)`-ის შტო) */
async function openGroup() {
  const node = await mountGroupsCut()
  const card = button(node, 'Mel Gibson')
  expect(card, 'ჯგუფის ბარათი უნდა დაიხატოს').toBeTruthy()

  await act(async () => card!.click())
  await flush()

  return node
}

/** ტექსტის მიხედვით ღილაკის პოვნა — `@testing-library`-ის გარეშე */
function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

const dialogs = () => document.body.querySelectorAll('[role="dialog"]').length

describe('GroupsCut', () => {
  it('ჯგუფში შესვლის შემდეგაც ხსნის ფოტოების ვებძებნას', async () => {
    const node = await openGroup()

    const photos = button(node, 'ფოტოები ვებიდან')
    expect(photos, 'ღილაკი გახსნილ ჯგუფში უნდა იყოს').toBeTruthy()

    // ⚠️ სწორედ აქ არაფერი ხდებოდა: `state` იცვლებოდა, დიალოგი კი სხვა შტოში იყო
    await act(async () => photos!.click())
    await flush()
    expect(dialogs(), 'ფოტოების ძებნა უნდა გაიხსნას').toBe(1)
  })

  it('იგივე ვიდეოს ძებნაზე', async () => {
    const node = await openGroup()

    const videos = button(node, 'ვიდეოს ძებნა')
    expect(videos).toBeTruthy()

    await act(async () => videos!.click())
    await flush()
    expect(dialogs()).toBe(1)
  })

  it('სიის ხედში დიალოგი დახურულია', async () => {
    // იმავე `dialogs` სია სიის შტოშიც იხატება — ღია მდგომარეობა state-ს მოსდევს
    await mountGroupsCut()
    expect(dialogs()).toBe(0)
  })
})

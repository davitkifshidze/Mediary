import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Course } from '@/api/courses'
import i18n from '@/i18n'

/* ============================================================
   **კურსის რიგი — ერთი მოქმედებების ზოლი** (Tasks §29.1/§29.4).

   ⚠️ მოწმდება: სტატუსი ერთხელაა და ჩამოსაშლელია (`Select` აღარ არის), ყველა
   კონტროლი ერთი სიმაღლისაა (h-9), ბმულის სლოტი უბმულო კურსზეც ადგილზეა
   (უხილავი), ფაილების ღილაკს რიცხვი აქვს, პლატფორმა ჰოსტის ნაცვლად
   ბრენდის სახელით წერია („YouTube“, არა „youtube.com“).
   ============================================================ */

function course(id: number, over: Partial<Course> = {}): Course {
  return {
    id,
    title: `Course ${id}`,
    url: 'https://www.youtube.com/watch?v=abc123',
    platform: 'youtube.com',
    description: null,
    category_id: null,
    category: null,
    tags: [],
    status: 'to_take',
    is_favorite: false,
    visits_count: 0,
    image: null,
    started_at: null,
    finished_at: null,
    files_count: 2,
    visibility: 'private',
    created_at: null,
    ...over,
  }
}

const items = [course(1), course(2, { url: null, platform: null, files_count: 0 })]

const mocks = vi.hoisted(() => ({
  fetchCourses: vi.fn(),
  fetchCourseCategories: vi.fn(),
  setCourseStatus: vi.fn(),
}))

vi.mock('@/api/courses', async (original) => ({
  ...(await original<typeof import('@/api/courses')>()),
  fetchCourses: mocks.fetchCourses,
  fetchCourseCategories: mocks.fetchCourseCategories,
  setCourseStatus: mocks.setCourseStatus,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/* მძიმე მოდულების გათბობა ტესტის ბიუჯეტის გარეთ (DEBT-12-ის წესი, `NoteReminders.test.ts`):
   გვერდი დეტალის ფანჯარასთან ერთად Leaflet-ის ლეიზი საზღვარსაც იწევს და სრულ `npm test`-ში
   პირველი ტესტი 5 წმ-ს სცდებოდა — ერთჯერადი იმპორტი ჰუკშია, თავისი ვადით. */
beforeAll(async () => {
  await import('@/pages/CoursesPage')
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

async function mount() {
  mocks.fetchCourses.mockResolvedValue({ items, total: items.length, lastPage: 1 })
  mocks.fetchCourseCategories.mockResolvedValue([])
  mocks.setCourseStatus.mockResolvedValue({ ...items[0], status: 'done' })

  const { CoursesPage } = await import('@/pages/CoursesPage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/courses'] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(CoursesPage)))),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

const bars = () => [...document.querySelectorAll<HTMLElement>('[data-testid="record-actions"]')]
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find((el) => el.textContent?.trim() === label)

describe('CoursesPage row (§29.1)', () => {
  it('draws one action bar whose controls share a height and keeps the link slot on a course without a link', async () => {
    await mount()

    const [first, second] = bars()
    expect(bars()).toHaveLength(2)

    // ყველა კონტროლი h-9 — სტატუსის ბეჯი (row), რჩეული, ფაილები, ბმული, რედაქტირება, წაშლა
    for (const child of [...first.children]) {
      expect(child.matches('.h-9') || child.querySelector('.h-9') !== null, child.outerHTML).toBe(true)
    }

    // სტატუსი ერთხელ და ჩამოსაშლელად — `Select` რიგში აღარ არის
    expect(first.querySelectorAll(`[aria-label="${i18n.t('courses.status')}"]`)).toHaveLength(1)
    expect(first.querySelector('[role="combobox"]')).toBeNull()
    expect(first.querySelector('.min-w-36')?.textContent).toContain(i18n.t('courses.statuses.to_take'))

    // ფაილები რიცხვით, ბმული ტექსტით
    expect(first.querySelector('[data-testid="files-button"]')?.textContent).toContain(i18n.t('actions.files'))
    expect(first.querySelector('[data-testid="files-button"]')?.textContent).toContain('2')
    const link = first.querySelector<HTMLAnchorElement>('[data-testid="link-slot"]')!
    expect(link.textContent).toContain(i18n.t('actions.link'))
    expect(link.className).not.toContain('invisible')
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc123')

    // უბმულო კურსზე სლოტი რჩება, მაგრამ უხილავია — ღილაკები არ ინაცვლებს
    const empty = second.querySelector<HTMLAnchorElement>('[data-testid="link-slot"]')!
    expect(empty.className).toContain('invisible')
    expect(empty.getAttribute('aria-hidden')).toBe('true')
    expect(second.querySelector('[data-testid="files-button"]')?.textContent?.trim()).toBe(i18n.t('actions.files'))

    // §29.3 — პლატფორმა ბრენდის სახელით, არა ჰოსტით
    expect(document.body.textContent).toContain('YouTube')
    expect(document.body.textContent).not.toContain('youtube.com')
  })

  it('the status dropdown sends the picked status', async () => {
    await mount()

    const trigger = bars()[0].querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('courses.status')}"]`)!
    await act(async () => trigger.click())
    await flush()

    await act(async () => menuItem(i18n.t('courses.statuses.done'))!.click())
    await flush()

    expect(mocks.setCourseStatus).toHaveBeenCalledWith(1, 'done')
  })
})

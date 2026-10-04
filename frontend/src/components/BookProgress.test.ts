import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Book } from '@/api/books'
import i18n from '@/i18n'

/* ============================================================
   **„გვერდის განახლება" — ღილაკები ქვედა ზოლში** (Tasks §40.6).

   შენი სიტყვები: „წიგნებში გვერდის ანალიზში „დავასრულე" ღილაკი ძალიან ცუდადაა".
   ფანჯარაში (`max-w-xl`) საფეხურები, ველი, სლაიდერი და ორი ღილაკი ერთ რიგში არ
   ეტეოდა — „დავასრულე" მარტო ჩამოდიოდა. ახლა ზემოთ მხოლოდ კონტროლებია,
   „შენახვა" და „დავასრულე" კი `ModalFooter`-შია, ერთი სიმაღლით.
   ============================================================ */

const mocks = vi.hoisted(() => ({ setBookProgress: vi.fn() }))

vi.mock('@/api/books', async (original) => ({
  ...(await original<typeof import('@/api/books')>()),
  setBookProgress: mocks.setBookProgress,
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

const book = {
  id: 5,
  title_ka: 'წიგნი',
  title_en: 'Book',
  status: 'reading',
  pages: 412,
  progress_page: 100,
  progress_percent: 24,
} as unknown as Book

describe('ProgressDialog (§40.6)', () => {
  it('keeps the controls on top and puts Save and Finished together in the footer', async () => {
    mocks.setBookProgress.mockResolvedValue({ ...book, progress_percent: 100, progress_page: 412, status: 'read' })
    const { ProgressDialog } = await import('@/components/BookProgress')
    const onClose = vi.fn()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () =>
      root!.render(h(QueryClientProvider, { client: qc }, h(FeedbackProvider, null, h(ProgressDialog, { book, onClose })))),
    )

    const dialog = document.querySelector('[role="dialog"]')!
    const footer = dialog.querySelector('.sticky.bottom-0')!
    const labels = [...footer.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).toEqual([i18n.t('actions.close'), i18n.t('actions.save'), i18n.t('books.markFinished')])

    // ღილაკები ერთი სიმაღლისაა და სლაიდერის რიგში აღარ დგას
    const heights = [...footer.querySelectorAll('button')].map((b) => (b.className.match(/\bh-\d+\b/) ?? [''])[0])
    expect(new Set(heights).size).toBe(1)
    expect(footer.contains(dialog.querySelector('[data-testid="progress-slider"]'))).toBe(false)

    const finished = [...footer.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('books.markFinished')))!
    await act(async () => finished.click())
    expect(mocks.setBookProgress).toHaveBeenCalledWith(5, { percent: 100 })
  })
})

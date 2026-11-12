import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { VideoOrigin } from '@/api/videos'
import i18n from '@/i18n'

/* ============================================================
   **„წყარო: ბუკმარკი — <სახელი> →"** ვიდეოს ბარათზე და ფანჯარაში.

   ⚠️ მოწმდება: წარწერა მოდულის სახელითა და ჩანაწერის სათაურით, ბმული მოდულის
   ფესვიდან (ძებნის შედეგის წესით), მსახიობი — თავის გვერდზე; სათაურის გარეშე
   (ურნა, წაშლა, დამალვა) მხოლოდ მოდული იწერება და ბმული არ არის; წყაროს გარეშე
   არაფერი იხატება.
   ============================================================ */

const modules = vi.hoisted(() => ({
  all: [
    { key: 'bookmark', name_ka: 'ბუკმარკები', name_en: 'Bookmarks', route_base: '/bookmarks', icon: 'Bookmark', color: '#0af' },
    { key: 'course', name_ka: 'კურსები', name_en: 'Courses', route_base: '/courses', icon: 'GraduationCap', color: null },
  ],
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(origin: VideoOrigin | null) {
  const { VideoSource } = await import('@/components/VideoSource')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(MemoryRouter, null, h(VideoSource, { origin }))))

  return container.querySelector<HTMLElement>('[data-testid="video-source"]')
}

describe('VideoSource', () => {
  it('names the module and the record and links to it', async () => {
    const node = await mount({ kind: 'bookmark', id: 32, module: 'bookmark', title: 'Tokyo House', title_ka: null })

    expect(node?.tagName).toBe('A')
    expect(node?.textContent).toContain('Tokyo House')
    expect(node?.textContent).toMatch(/ბუკმარკები|Bookmarks/)
    // ბუკმარკი id-ით იხსნება — ერთნაირი სათაურის ორი ჩანაწერი არ აირევა
    expect(node?.getAttribute('href')).toBe('/bookmarks?open=32')
  })

  it('sends an actor to the actor page', async () => {
    const node = await mount({ kind: 'actor', id: 5, module: 'gallery', title: 'Zendaya', title_ka: null })

    expect(node?.getAttribute('href')).toBe('/actors/5')
    expect(node?.textContent).toContain(i18n.t('videos.origin.actor'))
  })

  it('writes only the module when the record is gone, and nothing without an origin', async () => {
    const gone = await mount({ kind: 'course', id: 14, module: 'course', title: null, title_ka: null })

    expect(gone?.tagName).toBe('SPAN')
    expect(gone?.textContent).toMatch(/კურსები|Courses/)

    act(() => root?.unmount())
    container?.remove()

    expect(await mount(null)).toBeNull()
  })
})

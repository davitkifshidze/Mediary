import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Video } from '@/api/videos'
import type { VideoCardProps } from '@/components/VideoCard'
import i18n from '@/i18n'

/* ============================================================
   **ვიდეოს ბარათი — სამი ბეჯი ერთი ზომით და სიმეტრიული სლოტები** (Tasks §19).

   ⚠️ მოწმდება: ტიპი · სტატუსი · პლატფორმა სამივე `h-7 min-w-24`-ია და ფერს
   ატარებს (YouTube — `--platform-youtube`, ტიპი — თავისი ფერი); უტიპო ვიდეოზე
   სლოტი მაინც სამია; ტეგების სლოტი ტეგების გარეშეც ადგილზეა (`min-h-7`);
   მოქმედებების ზოლში ყველა კონტროლი `h-9`-ია და ჩამოტვირთვა ერთი ღილაკია
   (მზაზე — ბმული ლოკალურ ფაილზე, თორემ — ჩამოტვირთვის ღილაკი).
   Tasks §53 (Q14) — ზოლში ზუსტად ოთხი ღილაკია (რჩეული · ჩამოტვირთვა ·
   რედაქტირება · წაშლა), „წყარო" კონტექსტურ მენიუშია, ესკიზი და სათაური
   ფანჯარას ხსნის.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function video(extra: Partial<Video> = {}): Video {
  return {
    id: 7,
    title: 'Talk',
    description: null,
    channel: 'Studio',
    published_at: '2024-05-01',
    type_id: 1,
    type: { id: 1, key: 'fun', name_ka: 'გასართობი', name_en: 'Entertainment', icon: 'Clapperboard', color: 'c8', sort_order: 1 },
    status: { id: 2, key: 'to_watch', module: 'video', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: 'Clock', color: null, is_default: true, sort_order: 0 },
    visibility: 'private',
    url: 'https://youtu.be/talk',
    platform: 'youtube',
    external_id: 'talk',
    embed_url: 'https://www.youtube-nocookie.com/embed/talk',
    thumbnail: null,
    duration: 610,
    tags: [],
    is_favorite: false,
    watch_count: 0,
    watched_at: null,
    created_at: null,
    download_status: null,
    download_size: 0,
    download_format: null,
    download_name: null,
    download_error: null,
    downloaded_at: null,
    download_stale: false,
    ...extra,
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(subject: Video, overrides: Partial<VideoCardProps> = {}) {
  const { VideoCard } = await import('@/components/VideoCard')
  const props: VideoCardProps = {
    video: subject,
    actions: [],
    lang: 'ka',
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleFavorite: vi.fn(),
    download: { hint: 'hint', available: true, pending: false, onStart: vi.fn() },
    onPlayLocal: vi.fn(),
    ...overrides,
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(TooltipProvider, null, h(VideoCard, props))))
  return { el: container, props }
}

const badges = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-testid="video-badges"] > *')]

describe('VideoCard', () => {
  it('draws type, status and platform as three equal badges with their own colours', async () => {
    const { el } = await mount(video())

    const row = badges(el)
    expect(row).toHaveLength(3)
    for (const badge of row) {
      expect(badge.className).toContain('h-7')
      expect(badge.className).toContain('min-w-24')
    }
    expect(row[0].textContent).toContain('გასართობი')
    expect(row[0].style.color).toBe('var(--status-c8)')
    expect(row[1].textContent).toContain('სანახავი')
    expect(row[2].textContent).toContain('YouTube')
    expect(row[2].style.color).toBe('var(--platform-youtube)')
  })

  it('keeps three badge slots and the tag slot even when the video has no type and no tags', async () => {
    const { el } = await mount(video({ type: null, type_id: null, platform: 'file' }))

    const row = badges(el)
    expect(row).toHaveLength(3)
    expect(row[0].textContent).toContain(i18n.t('videos.noType'))
    expect(row[2].textContent).toContain(i18n.t('videoPlatforms.file'))

    const tags = el.querySelector<HTMLElement>('[data-testid="video-tags"]')!
    expect(tags.className).toContain('min-h-7')
    expect(tags.children).toHaveLength(0)

    // მეტა-ხაზი ერთი სტრიქონია
    const meta = el.querySelector<HTMLElement>('[data-testid="video-meta"]')!
    expect(meta.className).toContain('whitespace-nowrap')
    expect(meta.textContent).toContain('Studio')
  })

  it('the actions bar sits at the bottom with four h-9 controls that never get cut (§53.2)', async () => {
    const { el, props } = await mount(video())

    const bar = el.querySelector<HTMLElement>('[data-testid="video-actions"]')!
    expect(bar.className).toContain('mt-auto')
    // ჭრის ნაცვლად — მეორე ხაზი
    expect(bar.className).toContain('flex-wrap')
    expect(bar.className).toContain('min-w-0')
    const controls = [...bar.querySelectorAll<HTMLElement>('a, button')]
    // რჩეული · ჩამოტვირთვა · რედაქტირება · წაშლა — „წყარო" და „აქედან დაკვრა" ზოლში აღარ არის
    expect(controls).toHaveLength(4)
    for (const c of controls) expect(c.className).toContain('h-9')
    expect(bar.querySelector('a')).toBeNull()
    expect(bar.querySelector(`[aria-label="${i18n.t('playback.playFromHere')}"]`)).toBeNull()
    expect(controls[0].textContent).toContain(i18n.t('filter.favorite'))
    expect(controls[3].getAttribute('aria-label')).toBe(i18n.t('actions.delete'))

    // რჩეული ზოლშია და არა სათაურის ხაზზე
    await act(async () => controls[0].click())
    expect(props.onToggleFavorite).toHaveBeenCalled()

    const download = el.querySelector<HTMLButtonElement>('button[data-testid="download-control"]')!
    await act(async () => download.click())
    expect(props.download.onStart).toHaveBeenCalled()

    await act(async () => [...bar.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('actions.edit')))!.click())
    expect(props.onEdit).toHaveBeenCalled()
  })

  it('a downloaded video shows the local-copy badge and opens the local player instead of downloading', async () => {
    const { el, props } = await mount(video({ download_status: 'ready', download_size: 329 * 1024 * 1024, download_format: 'mp4' }))

    const badge = el.querySelector<HTMLElement>('[data-testid="download-badge"]')!
    expect(badge.className).toContain('rounded-md')
    expect(badge.className).toContain('bg-[var(--status-watched)]')
    expect(badge.textContent).toContain(i18n.t('videos.local.ready'))

    // Tasks §21.2 — მზა ასლი ცალკე ფლეერში იხსნება, არა ბრაუზერის მნახველში
    const control = el.querySelector<HTMLButtonElement>('button[data-testid="download-control"][data-local="ready"]')!
    expect(control.getAttribute('aria-label')).toBe(i18n.t('videos.local.play'))
    expect(el.querySelector('a[href*="/download"]')).toBeNull()
    await act(async () => control.click())
    expect(props.onPlayLocal).toHaveBeenCalled()
    expect(props.download.onStart).not.toHaveBeenCalled()
  })

  it('the thumbnail and the title open the window; the source link lives in the context menu (§53, Q14)', async () => {
    const openSource = vi.fn()
    const { el, props } = await mount(video(), {
      actions: [
        { key: 'open', label: i18n.t('actions.open'), run: vi.fn() },
        { key: 'source', label: i18n.t('videos.source'), run: openSource },
      ],
    })

    await act(async () => el.querySelector<HTMLButtonElement>('button[aria-label="Talk"]')!.click())
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="video-title"]')!.click())
    expect(props.onOpen).toHaveBeenCalledTimes(2)

    const card = el.querySelector<HTMLElement>('[data-testid="video-card"]')!
    await act(async () => {
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const items = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(items.some((i) => i.textContent?.includes(i18n.t('videos.source')))).toBe(true)
  })
})

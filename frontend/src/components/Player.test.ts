import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Player } from '@/components/Player'
import { PANEL_WIDTH, PlayerProvider, usePlayer, type PlayerItem } from '@/lib/player'
import i18n from '@/i18n'

/* ============================================================
   დამკვრელი — გვერდითა პანელი და ქვედა ზოლი (Tasks §35).

   ⚠️ აქ მოწმდება ის, რასაც ვერც ტიპი ხედავს და ვერც lint:
   - **განლაგების შეცვლაზე ფრეიმი იგივე DOM-კვანძია** (35.3) — სხვა
     კონტეინერში გადატანა ვიდეოს თავიდან ჩატვირთავდა და შეცდომა ეკრანზე
     მხოლოდ „დაკვრა თავიდან დაიწყო"-ით გამოჩნდებოდა;
   - პანელი გვერდს **აწვება** (`--player-w`), ზოლი — ქვემოდან (`--player-h`),
     ორივე ერთად არასდროს;
   - ჩაკეცვის არჩევანი **ახსოვს** (Q26);
   - რიგი: მიმდინარე და შემდეგი სიტყვით, გადასვლა, ამოღება, გადალაგება.

   ⚠️ jsdom-ს `matchMedia` არ აქვს — ფართო ეკრანი აქ ჩანაცვლებით „ჩნდება"
   და `change` ხელით ისვრის, ზუსტად ისე, როგორც ბრაუზერი ზომის შეცვლაზე.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  markSongPlayed: vi.fn(),
  markVideoWatched: vi.fn(),
  media: { wide: false, listeners: new Set<() => void>() },
}))

vi.mock('@/api/songs', async (original) => ({
  ...(await original<typeof import('@/api/songs')>()),
  markSongPlayed: mocks.markSongPlayed,
}))
vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  markVideoWatched: mocks.markVideoWatched,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* ⚠️ jsdom-ს `ResizeObserver` არ აქვს — რიგის მენიუ Radix-ის popover-ია */
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/** ⚠️ allowlist-ის ჰოსტი — `www.youtube.com` `lib/embed.ts`-ში დაშვებული არაა */
const YT = 'https://www.youtube-nocookie.com'

function song(id: number, key: string): PlayerItem {
  return {
    kind: 'song',
    id,
    title: key,
    subtitle: `${key} artist`,
    url: `https://youtu.be/${key}`,
    embedUrl: `${YT}/embed/${key}`,
    platform: 'youtube',
    thumbnail: null,
    duration: 200,
  }
}

const ITEMS = [song(1, 'alpha'), song(2, 'bravo'), song(3, 'charlie')]

let root: Root | null = null
let container: HTMLDivElement | null = null
let api: ReturnType<typeof usePlayer> | null = null

function Grab() {
  api = usePlayer()
  return null
}

beforeEach(() => {
  mocks.media.wide = false
  mocks.media.listeners.clear()
  mocks.markSongPlayed.mockResolvedValue(undefined)
  mocks.markVideoWatched.mockResolvedValue(undefined)
  localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      media: query,
      get matches() {
        return mocks.media.wide
      },
      addEventListener: (_: string, fn: () => void) => mocks.media.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => mocks.media.listeners.delete(fn),
    }),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  api = null
  Reflect.deleteProperty(window, 'matchMedia')
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  /* ⚠️ `children` **props-შია და არა ვარიადულად**: `createElement`-ის ვარიადულ
     ფორმას TS სავალდებულო `children`-ად არ თვლის და `npm run build` ვარდება. */
  await act(async () => {
    root!.render(
      h(QueryClientProvider, {
        client: qc,
        children: h(TooltipProvider, {
          children: h(PlayerProvider, { children: [h(Grab, { key: 'grab' }), h(Player, { key: 'player' })] }),
        }),
      }),
    )
  })
  await flush()
}

async function play(items: PlayerItem[] = ITEMS, startAt = 0) {
  await act(async () => api!.play(items, startAt, 'Evening'))
  await flush()
}

async function resize(wide: boolean) {
  await act(async () => {
    mocks.media.wide = wide
    mocks.media.listeners.forEach((notify) => notify())
  })
  await flush()
}

async function click(el: Element | null | undefined) {
  expect(el, 'ელემენტი ვერ მოიძებნა').toBeTruthy()
  await act(async () => (el as HTMLElement).click())
  await flush()
}

const aside = () => document.querySelector<HTMLElement>('aside[data-player]')
const frame = () => document.querySelector<HTMLIFrameElement>('aside[data-player] iframe')
const stageSrc = () => frame()?.getAttribute('src') ?? null
const rows = () => [...document.querySelectorAll<HTMLLIElement>('aside[data-player] ol > li')]
const rowTitles = () => rows().map((li) => li.querySelector('button span.line-clamp-2')?.textContent)
const row = (title: string) => rows().find((li) => li.querySelector('button')?.textContent?.includes(title))
const byLabel = (key: string) => document.querySelector<HTMLElement>(`[aria-label="${i18n.t(key)}"]`)
const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name)

/** რიგის რიგის მენიუდან ერთი პუნქტი (popover პორტალშია — `document`-იდან) */
async function menu(title: string, itemKey: string) {
  await click(row(title)?.querySelector(`[aria-label="${i18n.t('playback.itemActions')}"]`))
  const item = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t(itemKey)))
  await click(item)
}

/** ზუსტად ის, რასაც YouTube-ის ფრეიმი ტრეკის ბოლოს გზავნის */
function endedMessage() {
  return new MessageEvent('message', {
    origin: YT,
    data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }),
  })
}

describe('Player — განლაგება', () => {
  it('ფართო ეკრანზე მარჯვენა პანელია და გვერდს აწვება', async () => {
    mocks.media.wide = true
    await mount()
    await play()

    expect(aside()?.dataset.layout).toBe('side')
    expect(cssVar('--player-w')).toBe(PANEL_WIDTH)
    expect(cssVar('--player-h')).toBe('')
    // რიგის სათაურში — საიდანაა რიგი და სად ვდგავართ
    expect(aside()?.textContent).toContain('Evening')
    expect(stageSrc()?.startsWith(`${YT}/embed/alpha`)).toBe(true)
  })

  it('ვიწრო ეკრანზე ქვედა ზოლია — პანელის ღილაკი არ ჩანს', async () => {
    await mount()
    await play()

    expect(aside()?.dataset.layout).toBe('bar')
    expect(cssVar('--player-h')).toBe('5.5rem')
    expect(cssVar('--player-w')).toBe('')
    expect(byLabel('playback.toSide')).toBeNull()
    expect(byLabel('playback.expand')).toBeTruthy()
    // ზოლზე რიგი ამოსახტომია და თავიდან დახურულია
    expect(rows()).toHaveLength(0)
    await click(byLabel('playback.queue'))
    expect(rowTitles()).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('ზოლად ჩაკეცვა და უკან გაშლა ფრეიმს ადგილზე ტოვებს და არჩევანი ახსოვს', async () => {
    mocks.media.wide = true
    await mount()
    await play()
    const before = frame()
    expect(before).toBeTruthy()

    await click(byLabel('playback.toBar'))
    expect(aside()?.dataset.layout).toBe('bar')
    // ⚠️ 35.3 — იგივე კვანძი: ფრეიმი არ გადაიტვირთა
    expect(frame()).toBe(before)
    expect(localStorage.getItem('player.dock')).toBe('bar')
    expect(cssVar('--player-h')).toBe('5.5rem')
    expect(cssVar('--player-w')).toBe('')

    await click(byLabel('playback.toSide'))
    expect(aside()?.dataset.layout).toBe('side')
    expect(frame()).toBe(before)
    expect(localStorage.getItem('player.dock')).toBe('side')
  })

  it('დამახსოვრებული ზოლი ახალ სესიაშიც ზოლია', async () => {
    localStorage.setItem('player.dock', 'bar')
    mocks.media.wide = true
    await mount()
    await play()

    expect(aside()?.dataset.layout).toBe('bar')
    expect(byLabel('playback.toSide')).toBeTruthy()
  })

  it('ეკრანის გაფართოებაზე ზოლი პანელად იქცევა — ისევ იმავე ფრეიმით', async () => {
    await mount()
    await play()
    const before = frame()
    expect(aside()?.dataset.layout).toBe('bar')

    await resize(true)
    expect(aside()?.dataset.layout).toBe('side')
    expect(frame()).toBe(before)

    await resize(false)
    expect(aside()?.dataset.layout).toBe('bar')
    expect(frame()).toBe(before)
  })

  it('დახურვა ორივე ცვლადს შლის', async () => {
    mocks.media.wide = true
    await mount()
    await play()

    await click(byLabel('playback.close'))
    expect(aside()).toBeNull()
    expect(cssVar('--player-w')).toBe('')
    expect(cssVar('--player-h')).toBe('')
  })
})

describe('Player — რიგი', () => {
  beforeEach(() => {
    mocks.media.wide = true
  })

  it('მიმდინარე და შემდეგი სიტყვით ჩანს', async () => {
    await mount()
    await play()

    expect(rowTitles()).toEqual(['alpha', 'bravo', 'charlie'])
    expect(row('alpha')?.querySelector('button')?.getAttribute('aria-current')).toBe('true')
    expect(row('alpha')?.textContent).toContain(i18n.t('playback.nowPlaying'))
    expect(row('bravo')?.textContent).toContain(i18n.t('playback.upNext'))
    expect(row('charlie')?.textContent).not.toContain(i18n.t('playback.upNext'))
  })

  it('რიგზე დაჭერა იქ გადადის და ჩართვას ითვლის', async () => {
    await mount()
    await play()
    expect(mocks.markSongPlayed).toHaveBeenCalledWith(1)

    await click(row('charlie')?.querySelector('button'))

    expect(stageSrc()?.startsWith(`${YT}/embed/charlie`)).toBe(true)
    expect(row('charlie')?.querySelector('button')?.getAttribute('aria-current')).toBe('true')
    expect(row('alpha')?.querySelector('button')?.getAttribute('aria-current')).toBeNull()
    expect(mocks.markSongPlayed).toHaveBeenLastCalledWith(3)
  })

  it('ტრეკის ბოლოს შემდეგზე გადადის — ორმაგი `ended` ორს არ ახტება', async () => {
    await mount()
    await play()

    await act(async () => {
      window.dispatchEvent(endedMessage())
      window.dispatchEvent(endedMessage())
    })
    await flush()

    expect(stageSrc()?.startsWith(`${YT}/embed/bravo`)).toBe(true)
  })

  it('მიმდინარის ამოღებაზე შემდეგი ირთვება', async () => {
    await mount()
    await play()

    await menu('alpha', 'playback.removeFromQueue')

    expect(rowTitles()).toEqual(['bravo', 'charlie'])
    expect(stageSrc()?.startsWith(`${YT}/embed/bravo`)).toBe(true)
    expect(api!.playing).toBe(true)
  })

  it('ბოლო მიმდინარის ამოღებაზე წინაზე დგება პაუზით — თავიდან არ იწყებს', async () => {
    await mount()
    await play(ITEMS, 2)

    await menu('charlie', 'playback.removeFromQueue')

    expect(rowTitles()).toEqual(['alpha', 'bravo'])
    const src = stageSrc()
    expect(src?.startsWith(`${YT}/embed/bravo`)).toBe(true)
    // ⚠️ ავტოდაკვრის გარეშე — უკვე მოსმენილი თავისით არ უნდა დაიწყოს
    expect(src).not.toContain('autoplay=1')
    expect(api!.playing).toBe(false)
  })

  it('სხვის ამოღება მიმდინარეს არ ეხება', async () => {
    await mount()
    await play()
    const before = frame()

    await menu('charlie', 'playback.removeFromQueue')

    expect(rowTitles()).toEqual(['alpha', 'bravo'])
    expect(frame()).toBe(before)
  })

  it('„ერთით უკან" რიგს ალაგებს და მიმდინარე უცვლელია', async () => {
    await mount()
    await play()
    const before = frame()

    await menu('alpha', 'playback.moveLater')

    expect(rowTitles()).toEqual(['bravo', 'alpha', 'charlie'])
    expect(row('alpha')?.querySelector('button')?.getAttribute('aria-current')).toBe('true')
    // ⚠️ გადალაგება ფრეიმს არ ეხება — ვინც უკრავდა, ისევ უკრავს
    expect(frame()).toBe(before)
    // „შემდეგი" ახალი რიგით ითვლება
    expect(row('charlie')?.textContent).toContain(i18n.t('playback.upNext'))
  })

  it('პირველს „ერთით წინ" არ აქვს, ბოლოს — „ერთით უკან"', async () => {
    await mount()
    await play()

    await click(row('alpha')?.querySelector(`[aria-label="${i18n.t('playback.itemActions')}"]`))
    const labels = () => [...document.querySelectorAll('button')].map((b) => b.textContent ?? '')
    expect(labels().some((l) => l.includes(i18n.t('playback.moveEarlier')))).toBe(false)
    expect(labels().some((l) => l.includes(i18n.t('playback.moveLater')))).toBe(true)
  })
})

/* Tasks §20 — პანელის სიგანე: შენახული, ჭერით ჩაჭრილი, სახელურით გაწეული, ორმაგი დაწკაპუნებით ნაგულისხმევი */
describe('Player — სიგანე (Tasks §20)', () => {
  const handle = () => document.querySelector<HTMLElement>('aside[data-player] [data-resize-handle]')

  it('შენახული სიგანე პანელს ეძლევა, ჭერზე მეტი კი ჭერზე იჭრება', async () => {
    localStorage.setItem('player.width', '500')
    mocks.media.wide = true
    await mount()
    await play()
    expect(cssVar('--player-w')).toBe('500px')

    act(() => root?.unmount())
    localStorage.setItem('player.width', '900')
    await mount()
    await play()
    // ნაგულისხმევი ჭერი 560 px-ია (`settings.playerMaxWidth`)
    expect(cssVar('--player-w')).toBe('560px')
  })

  it('სახელურით გაწევა სიგანეს ცვლის და ინახავს; ორმაგი დაწკაპუნება ნაგულისხმევს აბრუნებს', async () => {
    mocks.media.wide = true
    await mount()
    await play()
    expect(cssVar('--player-w')).toBe(PANEL_WIDTH)
    expect(handle()?.getAttribute('aria-orientation')).toBe('vertical')

    const Pointer = (type: string, clientX: number) =>
      new MouseEvent(type, { bubbles: true, clientX, button: 0 }) as unknown as PointerEvent

    // jsdom-ს ზომები არ აქვს — საწყისი სიგანე მინიმუმია (384); 100 px მარცხნივ → 484
    await act(async () => {
      handle()!.dispatchEvent(Pointer('pointerdown', 800))
    })
    await act(async () => {
      window.dispatchEvent(Pointer('pointermove', 700))
    })
    expect(cssVar('--player-w')).toBe('484px')

    // 300 px მარცხნივ → 684 → ჭერზე (560) იჭრება
    await act(async () => {
      window.dispatchEvent(Pointer('pointermove', 500))
    })
    expect(cssVar('--player-w')).toBe('560px')

    // 200 px მარჯვნივ → 184 → მინიმუმზე (384) იჭრება
    await act(async () => {
      window.dispatchEvent(Pointer('pointermove', 1000))
    })
    expect(cssVar('--player-w')).toBe('384px')
    expect(localStorage.getItem('player.width')).toBe('384')

    await act(async () => {
      window.dispatchEvent(Pointer('pointerup', 1000))
    })
    expect(document.body.style.cursor).toBe('')

    await act(async () => {
      handle()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    await flush()
    expect(cssVar('--player-w')).toBe(PANEL_WIDTH)
    expect(localStorage.getItem('player.width')).toBeNull()
  })
})

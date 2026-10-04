import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Player } from '@/components/Player'
import { PANEL_WIDTH, PlayerProvider, usePlayer, usePlayerAnchor, type PlayerItem } from '@/lib/player'
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

/* ============================================================
   Tasks §48 — ვიდეო ფანჯარაში და მოტივტივე ჩარჩოში; სიმღერის ბუშტი.
   ⚠️ ყოველ გადასვლაში ფრეიმი **იგივე DOM-კვანძია** — დაკვრა არ წყდება.
   ============================================================ */
describe('Player — ფანჯარაში · მოტივტივე · ბუშტი (Tasks §48)', () => {
  function clip(id: number, key: string, href: string | null = null): PlayerItem {
    return { ...song(id, key), kind: 'video', subtitle: null, href }
  }
  const VIDEOS = [clip(11, 'one'), clip(12, 'two')]

  let setOpen: ((open: boolean) => void) | null = null
  let location = ''

  /** ფანჯრის ესკიზი — `VideoDetail`-ის `PlayerSpot`-ის ადგილი */
  function Spot({ id }: { id: number }) {
    const ref = usePlayerAnchor({ kind: 'video', id })
    return h('div', { ref, 'data-spot': id })
  }
  function Window() {
    const [open, set] = useState(true)
    setOpen = set
    return open ? h(Spot, { id: 11 }) : null
  }
  function Where() {
    const at = useLocation()
    location = at.pathname + at.search
    return null
  }

  async function mountWith(extra: ReturnType<typeof h> | null = null) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root!.render(
        h(MemoryRouter, {
          initialEntries: ['/'],
          children: h(QueryClientProvider, {
            client: qc,
            children: h(TooltipProvider, {
              children: h(PlayerProvider, {
                children: [
                  h(Grab, { key: 'grab' }),
                  h(Where, { key: 'where' }),
                  extra && h('div', { key: 'extra' }, extra),
                  h(Player, { key: 'player' }),
                ],
              }),
            }),
          }),
        }),
      )
    })
    await flush()
  }

  /** ესკიზის ადგილი ეკრანზე (jsdom-ს განლაგება არ აქვს) */
  function placeSpot(left: number, top: number, width: number, height: number) {
    const el = document.querySelector<HTMLElement>('[data-spot]')!
    el.getBoundingClientRect = () =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
  }

  /** რამდენიმე კადრი — ესკიზის კოორდინატები `requestAnimationFrame`-ით იწერება */
  async function frames() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }

  const Pointer = (type: string, clientX: number, clientY = 0) =>
    new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 }) as unknown as PointerEvent

  async function pointer(target: Element, from: [number, number], to: [number, number]) {
    await act(async () => {
      target.dispatchEvent(Pointer('pointerdown', ...from))
    })
    await act(async () => {
      window.dispatchEvent(Pointer('pointermove', ...to))
    })
    await act(async () => {
      window.dispatchEvent(Pointer('pointerup', ...to))
    })
    await flush()
  }

  const prop = (name: string) => aside()?.style.getPropertyValue(name) ?? ''

  beforeEach(() => {
    mocks.media.wide = true
    setOpen = null
    location = ''
  })

  it('ვიდეო ფანჯრის ესკიზზე ჯდება; „გატანა“ — მოტივტივე ჩარჩო, „დაბრუნება“ — ისევ ესკიზი, ერთი ფრეიმით', async () => {
    await mountWith(h(Window))
    placeSpot(100, 50, 640, 360)
    await play(VIDEOS)
    await frames()

    expect(aside()?.dataset.layout).toBe('inline')
    expect([prop('--ix'), prop('--iy'), prop('--iw'), prop('--ih'), prop('--ivis')]).toEqual([
      '100px',
      '50px',
      '640px',
      '360px',
      'visible',
    ])
    // ვიდეო გვერდს აღარ აწვება — პანელი ვიდეოზე აღარ გამოიყენება (48.3)
    expect(cssVar('--player-w')).toBe('')
    const before = frame()

    await click(byLabel('playback.popOut'))
    expect(aside()?.dataset.layout).toBe('float')
    expect(frame()).toBe(before)
    expect(prop('--ix')).toBe('')
    // ნაგულისხმევი — მარჯვნივ, ვერტიკალურად შუაში (jsdom: 1024 × 768)
    expect([aside()!.style.left, aside()!.style.top, aside()!.style.width]).toEqual(['640px', '263px', '360px'])

    await click(byLabel('playback.popIn'))
    expect(aside()?.dataset.layout).toBe('inline')
    expect(frame()).toBe(before)
    expect(location).toBe('/')
  })

  it('ფანჯრის დახურვაზე ვიდეო მოტივტივე ჩარჩოში გადადის და არ ჩერდება', async () => {
    await mountWith(h(Window))
    placeSpot(100, 50, 640, 360)
    await play(VIDEOS)
    const before = frame()
    expect(aside()?.dataset.layout).toBe('inline')

    await act(async () => setOpen!(false))
    await flush()
    expect(aside()?.dataset.layout).toBe('float')
    expect(frame()).toBe(before)
    expect(api!.playing).toBe(true)
  })

  it('რიგში შემდეგი ვიდეო — ფანჯარა წინას აჩვენებს — მოტივტივე ჩარჩოში უკრავს', async () => {
    await mountWith(h(Window))
    await play(VIDEOS)
    expect(aside()?.dataset.layout).toBe('inline')

    await act(async () => api!.next())
    await flush()
    expect(api!.current?.id).toBe(12)
    expect(aside()?.dataset.layout).toBe('float')
  })

  it('მოტივტივე ჩარჩო გადაითრევა, ეკრანიდან ვერ გადის და ადგილი ახსოვს', async () => {
    await mountWith()
    await play(VIDEOS)
    expect(aside()?.dataset.layout).toBe('float')

    await pointer(document.querySelector('[data-frame-move]')!, [700, 300], [1500, 2000])
    // 1024 − 360 − 12 = 652; 768 − (203 + 40) − 12 = 513
    expect([aside()!.style.left, aside()!.style.top]).toEqual(['652px', '513px'])
    expect(JSON.parse(localStorage.getItem('player.frame')!)).toEqual({ x: 652, y: 513, w: 360 })

    act(() => root?.unmount())
    await mountWith()
    await play(VIDEOS)
    expect([aside()!.style.left, aside()!.style.top]).toEqual(['652px', '513px'])
  })

  it('ზომა კუთხით იცვლება — მარჯვნივ მდგარს სახელური მარცხნივ აქვს და მარჯვენა კიდე ადგილზე რჩება', async () => {
    await mountWith()
    await play(VIDEOS)
    const grip = document.querySelector('[data-frame-resize]')!
    // მარცხენა სახელური ზოლში პირველია
    expect(grip.parentElement?.firstElementChild).toBe(grip)

    await pointer(grip, [640, 500], [540, 500])
    expect([aside()!.style.left, aside()!.style.width]).toEqual(['540px', '460px'])
    expect(JSON.parse(localStorage.getItem('player.frame')!)).toEqual({ x: 540, y: 263, w: 460 })
  })

  it('ვიწრო ეკრანზე ვიდეო მოტივტივე ჩარჩოს ნაცვლად ქვედა ზოლად უკრავს', async () => {
    mocks.media.wide = false
    await mountWith()
    await play(VIDEOS)
    expect(aside()?.dataset.layout).toBe('bar')
    expect(cssVar('--player-h')).toBe('5.5rem')
  })

  it('მოტივტივე ჩარჩო კამათლის კუთხეს თუ ფარავს, კამათელი მის ზემოთ ადის', async () => {
    await mountWith()
    await play(VIDEOS)
    expect(cssVar('--player-lift')).toBe('')

    await pointer(document.querySelector('[data-frame-move]')!, [700, 300], [1500, 2000])
    // 768 − 513 + 8 − 24
    expect(cssVar('--player-lift')).toBe('239px')

    await click(byLabel('playback.close'))
    expect(cssVar('--player-lift')).toBe('')
  })

  it('დახურული ფანჯრის ვიდეოს „ფანჯარაში დაბრუნება“ ფანჯარას ბმულით ხსნის', async () => {
    await mountWith()
    await play([clip(11, 'one', '/videos?open=11')])
    expect(aside()?.dataset.layout).toBe('float')

    await click(byLabel('playback.popIn'))
    expect(location).toBe('/videos?open=11')
    expect(api!.popped).toBe(false)
  })

  it('სიმღერა ბუშტად იკეცება — იგივე ფრეიმი, გვერდს აღარ აწვება; დაჭერით პანელი ბრუნდება', async () => {
    await mountWith()
    await play()
    expect(aside()?.dataset.layout).toBe('side')
    const before = frame()

    await click(byLabel('playback.toBubble'))
    expect(aside()?.dataset.layout).toBe('bubble')
    expect(frame()).toBe(before)
    expect(cssVar('--player-w')).toBe('')
    expect(cssVar('--player-h')).toBe('')

    await click(document.querySelector('[data-bubble]'))
    expect(aside()?.dataset.layout).toBe('side')
    expect(frame()).toBe(before)
  })

  it('ბუშტი გადაითრევა და უახლოეს კიდეს ეკვრის; ადგილი ახსოვს', async () => {
    await mountWith()
    await play()
    await click(byLabel('playback.toBubble'))
    // ნაგულისხმევი: მარჯვნივ, 768 × 0.55 ≈ 422
    expect([aside()!.style.right, aside()!.style.top]).toEqual(['12px', '422px'])

    await pointer(document.querySelector('[data-bubble]')!, [990, 450], [100, 350])
    expect(api!.bubbled).toBe(true)
    expect([aside()!.style.left, aside()!.style.top]).toEqual(['12px', '322px'])
    expect(JSON.parse(localStorage.getItem('player.bubble')!)).toEqual({ side: 'left', y: 322 })
  })

  it('ბუშტის რგოლი დაკვრის ადგილს აჩვენებს (YouTube-ის `currentTime`)', async () => {
    await mountWith()
    await play()
    await click(byLabel('playback.toBubble'))
    expect(document.querySelector('[data-bubble] [data-progress]')).toBeNull()

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: YT, data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 50 } }) }),
      )
    })
    // ხანგრძლივობა ბაზიდანაა (200 წმ) — YouTube მას იშვიათად აგზავნის
    expect(document.querySelector('[data-bubble] [data-progress]')?.getAttribute('data-progress')).toBe('0.250')
  })
})

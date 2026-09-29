import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PublicCard, PublicPlaylistPage } from '@/api/publicProfile'
import '@/i18n'

/* ============================================================
   საჯარო ფლეილისტის ფანჯარა (Tasks §33.2).

   ⚠️ აქ მოწმდება ის, რასაც backend-ის ტესტი ვერ ხედავს: **ეკრანზე რიგი
   სერვერისაა**, დასაკრავი სიმღერა `PlayerStage`-ის სცენაში ჩაირთვება, ხოლო
   ჩაუშენებელი (`platform: other`) წყაროზე მიდის და შავ ყუთს არ ხატავს.

   ⚠️ **ავტომატური გადასვლა ფრეიმის `message`-ით მოწმდება** — ზუსტად ის
   შეტყობინება, რასაც YouTube გზავნის (`infoDelivery`, `playerState: 0`),
   ფრეიმის `origin`-ით. YouTube `ended`-ს ზოგჯერ ორჯერ აგზავნის — ორი
   შეტყობინება ორ ტრეკს არ უნდა გადაახტეს.
   ============================================================ */

const mocks = vi.hoisted(() => ({ fetchPublicPlaylist: vi.fn() }))

vi.mock('@/api/publicProfile', async (original) => ({
  ...(await original<typeof import('@/api/publicProfile')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** ⚠️ allowlist-ის ჰოსტი — `www.youtube.com` `lib/embed.ts`-ში დაშვებული არაა */
const YT = 'https://www.youtube-nocookie.com'

function song(id: number, title: string, extra: Partial<PublicCard> = {}): PublicCard {
  const key = title.toLowerCase()
  return {
    id,
    domain: 'song',
    title_en: title,
    subtitle: `${title} artist`,
    year: 2001,
    image: null,
    rating: null,
    url: `https://youtu.be/${key}`,
    platform: 'youtube',
    embed_url: `${YT}/embed/${key}`,
    duration: 215,
    ...extra,
  }
}

const playlist: PublicCard = { id: 12, domain: 'playlist', title_en: 'Evening', songs_count: 3 }

function page(data: PublicCard[], current = 1, last = 1, total = data.length): PublicPlaylistPage {
  return {
    playlist,
    data,
    meta: { current_page: current, last_page: last, per_page: 100, total },
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  mocks.fetchPublicPlaylist.mockResolvedValue(
    page([
      song(1, 'Charlie'),
      // ჩაუშენებელი წყარო — წყაროზე მიდის, სცენაში არ ჩაირთვება
      song(2, 'Offsite', { platform: 'other', embed_url: null, url: 'https://example.com/offsite' }),
      song(3, 'Alpha'),
    ]),
  )
})

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
  const { PublicPlaylistDialog } = await import('@/components/PublicPlaylistDialog')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(TooltipProvider, null, h(PublicPlaylistDialog, { username: 'alice', playlist, onClose: () => {} })),
      ),
    )
  })

  // ⚠️ ერთი `act` არ კმარა: react-query-ის პასუხი მომდევნო tick-ზე ჯდება
  await flush()
  await flush()
}

/** სიის რიგების სათაურები — ფანჯარა პორტალშია, ამიტომ `document`-იდან */
const rowTitles = () =>
  [...document.querySelectorAll('ol li')].map((li) => li.querySelector('.font-medium')?.textContent)

const rowButton = (title: string) =>
  [...document.querySelectorAll('ol li button')].find((b) => b.textContent?.includes(title)) as
    | HTMLButtonElement
    | undefined

const stageSrc = () => document.querySelector('iframe')?.getAttribute('src') ?? null

async function click(el: Element | undefined | null) {
  expect(el, 'ელემენტი ვერ მოიძებნა').toBeTruthy()
  await act(async () => (el as HTMLElement).click())
  await flush()
}

/** ზუსტად ის, რასაც YouTube-ის ფრეიმი ტრეკის ბოლოს გზავნის */
async function youtubeEnded() {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: YT,
        data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }),
      }),
    )
  })
  await flush()
}

describe('PublicPlaylistDialog', () => {
  it('სიმღერებს სერვერის რიგით ხატავს — სახელით, შემსრულებლით და ხანგრძლივობით', async () => {
    await mount()

    expect(mocks.fetchPublicPlaylist).toHaveBeenCalledWith('alice', 12, 1)
    expect(rowTitles()).toEqual(['Charlie', 'Offsite', 'Alpha'])
    expect(document.body.textContent).toContain('Charlie artist')
    expect(document.body.textContent).toContain('3:35')
    // სანამ არაფერი ჩაირთო, სცენა არ ჩანს
    expect(stageSrc()).toBeNull()
  })

  it('დასაკრავი სიმღერა სცენაში ჩაირთვება, ჩაუშენებელი კი წყაროზე მიდის', async () => {
    await mount()

    await click(rowButton('Alpha'))

    const src = stageSrc()
    expect(src?.startsWith(`${YT}/embed/alpha`)).toBe(true)
    expect(src).toContain('autoplay=1')

    const offsite = rowButton('Offsite')
    expect(offsite?.disabled).toBe(true)
    const link = offsite?.closest('li')?.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/offsite')
    expect(link?.getAttribute('target')).toBe('_blank')
  })

  it('„ყველას დაკვრა“ პირველი დასაკრავიდან იწყებს', async () => {
    await mount()

    const playAll = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('ყველას დაკვრა'),
    )
    await click(playAll)

    expect(stageSrc()?.startsWith(`${YT}/embed/charlie`)).toBe(true)
  })

  it('ტრეკის ბოლოს შემდეგ დასაკრავზე გადადის — ორმაგი `ended` ორს არ ახტება', async () => {
    /* ⚠️ „Delta“ სიის ბოლოს განზრახაა: მის გარეშე ორ ტრეკზე გადახტომა სიის
       ბოლოს შეეჯახებოდა და „Alpha“-ზე გაჩერდებოდა — ტესტი ცარიელად გაივლიდა. */
    mocks.fetchPublicPlaylist.mockResolvedValue(
      page([
        song(1, 'Charlie'),
        song(2, 'Offsite', { platform: 'other', embed_url: null, url: 'https://example.com/offsite' }),
        song(3, 'Alpha'),
        song(4, 'Delta'),
      ]),
    )
    await mount()

    await click(rowButton('Charlie'))
    expect(stageSrc()?.startsWith(`${YT}/embed/charlie`)).toBe(true)

    // ⚠️ ერთი და იგივე `ended` ორჯერ — ერთ ტრეკს ერთი გადასვლა ეკუთვნის
    await act(async () => {
      for (let i = 0; i < 2; i++) {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: YT,
            data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }),
          }),
        )
      }
    })
    await flush()

    // ჩაუშენებელი „Offsite“ გამოტოვებულია, ე.ი. შემდეგი „Alpha“-ა — და არა სიის ბოლო
    expect(stageSrc()?.startsWith(`${YT}/embed/alpha`)).toBe(true)
  })

  it('უცხო `origin`-ის შეტყობინება ტრეკს არ ცვლის', async () => {
    await mount()

    await click(rowButton('Charlie'))
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }),
        }),
      )
    })
    await flush()

    expect(stageSrc()?.startsWith(`${YT}/embed/charlie`)).toBe(true)
  })

  it('ჩატვირთული ნაწილის ბოლოს შემდეგ გვერდს იღებს და დაკვრა გრძელდება', async () => {
    mocks.fetchPublicPlaylist.mockImplementation(async (_u: string, _id: number, pageNo: number) =>
      pageNo === 1 ? page([song(1, 'Charlie')], 1, 2, 2) : page([song(9, 'Zulu')], 2, 2, 2),
    )

    await mount()
    await click(rowButton('Charlie'))
    await youtubeEnded()
    await flush()

    expect(mocks.fetchPublicPlaylist).toHaveBeenCalledWith('alice', 12, 2)
    expect(stageSrc()?.startsWith(`${YT}/embed/zulu`)).toBe(true)
  })

  it('ბოლო სიმღერის შემდეგ ჩერდება და სცენა ადგილზე რჩება', async () => {
    await mount()

    await click(rowButton('Alpha'))
    await youtubeEnded()

    expect(stageSrc()?.startsWith(`${YT}/embed/alpha`)).toBe(true)
    expect(mocks.fetchPublicPlaylist).toHaveBeenCalledTimes(1)
  })

  it('ცარიელი ფლეილისტი და 404 ორ სხვადასხვა რამეს ამბობს', async () => {
    mocks.fetchPublicPlaylist.mockResolvedValue(page([]))
    await mount()
    expect(document.body.textContent).toContain('სიმღერა ჯერ არ არის დამატებული.')

    act(() => root?.unmount())
    container?.remove()

    mocks.fetchPublicPlaylist.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    await mount()
    expect(document.body.textContent).toContain('პლეილისტი ვერ მოიძებნა')
  })
})

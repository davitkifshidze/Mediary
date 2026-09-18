import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **ყოველი გახსნილი blob მთელ ბადეს თავიდან ხატავდა** (Tasks PERF-13).

   `resolved` state-ში იყო და ყოველი უჯრის `onResolved` მთელ რუკას
   კლონავდა, ე.ი. N უჯრა = N სრული `PhotoGrid` რენდერი (და `slides` memo-ს
   N გადათვლა). PERF-09-თან ერთად ეს კვადრატულად იზრდებოდა.

   ⚠️ რუკა რენდერისთვის საერთოდ არ იყო საჭირო: უჯრა თავის მისამართს
   თვითონ იღებს, რუკას კი მხოლოდ ლაითბოქსი და ჩამოტვირთვა კითხულობს.
   ============================================================ */

/**
 * ყოველი უჯრა **თავის** tick-ზე წამოვა.
 *
 * ⚠️ ერთ tick-ზე გაშვება ტესტს უაზროდ გაატარებდა: React ერთ ამოცანაში
 * მოხვედრილ `setState`-ებს **აბატჩავს**, ე.ი. გატეხილი კოდიც ერთ
 * რენდერს დახატავდა. ნამდვილ ბადეში კი თითოეული blob ცალკე ქსელური
 * პასუხია — ზუსტად ეს მოდელდება დაშორებული ტაიმერებით.
 */
/** უჯრის რენდერების მრიცხველი — hook ყოველ რენდერზე ზუსტად ერთხელ იძახება */
const tileRenders = { count: 0 }

/**
 * **ბადის საკუთარი რენდერების მრიცხველი.**
 *
 * ⚠️ უჯრების რიცხვი ამას ვერ იტყვის: მასში თითოეული უჯრის **საკუთარი**
 * განახლებაც შედის (blob მოვიდა), ე.ი. გატეხილი და გასწორებული კოდი
 * მხოლოდ 4N-სა და 3N-ით სხვაობდა. `NumberPick` კი ხელსაწყოთა ზოლშია და
 * მხოლოდ მაშინ იხატება, როცა **`PhotoGrid` თვითონ** გადაიხატება.
 */
const gridRenders = { count: 0 }

vi.mock('@/components/ui/number-pick', () => ({
  NumberPick: () => {
    gridRenders.count++

    return null
  },
}))

/* ⚠️ ფაბრიკა **ასინქრონულია და `await import('react')`-ს იყენებს**: `vi.mock`
   ზემოთ აიწევა, ე.ი. ფაილის თავში დაწერილი იმპორტი აქ საიმედო არაა, `require`
   კი ბრაუზერის კონფიგში საერთოდ არ არსებობს (`tsc` სწორედ ამას იჭერს). */
vi.mock('@/components/PrivateFile', async () => {
  const React = await import('react')

  return {
    fetchPrivateObjectUrl: vi.fn(),
    usePrivateFileUrl: (url: string | null | undefined) => {
      tileRenders.count++
      const [ready, setReady] = React.useState<string | null>(null)

      React.useEffect(() => {
        if (!url) return
        const nth = Number(url.split('/').pop()) || 1
        const timer = setTimeout(() => setReady(`blob:${url}`), nth * 5)

        return () => clearTimeout(timer)
      }, [url])

      return { url: ready, failed: false }
    },
  }
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ lightbox და context-menu მძიმე მოდულებია — DEBT-12-ის გაკვეთილი
beforeAll(async () => {
  await import('@/components/ui/photo-grid')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

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

const TILES = 24

describe('PhotoGrid — PERF-13', () => {
  it('does not re-render the grid once per resolved tile', async () => {
    const { PhotoGrid } = await import('@/components/ui/photo-grid')

    const items = Array.from({ length: TILES }, (_, i) => ({
      id: i + 1,
      src: `/note-files/${i + 1}`,
      title: `photo ${i + 1}`,
    }))

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(h(TooltipProvider, null, h(PhotoGrid, { items, privateDisk: true, pageSize: 0 })))
    })

    /* ⚠️ **თითო ტაიმერი ცალკე `act`-ში** და არა ერთ გრძელ ლოდინში: ერთ
       `act`-ში React ყველა განახლებას აბატჩავს, ე.ი. გატეხილი კოდიც
       თითქმის ერთ რენდერს დახატავდა და ტესტი ვერაფერს გაარჩევდა.
       ნამდვილ ბადეში კი თითოეული blob ცალკე ქსელური პასუხია. */
    for (let i = 0; i <= TILES; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 6))
      })
    }

    /* ⚠️ **უჯრების რენდერები ითვლება და არა მშობლისა**: `PhotoGrid`-ის
       შიდა `setState` მშობელს არ ეხება, ე.ი. გარეთა მრიცხველი ვერაფერს
       დაიჭერდა (პირველი ვერსია სწორედ ამიტომ გადიოდა მუტაციაზეც).

       ⚠️ სწორედ აქაა კვადრატული ხარჯი: ბადის ყოველი გადახატვა **ყველა**
       უჯრას ხატავს, ე.ი. გატეხილზე ~N×N. ზღვარი `3 × N`-ია — გასწორებულზე
       ~2N გამოდის (ჩამაგრება + თითო უჯრის საკუთარი განახლება), გატეხილზე
       კი ათჯერ მეტი; ე.ი. ტესტი ბატჩინგის ზუსტ დეტალებზე არ დგას. */
    expect(TILES).toBeGreaterThan(4)

    /* ⚠️ სწორედ ესაა მიღების კრიტერიუმი: **N უჯრის გახსნა ბადეს ორზე მეტჯერ
       არ ხატავს**. გატეხილზე თითო მისამართი თითო რენდერია, ე.ი. ~N+1. */
    expect(gridRenders.count, `grid renders = ${gridRenders.count}`).toBeLessThanOrEqual(2)

    // უჯრები კი თითო-თითოჯერ განახლდნენ — ე.ი. მისამართები მართლა მოვიდა
    expect(tileRenders.count, `tile renders = ${tileRenders.count}`).toBeLessThanOrEqual(TILES * 3)

    // და ფოტოები მართლა გამოჩნდა — თორემ „არ გადაიხატა" ცარიელ ბადესაც ნიშნავს
    expect(container.querySelectorAll('img').length).toBe(TILES)
  })

  /**
   * **ლაითბოქსი ref-იდან იღებს მისამართებს** — გასწორების მეორე ნახევარი.
   *
   * ⚠️ ეს ტესტი უამისოდ არ იქნებოდა სრული: „ბადე აღარ გადაიხატება" იმ
   * შემთხვევაშიც მართალია, თუ გახსნილი ხედი საერთოდ ცარიელი დარჩა. სწორედ
   * ეს იყო ref-ზე გადასვლის ერთადერთი რეალური რისკი.
   */
  it('still hands the resolved url to the lightbox', async () => {
    const { PhotoGrid } = await import('@/components/ui/photo-grid')

    const items = [{ id: 1, src: '/note-files/1', title: 'photo 1' }]

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(h(TooltipProvider, null, h(PhotoGrid, { items, privateDisk: true, pageSize: 0 })))
    })
    await flush()
    await flush()

    const tile = container.querySelector('img')
    expect(tile, 'უჯრა ვერ დაიხატა').toBeTruthy()

    await act(async () => {
      tile!.closest('button')?.click()
    })
    await flush()

    const slides = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'))

    // ⚠️ ბადის უჯრის გარდა გახსნილ ხედშიც უნდა იდგეს იგივე blob
    expect(slides.filter((src) => src === 'blob:/note-files/1').length).toBeGreaterThan(1)
  })
})

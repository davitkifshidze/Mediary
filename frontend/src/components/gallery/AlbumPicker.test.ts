import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GalleryAlbum } from '@/api/gallery'
import '@/i18n'

/* ============================================================
   ალბომის ამრჩევი — **ლოკი იქვე (Tasks §17.2)**.

   შენი სიტყვები: „ალბომის ჩაკეტვაც — სრული ფუნქციონალი". ამრჩევი
   გადატანის ფანჯარაშია — მსახიობის გვერდიდანაც —, ე.ი. აქ მოწმდება
   სამი რამ, რასაც სხვა ვერაფერი ხედავს:

   1. ადგილზე შექმნილ ალბომს **პაროლი მართლა მიჰყვება** — და მოკლე ან
      არაემთხვევი პაროლი ღილაკს თიშავს, სერვერის toast-ის მოლოდინის გარეშე;
   2. ამ სესიაში გახსნილ ჩაკეტილ ალბომს **სხვა ტექსტი და „ჩაკეტვა" აქვს** —
      პაროლით ახლად შექმნილი ალბომი სწორედ ასეთია, და „მაშინვე დაიმალება"
      იქ ტყუილი იქნებოდა;
   3. არჩეული ალბომის პარამეტრები **აქედანვე** იხსნება.
   ============================================================ */

const album = (over: Partial<GalleryAlbum>): GalleryAlbum => ({
  id: 7,
  name: 'ოჯახი',
  description: null,
  sort_order: 1,
  photos: 2,
  locked: false,
  unlocked: false,
  visibility: 'private',
  ...over,
})

const PLAIN = album({})
/** პაროლი ადევს, მაგრამ ამ სესიაში გაიხსნა (ან ახლახან შეიქმნა) */
const OPEN = album({ id: 8, name: 'პირადი', locked: true, unlocked: true })
/** პაროლი ადევს და დახურულია */
const SHUT = album({ id: 9, name: 'საიდუმლო', locked: true, unlocked: false })

const mocks = vi.hoisted(() => ({
  fetchGalleryAlbums: vi.fn(),
  createGalleryAlbum: vi.fn(),
  lockGalleryAlbum: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  ...mocks,
}))

function reset() {
  mocks.fetchGalleryAlbums.mockResolvedValue([PLAIN, OPEN, SHUT])
  mocks.createGalleryAlbum.mockResolvedValue(album({ id: 42, name: 'ახალი', locked: true, unlocked: true }))
  mocks.lockGalleryAlbum.mockResolvedValue({ ...OPEN, unlocked: false })
}
reset()

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* ⚠️ jsdom-ს `ResizeObserver` არ აქვს, ალბომის ფანჯრის ხილვადობის `Switch`-ს
   კი (Radix-ის `useSize`) ის სჭირდება — დაცვის გარეშე ფანჯარა ტესტში არ
   იხსნებოდა. ზომა აქ არაფერს ამოწმებს, ამიტომ ცარიელი ჩანაცვლება კმარა. */
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
const picked: string[] = []

beforeAll(async () => {
  await import('@/components/gallery/AlbumPicker')
}, 60_000)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  picked.length = 0
  vi.clearAllMocks()
  reset()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(initial = '') {
  const { AlbumPicker } = await import('@/components/gallery/AlbumPicker')

  /** ამრჩევი მართულია — მდგომარეობას გადატანის ფანჯარა ინახავს */
  function Harness() {
    const [value, setValue] = useState(initial)

    return h(AlbumPicker, {
      value,
      onChange: (next: string) => {
        picked.push(next)
        setValue(next)
      },
    })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(Harness))))
  })
  await flush()

  return container
}

function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text)) as
    | HTMLButtonElement
    | undefined
}

async function click(element: Element | null | undefined) {
  expect(element, 'ელემენტი ვერ მოიძებნა').toBeTruthy()
  await act(async () => (element as HTMLElement).click())
  await flush()
}

/** React-ის მართულ ველს მნიშვნელობა native setter-ით უნდა მიეცეს */
async function type(input: Element | null, value: string) {
  expect(input, 'ველი ვერ მოიძებნა').toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function openDraft(node: HTMLElement, name: string) {
  const i18n = (await import('@/i18n')).default

  await click(button(node, i18n.t('gallery.albumNew')))
  await type(node.querySelector(`input[aria-label="${i18n.t('gallery.albumName')}"]`), name)

  return i18n
}

describe('AlbumPicker — ადგილზე შექმნა პაროლით (§17.2)', () => {
  it('ჩართული ლოკი პაროლს სერვერამდე მიიტანს და ახალ ალბომს მაშინვე ირჩევს', async () => {
    const node = await mount()
    const i18n = await openDraft(node, 'ახალი')

    await click(node.querySelector('[role="checkbox"]'))
    await type(node.querySelector('#album-picker-password'), 'secret1')
    await type(node.querySelector('#album-picker-repeat'), 'secret1')

    await click(button(node, i18n.t('gallery.albumCreate')))

    expect(mocks.createGalleryAlbum).toHaveBeenCalledWith({ name: 'ახალი', password: 'secret1' })
    // ⚠️ სწორედ ამიტომ შეიქმნა — გადატანა ახლა მასში წავა
    expect(picked).toEqual(['42'])
  })

  it('ლოკის გარეშე პაროლი საერთოდ არ იგზავნება; Enter ქმნის', async () => {
    const node = await mount()
    await openDraft(node, 'მოგზაურობა')

    const input = node.querySelector('input') as HTMLInputElement
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await flush()

    expect(mocks.createGalleryAlbum).toHaveBeenCalledTimes(1)
    const body = mocks.createGalleryAlbum.mock.calls[0][0]
    expect(body).toEqual({ name: 'მოგზაურობა' })
    expect('password' in body).toBe(false)
  })

  it('ცარიელი, მოკლე ან არაემთხვევი პაროლი შექმნას თიშავს და მიზეზს ამბობს', async () => {
    const node = await mount()
    const i18n = await openDraft(node, 'ახალი')
    const create = () => button(node, i18n.t('gallery.albumCreate'))

    await click(node.querySelector('[role="checkbox"]'))
    // ⚠️ უპაროლო „ჩაკეტილი" ალბომი ტყუილი იქნებოდა
    expect(create()?.disabled).toBe(true)

    await type(node.querySelector('#album-picker-password'), 'abc')
    expect(node.textContent).toContain(i18n.t('gallery.albumPasswordShort', { min: 4 }))
    expect(create()?.disabled).toBe(true)

    await type(node.querySelector('#album-picker-password'), 'secret1')
    await type(node.querySelector('#album-picker-repeat'), 'secret2')
    expect(node.textContent).toContain(i18n.t('gallery.albumPasswordMismatch'))
    expect(create()?.disabled).toBe(true)

    await type(node.querySelector('#album-picker-repeat'), 'secret1')
    expect(create()?.disabled).toBe(false)
    expect(mocks.createGalleryAlbum).not.toHaveBeenCalled()
  })
})

describe('AlbumPicker — ჩაკეტილი ალბომის ორი მდგომარეობა', () => {
  it('ამ სესიაში გახსნილს თავისი ტექსტი და „ჩაკეტვა" აქვს', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mount(String(OPEN.id))

    expect(node.textContent).toContain(i18n.t('gallery.albumOpenMoveHint'))
    expect(node.textContent).not.toContain(i18n.t('gallery.albumLockedMoveHint'))

    await click(button(node, i18n.t('gallery.albumRelock')))
    expect(mocks.lockGalleryAlbum).toHaveBeenCalledWith(OPEN.id)
  })

  it('დახურულზე ფოტო მაშინვე იმალება — და ჩასაკეტი აღარაფერია', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mount(String(SHUT.id))

    expect(node.textContent).toContain(i18n.t('gallery.albumLockedMoveHint'))
    expect(button(node, i18n.t('gallery.albumRelock'))).toBeUndefined()
  })
})

describe('AlbumPicker — ალბომის პარამეტრები აქედანვე', () => {
  it('არჩეული ალბომის რედაქტირება მის ფანჯარას ხსნის', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mount()

    // ⚠️ სანამ ალბომი არ აირჩიე, რედაქტირება არაფერს ეხება
    expect(button(node, i18n.t('gallery.albumEdit'))).toBeUndefined()

    await click(button(node, PLAIN.name))
    await click(button(node, i18n.t('gallery.albumEdit')))

    const shell = [...document.querySelectorAll('[role="dialog"]')].at(-1)
    expect(shell?.textContent).toContain(i18n.t('gallery.albumEdit'))
    expect((document.getElementById('album-name') as HTMLInputElement | null)?.value).toBe(PLAIN.name)
  })
})

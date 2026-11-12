import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **ჩაკეტილ ალბომში შესვლა ბლარიან ბადეს უნდა აჩვენებდეს**.

   შენი სიტყვები (2026-09-20): „პრაივეით ალბომები არ ჩანს — ფოტოები
   ბლარი უნდა ედებოდეს და თუ დააჭერ და პაროლს შეიყვან, მერე ჩანდეს".

   ⚠️ **ხარვეზი ის იყო, რომ ბლარიან ბადემდე მისასვლელი გზა გადაკეტილი
   იყო.** `lockedPhotos()` (backend), `GroupPhotos`-ის `locked`
   შტო და `LockedPhotos` სამივე დაწერილი და გამართული იყო — მაგრამ
   ბარათის `onClick` ჩაკეტილზე პირდაპირ პაროლის ფანჯარას ხსნიდა და
   ჯგუფში საერთოდ არ შეგიშვებდა. ის კოდი იმ დროიდან დარჩა, როცა
   სერვერი მართლა **423**-ს აბრუნებდა და ცარიელი ბადე „ფოტო არ არის"-ად
   იკითხებოდა; მას შემდეგ პასუხი შეიცვალა, დაჭერა კი — არა.

   ⚠️ **ამას ვერც `tsc` ხედავს, ვერც lint და ვერც სუფთა ფუნქციის ტესტი**:
   ორივე გზა სინტაქსურად სწორია და ორივე რაღაცას ხსნის. ერთადერთი, რაც
   განასხვავებს, არის რა დაიხატა ეკრანზე — ამიტომ არსებობს ეს ფაილი
   (`GroupsCut.test.ts`-ის ზუსტი მიზეზი).

   რეგრესია: **პაროლის დადება ბარათის მენიუდან**. ლოკი მხოლოდ „რედაქტირების"
   ფანჯარაში იყო, მენიუში კი მხოლოდ უკვე ჩაკეტილის პუნქტები (გახსნა · ისევ
   ჩაკეტვა) — პაროლმოხსნილ ალბომს ხელახლა ვერ კეტავდი. ახლა ბარათს იგივე
   პუნქტები აქვს, რაც ფილმსა და მსახიობს: უპაროლოზე „ჩაკეტვა", პაროლიანზე
   „პაროლი"; ორივე ალბომის ფანჯარას მხოლოდ ლოკის ბლოკით ხსნის.
   ============================================================ */

const album = {
  id: 3,
  name: 'პირადი',
  description: null,
  visibility: 'private' as const,
  sort_order: 1,
  photos: 4,
  bytes: 2048,
  locked: true,
  unlocked: false,
}

const group = { id: 3, title: 'პირადი', photos: 4, bytes: 2048, locked: true, unlocked: false }

/** ჩაკეტილი ალბომის პასუხი — `path` არასდროს მოდის, მხოლოდ ზომები */
const lockedPage = {
  locked: true as const,
  album: { id: 3, name: 'პირადი' },
  data: [
    { id: 11, width: 800, height: 600, locked: true as const },
    { id: 12, width: 600, height: 800, locked: true as const },
  ],
  meta: { page: 1, per_page: 24, total: 4, last_page: 1 },
}

/** ალბომის მდგომარეობა ტესტიდან იცვლება — უპაროლო · ჩაკეტილი · ამ სესიაში გახსნილი */
const state = vi.hoisted(() => ({
  lock: { locked: true, unlocked: false },
  update: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryAlbums: vi.fn(async () => [{ ...album, ...state.lock }]),
  // ⚠️ ჩაკეტილ ალბომს ესკიზი არ აქვს — ერთი `path`-იც კი ფოტოს გაამხელდა
  fetchGalleryGroups: vi.fn(async () => ({ groups: [{ ...group, ...state.lock }], previews: {} })),
  fetchGalleryPhotos: vi.fn(async () => lockedPage),
  updateGalleryAlbum: state.update,
}))

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  state.lock = { locked: true, unlocked: false }
  state.update.mockReset()
  state.update.mockResolvedValue({ ...album })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

/** ქსელური პასუხების ჩამოჯდომა — ერთი `act` არ კმარა */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mountAlbumsCut() {
  const { AlbumsCut } = await import('@/components/gallery/AlbumsCut')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, null, h(TooltipProvider, null, h(AlbumsCut, {}))),
      ),
    )
  })

  await flush()

  return container
}

function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

/** `⋯` მენიუს გახსნა — პუნქტები პორტალშია (`document.body`) */
async function openMenu(node: ParentNode, label: string) {
  const trigger = node.querySelector<HTMLButtonElement>(`[data-testid="stack-actions"] button[aria-label="${label}"]`)!
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    trigger.click()
  })
  await flush()

  // მენიუს პუნქტი ერთადერთი ღილაკია, რომელიც ბარათის გარეთ იხატება
  return [...document.body.querySelectorAll('button')]
    .filter((b) => !node.contains(b))
    .map((b) => (b.textContent ?? '').trim())
}

/** ⚠️ „გახსნა" ორი პუნქტის წარწერაა — ბარათის გახსნა და პაროლით გახსნა; მეორე მხოლოდ დაუხსნელზეა */
const count = (items: string[], text: string) => items.filter((item) => item === text).length

const menuItem = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => !container!.contains(b) && (b.textContent ?? '').trim() === text)!

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('AlbumsCut', () => {
  /* „ალბომებში პატარა ზომისაა ღილაკები… ვერ ეტევა" — სამი `h-9` ღილაკი ტექსტით + ⋯,
     ჩაკეტვა/განბლოკვა და ფოტოების წაშლა კი მენიუშია */
  it('the album card has open, edit and delete as full buttons and the rest in ⋯', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mountAlbumsCut()

    const row = node.querySelector('[data-testid="stack-actions"]')!
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).toEqual([i18n.t('actions.open'), i18n.t('actions.edit'), i18n.t('confirm.delete'), ''])
    for (const btn of row.querySelectorAll('button')) {
      expect(btn.className).not.toContain('h-7')
    }
    // განბლოკვა ზოლში აღარ არის — მენიუშია
    expect(row.querySelector('.lucide-lock-open')).toBeNull()
  })

  it('ჩაკეტილ ალბომში შესვლა ბლარიან ფილებს ხატავს და პაროლს იქვე ითხოვს', async () => {
    const node = await mountAlbumsCut()

    const card = button(node, 'პირადი')
    expect(card, 'ალბომის ბარათი უნდა დაიხატოს').toBeTruthy()

    await act(async () => card!.click())
    await flush()

    /* ⚠️ სწორედ აქ ჩერდებოდა: ბარათი პაროლის ფანჯარას ხსნიდა და ჯგუფში
       არ შეგიშვებდა, ე.ი. ბლარიან ბადეს ვერასდროს ნახავდი. */
    const tiles = node.querySelectorAll('img[src="/locked-photo.svg"]')
    expect(tiles.length, 'ყველა ჩაკეტილ ფოტოს ბლარის ფილა უნდა ედოს').toBe(2)

    expect(button(node, 'გახსნა'), 'პაროლის ღილაკი ბადესთან ერთად უნდა იყოს').toBeTruthy()
  })

  it('ბლარიან ბადეში ნამდვილი ფაილის მისამართი არ არსებობს', async () => {
    const node = await mountAlbumsCut()

    await act(async () => button(node, 'პირადი')!.click())
    await flush()

    /* ⚠️ ეს ლოკის მთელი აზრია: `path` პასუხში არ მოსულა, ე.ი.
       ინსპექტორში მოსაძებნი არაფერია. */
    const sources = [...node.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources.every((src) => src === '/locked-photo.svg')).toBe(true)
  })

  it('an album without a password can be locked from the card menu, in a window that holds only the lock', async () => {
    const i18n = (await import('@/i18n')).default
    state.lock = { locked: false, unlocked: true }
    const node = await mountAlbumsCut()

    const items = await openMenu(node, i18n.t('actions.more'))
    expect(items).toContain(i18n.t('lock.lock'))
    // უპაროლოზე არც გასახსნელია რამე, არც ხელახლა ჩასაკეტი, არც შესაცვლელი პაროლი
    expect(count(items, i18n.t('gallery.albumUnlock')), 'მხოლოდ ბარათის გახსნა').toBe(1)
    expect(items).not.toContain(i18n.t('lock.relock'))
    expect(items).not.toContain(i18n.t('lock.password'))

    await act(async () => menuItem(i18n.t('lock.lock')).click())
    await flush()

    // ფანჯარაში მხოლოდ ლოკია — სახელი, აღწერა და ხილვადობა არ იხატება
    expect(document.body.textContent).toContain(i18n.t('lock.title'))
    expect(document.querySelector('#album-name')).toBeNull()
    expect(document.querySelector('#album-desc')).toBeNull()
    const password = document.querySelector<HTMLInputElement>('#album-password')!
    const repeat = document.querySelector<HTMLInputElement>('#album-repeat')!
    expect(password).toBeTruthy()

    // ცარიელი ფორმა არაფერს ინახავს; პაროლი და მისი გამეორება — ინახავს
    const save = () => document.querySelector<HTMLButtonElement>('button[form="album-form"]')!
    expect(save().disabled).toBe(true)
    await type(password, 'secret-1')
    expect(save().disabled, 'გამეორების გარეშე').toBe(true)
    await type(repeat, 'secret-1')
    expect(save().disabled).toBe(false)

    await act(async () => save().click())
    await flush()

    // სახელი, აღწერა და ხილვადობა უცვლელად იგზავნება; ანგარიშის პაროლი ახალ ლოკს არ სჭირდება
    expect(state.update).toHaveBeenCalledTimes(1)
    expect(state.update.mock.calls[0]).toEqual([3, { name: 'პირადი', description: null, visibility: 'private', password: 'secret-1' }])
    expect(document.querySelector('#album-password'), 'ფანჯარა იხურება').toBeNull()
  })

  it('a locked album offers its password in the menu, and asks for the account password while it is closed', async () => {
    const i18n = (await import('@/i18n')).default
    const node = await mountAlbumsCut()

    const items = await openMenu(node, i18n.t('actions.more'))
    expect(count(items, i18n.t('gallery.albumUnlock')), 'ბარათის გახსნა და პაროლით გახსნა').toBe(2)
    expect(items).toContain(i18n.t('lock.password'))
    expect(items).not.toContain(i18n.t('lock.lock'))
    // დაუხსნელს „ისევ ჩაკეტვა" არ სჭირდება
    expect(items).not.toContain(i18n.t('lock.relock'))

    await act(async () => menuItem(i18n.t('lock.password')).click())
    await flush()

    expect(document.querySelector('#album-name')).toBeNull()
    await act(async () => button(document.body, i18n.t('gallery.albumRemoveLock'))!.click())
    await flush()

    // მოხსნა დაუხსნელ ალბომზე ანგარიშის პაროლის გარეშე არ იგზავნება
    const save = () => document.querySelector<HTMLButtonElement>('button[form="album-form"]')!
    expect(save().disabled).toBe(true)
    await type(document.querySelector<HTMLInputElement>('#album-current')!, 'my-account-password')
    expect(save().disabled).toBe(false)

    await act(async () => save().click())
    await flush()

    expect(state.update.mock.calls[0]).toEqual([
      3,
      { name: 'პირადი', description: null, visibility: 'private', remove_password: true, account_password: 'my-account-password' },
    ])
  })

  it('an album opened in this session can be locked again or have its password changed', async () => {
    const i18n = (await import('@/i18n')).default
    state.lock = { locked: true, unlocked: true }
    const node = await mountAlbumsCut()

    const items = await openMenu(node, i18n.t('actions.more'))
    expect(items).toContain(i18n.t('lock.relock'))
    expect(items).toContain(i18n.t('lock.password'))
    expect(items).not.toContain(i18n.t('lock.lock'))
    expect(count(items, i18n.t('gallery.albumUnlock')), 'მხოლოდ ბარათის გახსნა').toBe(1)
  })
})

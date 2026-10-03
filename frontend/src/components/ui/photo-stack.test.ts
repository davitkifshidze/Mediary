import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   რეგრესია: **ესკიზი შეიძლება პრივატული იყოს და მაშინ ობიექტია**.

   ⚠️ სერვერი (`GalleryImage::preview()`) საჯარო ფაილზე სტრიქონს
   აგზავნის, პირად დისკზე მდგარზე კი `{url, private}`-ს — ეს 2026-09-17-ს
   დაიწერა, **ფრონტის ნახევარი კი არა**: `images` ტიპად `string[]` დარჩა
   და ბარათი პირდაპირ `storageUrl(path)`-ს ეძახდა.

   შედეგი ცოცხალი იყო: ალბომი, რომელიც ამ სესიაში გაიხსნა, ესკიზებს
   იღებს, მისი ფაილები კი `gallery/locked`-შია (`AlbumVault` მათ მხოლოდ
   პაროლის **მოხსნაზე** აბრუნებს) — ე.ი. ობიექტი მიდიოდა `storageUrl()`-ს
   და მთელი ჭრილი `path.replace is not a function`-ით ითიშებოდა.

   ⚠️ **`tsc`-ს ამის დანახვა არ შეეძლო**: JSON-ის პასუხი ხელით აღწერილი
   ტიპია და ტიპი სწორედ იმაზე ცრუობდა, რაც მოდიოდა. მხოლოდ ნამდვილი
   მიმაგრება იჭერს — ამიტომ არსებობს ეს ფაილი.
   ============================================================ */

/* ⚠️ mock-ი ნამდვილის ფორმას იმეორებს — `.replace()` იმიტომ, რომ
   ობიექტი აქამდე ზუსტად იმ გამონაკლისით ვარდებოდა, რაც მომხმარებელმა ნახა.
   უბრალო შაბლონი ტესტს ასეთი დაცემის გამეორების საშუალებას წართმევდა. */
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  storageUrl: (path?: string | null) =>
    path ? `http://api.test/storage/${path.replace(/^\/+/, '')}` : null,
}))

/** ⚠️ ნამდვილი `PrivateImage` blob-ს ითხოვს — ტესტს ქსელი არ სჭირდება */
vi.mock('@/components/PrivateFile', () => ({
  PrivateImage: ({ url, className }: { url: string; className?: string }) =>
    h('img', { src: url, className, 'data-private': 'true', alt: '' }),
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

async function mountStack(images: (string | { url: string; private?: boolean })[]) {
  const { PhotoStack } = await import('@/components/ui/photo-stack')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(h(PhotoStack, { title: 'ალბომი', label: '2 ფოტო', images }))
  })

  return container
}

describe('PhotoStack', () => {
  it('პრივატულ ესკიზს blob-ით ხატავს და არ ვარდება', async () => {
    const node = await mountStack([
      { url: '/gallery/images/5/file', private: true },
      'gallery/images/open.jpg',
    ])

    const imgs = [...node.querySelectorAll('img')]
    expect(imgs.length, 'ორივე ესკიზი უნდა დაიხატოს').toBe(2)

    /* ⚠️ პრივატული **არ** უნდა გაიაროს `storageUrl()`-ზე: `/storage/*`
       პირად დისკს ვერ წვდება, ე.ი. მისამართიც კი არასწორი იქნებოდა */
    const priv = imgs.find((i) => i.dataset.private === 'true')
    expect(priv?.getAttribute('src')).toBe('/gallery/images/5/file')

    const open = imgs.find((i) => i.dataset.private !== 'true')
    expect(open?.getAttribute('src')).toBe('http://api.test/storage/gallery/images/open.jpg')
  })

  it('მხოლოდ სტრიქონებიც ისევე მუშაობს', async () => {
    const node = await mountStack(['a.jpg', 'b.jpg'])

    expect(node.querySelectorAll('img').length).toBe(2)
  })
})

/* Tasks §25.1 — ბარათი თავიდან: მოდულის ფერის ზოლი, ჟანრების ჩიპები, მეტა-ხაზი, h-9 ზოლი, `contain` ფიტი */
describe('PhotoStack — §25.1', () => {
  it('draws the accent bar, chips, meta and an equal-height actions bar; contain fit keeps the photo whole', async () => {
    const { PhotoStack } = await import('@/components/ui/photo-stack')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(
        h(PhotoStack, {
          title: 'Dune',
          label: '3 ფოტო',
          images: ['gallery/a.jpg'],
          aspect: 'wide',
          fit: 'contain',
          accent: '#6366f1',
          chips: h('span', { 'data-testid': 'chip' }, 'Sci-fi'),
          meta: h('span', { 'data-testid': 'meta' }, '2021'),
          actions: h('button', { type: 'button' }, 'გახსნა'),
        }),
      ),
    )

    const accent = container.querySelector<HTMLElement>('[data-testid="stack-accent"]')
    expect(accent).not.toBeNull()
    expect(accent!.style.background).toContain('rgb(99, 102, 241)')
    expect(container.querySelector('[data-testid="chip"]')?.textContent).toBe('Sci-fi')
    expect(container.querySelector('[data-testid="meta"]')?.textContent).toBe('2021')
    expect(container.querySelector('[data-testid="stack-actions"]')?.className).toContain('mt-auto')
    expect(container.querySelector('img')?.className).toContain('object-contain')
    // ბარათი სვეტია და მთელ სიმაღლეს იკავებს — ბადეში ყველა ერთი სიმაღლისაა
    expect(container.firstElementChild?.className).toContain('h-full')
  })
})

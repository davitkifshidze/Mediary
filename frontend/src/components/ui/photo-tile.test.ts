import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **ფოტოს ფილა — ფოტო შუაში, ღილაკები ერთ ქვედა ხაზზე**.

   შენი სიტყვები: „პატარა ან დიდი ზომის ფოტოები… ზემოთ ავარდნილივით და მერე
   სიცარიელე თეთრი… ღილაკები მინდა სიმეტრიულად იყოს დაბლა და ფოტოები იყოს
   შუაში". მოწმდება: ფილა `flex h-full flex-col`-ია (რიგის სიმაღლემდე ჭიმება),
   ფოტო `flex-1` ჩარჩოში ცენტრშია, ზოლი `mt-auto`-ით ბოლოშია; რჩეული და წაშლა
   `h-9` ღილაკებია ტექსტით, დანარჩენი ⋯-შია; კითხვის რეჟიმში ზოლი ღილაკების გარეშეა.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('IntersectionObserver' in globalThis)) {
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/components/ui/photo-grid')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const items = [
  { id: 1, src: 'https://cdn.test/a.jpg', title: 'A', portrait: true, favorite: true },
  { id: 2, src: 'https://cdn.test/b.jpg', title: 'B' },
]

async function mount(props: Record<string, unknown>) {
  const { PhotoGrid } = await import('@/components/ui/photo-grid')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(h(TooltipProvider, null, h(PhotoGrid, { items, pageSize: 0, ...props } as Parameters<typeof PhotoGrid>[0]))),
  )
  return container
}

describe('PhotoGrid tile', () => {
  it('stretches to the row, centres the photo and keeps the bar at the bottom with h-9 text buttons', async () => {
    const node = await mount({ onFavorite: vi.fn(), onDelete: vi.fn(), onPrimary: vi.fn() })

    const tile = node.querySelector('ul > li')!
    expect(tile.className).toContain('flex')
    expect(tile.className).toContain('h-full')
    expect(tile.className).toContain('flex-col')
    expect(tile.querySelector(':scope > div.flex-1')?.className).toContain('justify-center')

    const bar = tile.querySelector('[data-testid="photo-actions"]')!
    expect(bar.parentElement?.className).toContain('mt-auto')
    expect(bar.className).toContain('[&>*]:h-9')
    const labels = [...bar.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(labels).toEqual([i18n.t('filter.favorite'), i18n.t('confirm.delete'), ''])
    // „მთავარად" მხოლოდ მენიუშია
    expect(bar.textContent).not.toContain(i18n.t('gallery.setPrimary'))
  })

  it('read-only tiles keep only the caption', async () => {
    const node = await mount({ readOnly: true })

    expect(node.querySelector('[data-testid="photo-actions"]')).toBeNull()
    expect(node.querySelector('ul > li')?.textContent).toContain('A')
  })
})

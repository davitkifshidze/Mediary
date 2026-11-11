import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import css from '@/index.css?raw'
import art from './empty-art.tsx?raw'

/* ============================================================
   **ცარიელი მდგომარეობა — ანიმაციური ნახატი და სამი ზომა.**

   ⚠️ მოწმდება: ყოველ სახეობას თავისი SVG აქვს; საკუთარი აიქონი ნახატს
   ცვლის, `kind` კი აიქონზე ძლიერია; ზომები — გვერდის ბლოკი სათაურით,
   ბარათის კომპაქტური და ერთსტრიქონიანი. CSS-ის მხარე ტექსტად მოწმდება
   (jsdom სტილებს არ ითვლის): მოძრაობა მხოლოდ `prefers-reduced-motion:
   no-preference`-ის ქვეშაა, ფერი — თემის ცვლადებიდან; ნახატი ბიბლიოთეკას
   არ ითხოვს.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function mount(props: Record<string, unknown>) {
  const { EmptyState } = await import('./empty-state')
  act(() => root?.unmount())
  container?.remove()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(EmptyState, props as never)))
  return container.firstElementChild as HTMLElement
}

const KINDS = ['list', 'photo', 'video', 'search', 'link', 'file', 'bell'] as const

describe('EmptyState', () => {
  it('draws its own illustration for every kind', async () => {
    const drawn = new Set<string>()
    for (const kind of KINDS) {
      const box = await mount({ kind, title: 'ცარიელია' })
      const holder = box.querySelector<HTMLElement>('.fb-empty-art')!

      expect(holder.dataset.kind).toBe(kind)
      expect(holder.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      drawn.add(holder.innerHTML.replace(/id="[^"]*"|url\([^)]*\)/g, ''))
    }

    expect(drawn.size).toBe(KINDS.length)
  })

  it('falls back to the empty shelf when neither a kind nor an icon is given', async () => {
    const box = await mount({ title: 'ცარიელია' })

    expect(box.querySelector<HTMLElement>('.fb-empty-art')?.dataset.kind).toBe('list')
    expect(box.querySelector('.fb-empty-icon')).toBeNull()
  })

  it('keeps a caller icon afloat in a halo — and lets a kind win over it', async () => {
    const icon = h('i', { 'data-testid': 'own-icon' })

    const withIcon = await mount({ icon, title: 'ცარიელია' })
    expect(withIcon.querySelector('.fb-empty-icon [data-testid="own-icon"]')).not.toBeNull()
    expect(withIcon.querySelector('.fb-empty-icon .ea-halo')).not.toBeNull()
    expect(withIcon.querySelector('.fb-empty-art')).toBeNull()

    const withKind = await mount({ icon, kind: 'search', title: 'ვერ მოიძებნა' })
    expect(withKind.querySelector<HTMLElement>('.fb-empty-art')?.dataset.kind).toBe('search')
    expect(withKind.querySelector('[data-testid="own-icon"]')).toBeNull()
  })

  it('is a dashed block with a heading on a page', async () => {
    const box = await mount({ title: 'ჩანაწერები არ არის', hint: 'დაამატე პირველი', actions: h('button', null, 'დამატება') })

    expect(box.dataset.emptyState).toBe('page')
    expect(box.className).toContain('border-dashed')
    expect(box.querySelector('h2')?.textContent).toBe('ჩანაწერები არ არის')
    expect(box.textContent).toContain('დაამატე პირველი')
    expect(box.querySelector('button')?.textContent).toBe('დამატება')
  })

  it('drops the frame and the heading inside a card', async () => {
    const box = await mount({ size: 'compact', title: 'ფაილები არ არის' })

    expect(box.dataset.emptyState).toBe('compact')
    expect(box.className).not.toContain('border-dashed')
    expect(box.querySelector('h2')).toBeNull()
    expect(box.querySelector('.fb-empty-art')?.className).toContain('w-[76px]')
  })

  it('fits one row for menus and narrow panels', async () => {
    const box = await mount({ size: 'line', kind: 'search', title: 'ვერ მოიძებნა' })

    expect(box.dataset.emptyState).toBe('line')
    expect(box.className).toContain('text-left')
    expect(box.querySelector('.fb-empty-art')?.className).toContain('w-9')
    expect(box.querySelector('p')?.textContent).toBe('ვერ მოიძებნა')
  })
})

describe('the illustration styles', () => {
  it('moves only when motion is allowed', () => {
    const start = css.indexOf('.fb-empty-art {')
    const block = css.slice(start)
    const media = block.indexOf('@media (prefers-reduced-motion: no-preference)')

    expect(start).toBeGreaterThan(-1)
    expect(media).toBeGreaterThan(-1)
    // `animation:` მხოლოდ მედია-ბლოკის შიგნით წერია
    expect(block.slice(0, media)).not.toMatch(/\banimation:/)
    expect(block.slice(media).match(/\banimation: ea-/g)!.length).toBeGreaterThanOrEqual(12)
  })

  it('takes its colours from the theme', () => {
    expect(css).toContain('--empty-accent: var(--mod, var(--gold));')
    expect(css).toMatch(/\.ea-s\s+\{ stroke: currentColor;/)
    expect(css).toMatch(/\.ea-paper \{ fill: var\(--card\); \}/)
    // ნახატში ფერი არ წერია — არც hex, არც rgb
    expect(art).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('is plain SVG — no animation library, no image file', () => {
    // ერთადერთი იმპორტი React-ია; სურათის ფაილი არ იტვირთება
    expect(art.match(/from '[^']+'/g)).toEqual(["from 'react'"])
    expect(art).not.toMatch(/\.(gif|png|json)['"]/)
    expect(art.length).toBeLessThan(7 * 4096)
  })
})

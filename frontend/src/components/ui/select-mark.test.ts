import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import css from '@/index.css?raw'
import button from './button.tsx?raw'

/* ============================================================
   **მონიშვნის ნიშანი და კურსორი.**

   ⚠️ მოწმდება: მონიშნული ყუთი ფერადია თეთრი ✓-ით და შიგ ✕-იც დევს (ჰოვერზე
   CSS მას აჩენს); აიქონები ზოგადი ჰოვერის წესებიდან გამორიცხულია; მოუნიშნავი
   ყუთი ცარიელია. CSS-ის მხარე ტექსტად მოწმდება — jsdom სტილებს არ ითვლის:
   ნიშნის წესები, ერთი კურსორის წესი და ის, რომ გამორთულ ელემენტზე ჰოვერის
   ეფექტები არ მუშაობს.
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
  const { SelectMark } = await import('./select-mark')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(SelectMark, props as never)))
  return container.firstElementChild as HTMLElement
}

describe('SelectMark', () => {
  it('draws a white tick in a coloured box, with the cross ready for the hover', async () => {
    const mark = await mount({ checked: true })

    expect(mark.dataset.selectMark).toBe('on')
    expect(mark.className).toContain('fb-mark-on')
    expect(mark.querySelector('.fb-mark-check.lucide-check')).not.toBeNull()
    expect(mark.querySelector('.fb-mark-x.lucide-x')).not.toBeNull()
  })

  it('keeps its icons out of the general hover rules', async () => {
    const mark = await mount({ checked: true })

    // `transition-transform` — ზოგადი წესებიდან გამოსვლის ნიშანი: ✓ არ მწვანდება, ✕ არ ბრუნავს
    for (const icon of mark.querySelectorAll('svg')) expect(icon.getAttribute('class')).toContain('transition-transform')
  })

  it('is an empty box when not checked, lighter on a photo', async () => {
    const plain = await mount({ checked: false })
    expect(plain.dataset.selectMark).toBe('off')
    expect(plain.querySelector('svg')).toBeNull()
    expect(plain.className).toContain('border-border')
    act(() => root?.unmount())
    container?.remove()

    const onPhoto = await mount({ checked: false, onPhoto: true })
    expect(onPhoto.className).toContain('border-white/70')
  })

  it('comes in the row size and the photo size', async () => {
    expect((await mount({ checked: true, size: 'sm' })).className).toContain('size-5')
    act(() => root?.unmount())
    container?.remove()
    expect((await mount({ checked: true })).className).toContain('size-6')
  })
})

describe('the mark and cursor rules in index.css', () => {
  const HOST = ":where(button, a, label, [role='button'], [role='checkbox'], [role='option'], .fb-mark-host):where(:not(:disabled)):hover"

  it('paints the checked box from the theme tokens of both themes', () => {
    expect(css).toMatch(/\.fb-mark-on \{[^}]*background-color: var\(--mark\);[^}]*color: var\(--mark-foreground\);/)
    // ღია და მუქი თემა — ორივეს თავისი მნიშვნელობა აქვს
    expect(css.match(/--mark: #[0-9a-f]{6};/g)).toHaveLength(2)
    expect(css.match(/--mark-foreground: #ffffff;/g)).toHaveLength(2)
  })

  it('turns the tick into a red cross while a clickable ancestor is hovered — not a disabled one', () => {
    expect(css).toContain(`${HOST} .fb-mark-on {`)
    expect(css).toContain(`${HOST} .fb-mark-on > .fb-mark-check { display: none; }`)
    expect(css).toContain(`${HOST} .fb-mark-on > .fb-mark-x { display: block; }`)
    expect(css).toMatch(/\.fb-mark-on \{[^}]*\}\s*\.fb-mark-on > \.fb-mark-x \{ display: none; \}/)
  })

  it('does not turn a "this one is selected" tick green on hover', () => {
    const rules = css.split('\n').filter((line) => line.includes('.lucide-check:not(') || line.includes('.lucide-check-check:not('))

    expect(rules.length).toBeGreaterThanOrEqual(4)
    for (const rule of rules) expect(rule).toContain(':not(.fb-selected)')
  })

  it('gives every clickable kind of element the pointer and every disabled one not-allowed', () => {
    expect(css).toMatch(/:where\(button, summary, select, a\[href\], label\[for\], \[role='button'\][^)]*\) \{\s*cursor: pointer;/)
    expect(css).toMatch(/:where\(button, input, select, textarea\):disabled,\s*:where\(\[aria-disabled='true'\]\) \{\s*cursor: not-allowed;/)
  })

  it('never runs a hover effect on a disabled control', () => {
    // ყოველი ზოგადი ჰოვერის წესი გამორთულს გამორიცხავს
    const plain = ":where(button, a, label, summary, [role='button'], [role='menuitem'], [role='option']):hover"
    expect(css).not.toContain(plain)
    // და `Button`-ის ჰოვერის ფერებიც: გამორთული ღილაკი თაგვს გრძნობს (კურსორი, მინიშნება), მაგრამ არ იცვლება
    expect(button).toContain('disabled:cursor-not-allowed')
    expect(button).not.toContain('disabled:pointer-events-none')
    expect(button.match(/(?<![-:\w])hover:/g)).toBeNull()
  })
})

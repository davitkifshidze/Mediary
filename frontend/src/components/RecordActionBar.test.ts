import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link2 } from 'lucide-react'
import i18n from '@/i18n'

/* ============================================================
   **მოქმედებების ზოლი — ბმულის სლოტი თავშია**.

   შენი სიტყვები: „წიგნებში ეს დაშორება ფაილებსა და რედაქტირებას შორის
   მოაგვარე". უბმულო ჩანაწერზე სლოტი უხილავია, მაგრამ ადგილს იკავებს
  — ფაილებსა და რედაქტირებას შორის ის ცარიელ ხვრელად ჩანდა. ახლა
   ის რიგის თავშია და მარჯვნივ მიმაგრებული ღილაკები ერთმანეთის გვერდით დგას.
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

async function mount(href: string | null) {
  const { RecordActionBar } = await import('@/components/RecordActionBar')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      h(RecordActionBar, {
        before: h('span', { 'data-testid': 'score' }, '8.5'),
        status: h('button', { type: 'button', 'data-testid': 'status' }, 'status'),
        favorite: { active: false, onToggle: vi.fn() },
        files: { count: 2, onOpen: vi.fn() },
        link: { href, label: i18n.t('actions.link'), icon: Link2 },
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    ),
  )
  return container.querySelector('[data-testid="record-actions"]')!
}

describe('RecordActionBar', () => {
  it('puts the link slot first — status · favorite · files · edit · delete stay side by side', async () => {
    const bar = await mount(null)
    const children = [...bar.children] as HTMLElement[]

    expect(children[0].getAttribute('data-testid')).toBe('link-slot')
    // უბმულოზე სლოტი უხილავია, მაგრამ ადგილს იკავებს (ღილაკები რიგიდან რიგში არ ხტება)
    expect(children[0].className).toContain('invisible')

    const files = children.findIndex((el) => el.getAttribute('data-testid') === 'files-button')
    const edit = children.findIndex((el) => el.textContent?.includes(i18n.t('actions.edit')))
    expect(edit).toBe(files + 1)
    expect(children.at(-1)?.getAttribute('aria-label')).toBe(i18n.t('actions.delete'))
  })

  it('a record with a link shows it in the same first place', async () => {
    const bar = await mount('https://example.com')
    const slot = bar.firstElementChild as HTMLAnchorElement

    expect(slot.getAttribute('data-testid')).toBe('link-slot')
    expect(slot.className).not.toContain('invisible')
    expect(slot.getAttribute('href')).toBe('https://example.com')
  })
})

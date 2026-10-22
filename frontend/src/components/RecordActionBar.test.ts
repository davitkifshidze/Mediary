import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link2 } from 'lucide-react'
import i18n from '@/i18n'

/* ============================================================
   **მოქმედებების ზოლი — ქრობადი ყველაფერი თავშია**.

   უშეფასებო ჩანაწერზე ბეჯი `null`-ია, უბმულოზე სლოტი უხილავია — ორივე
   შუაში ხვრელს ტოვებდა (ფაილებსა და რედაქტირებას შორის, „რუკასა" და
   სტატუსს შორის). ახლა რიგი „ბეჯები · ბმული · სტატუსი · რჩეული · ფაილები ·
   რედაქტირება · წაშლა"-ა და მარჯვნივ მიმაგრებული ღილაკები ერთმანეთის
   გვერდით დგას; ფაილების რიცხვი 0-ზეც ჩანს, წაშლა ტექსტიანი ღილაკია.
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

async function mount(href: string | null, { score = true, files = 2 } = {}) {
  const { RecordActionBar } = await import('@/components/RecordActionBar')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      h(RecordActionBar, {
        before: score ? h('span', { 'data-testid': 'score' }, '8.5') : null,
        status: h('button', { type: 'button', 'data-testid': 'status' }, 'status'),
        favorite: { active: false, onToggle: vi.fn() },
        files: { count: files, onOpen: vi.fn() },
        link: { href, label: i18n.t('actions.link'), icon: Link2 },
        onEdit: vi.fn(),
        onDelete: vi.fn(),
      }),
    ),
  )
  return container.querySelector('[data-testid="record-actions"]')!
}

describe('RecordActionBar', () => {
  it('puts the badges first and the link slot after them — status · favorite · files · edit · delete stay side by side', async () => {
    const bar = await mount(null)
    const children = [...bar.children] as HTMLElement[]

    expect(children[0].getAttribute('data-testid')).toBe('score')
    expect(children[1].getAttribute('data-testid')).toBe('link-slot')
    // უბმულოზე სლოტი უხილავია, მაგრამ ადგილს იკავებს (ღილაკები რიგიდან რიგში არ ხტება)
    expect(children[1].className).toContain('invisible')
    expect(children[2].getAttribute('data-testid')).toBe('status')

    const files = children.findIndex((el) => el.getAttribute('data-testid') === 'files-button')
    const edit = children.findIndex((el) => el.textContent?.includes(i18n.t('actions.edit')))
    expect(edit).toBe(files + 1)
  })

  it('an unrated record keeps the link slot right beside the status', async () => {
    const bar = await mount(null, { score: false })
    const children = [...bar.children] as HTMLElement[]

    expect(children[0].getAttribute('data-testid')).toBe('link-slot')
    expect(children[1].getAttribute('data-testid')).toBe('status')
  })

  it('a record with a link shows it in the same place', async () => {
    const bar = await mount('https://example.com')
    const slot = bar.querySelector<HTMLAnchorElement>('[data-testid="link-slot"]')!

    expect(slot.className).not.toContain('invisible')
    expect(slot.getAttribute('href')).toBe('https://example.com')
  })

  it('always draws the file count, zero included, so rows keep one width', async () => {
    const bar = await mount(null, { files: 0 })
    const badge = bar.querySelector('[data-testid="files-button"] [data-testid="count-badge"]')

    expect(badge?.textContent).toBe('0')
  })

  it('delete is the last button, bordered and with its label as text', async () => {
    const bar = await mount(null)
    const del = bar.lastElementChild as HTMLButtonElement

    expect(del.getAttribute('aria-label')).toBe(i18n.t('actions.delete'))
    expect(del.textContent).toBe(i18n.t('actions.delete'))
    expect(del.className).toContain('border-destructive/60')
  })
})

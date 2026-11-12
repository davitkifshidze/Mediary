import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Circle, CircleCheck } from 'lucide-react'
import type { MenuAction } from '@/components/ui/record-menu'
import i18n from '@/i18n'

/* ============================================================
   **ერთი სია — ორი მენიუ**.

   ⚠️ მოწმდება: მარჯვენა ღილაკი იმავე სიიდან ხატავს პუნქტებს (ქვემენიუ,
   წითელი პუნქტი, გამყოფი), პუნქტის არჩევა `run`-ს **ერთი tick-ით გვიან**
   უშვებს (მენიუ ჯერ იხურება), `⋯` ღილაკი კი ქვემენიუს სათაურიან ჯგუფად
   ბრტყელებს. ცარიელი სია ტრიგერს ხელუხლებლად ტოვებს.

   ⚠️ **ყოველ პუნქტს აიქონი აქვს** — ქვემენიუს სათაურსაც და მის პუნქტებსაც
   (✓-ის გვერდით): უაიქონო პუნქტი აიქონიანების გვერდით ტექსტს მარცხნივ სწევდა.
   enum-სტატუსების ქვემენიუ (`enumStatusActions`) იმავე აიქონსა და ტონს იღებს,
   რაც ბეჯზეა.
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(node: unknown) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node as Parameters<Root['render']>[0]))
}

const menuItems = () => [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const itemWith = (text: string) => menuItems().find((el) => el.textContent?.includes(text))

describe('RecordContextMenu', () => {
  it('draws the shared list on right-click and defers the action until the menu has closed', async () => {
    const m = await import('@/components/ui/record-menu')
    const run = vi.fn()
    const del = vi.fn()

    const actions: MenuAction[] = [
      { key: 'open', label: 'გახსნა', icon: m.MENU_ICONS.open, run },
      {
        key: 'status',
        label: 'სტატუსი',
        icon: m.MENU_ICONS.status,
        sub: [
          { key: 's1', label: 'ნანახი', icon: CircleCheck, checked: true, run: () => {} },
          { key: 's2', label: 'საყურებელი', icon: Circle, run: () => {} },
        ],
      },
      { key: 'delete', label: 'წაშლა', icon: m.MENU_ICONS.delete, danger: true, separator: true, run: del },
    ]

    await render(h(m.RecordContextMenu, { actions, children: h('div', { 'data-testid': 'card' }, 'ბარათი') }))

    const card = document.querySelector<HTMLElement>('[data-testid="card"]')!
    await act(async () => {
      card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    expect(itemWith('გახსნა'), 'პირველი პუნქტი').toBeTruthy()
    expect(itemWith('წაშლა')!.className).toContain('text-destructive')
    expect(document.body.querySelector('[role="separator"]'), 'გამყოფი წაშლის წინ').toBeTruthy()
    expect(document.body.textContent).toContain('სტატუსი')
    // სამივე პუნქტს — ქვემენიუს გამხსნელსაც — თავისი აიქონი აქვს
    for (const label of ['გახსნა', 'სტატუსი', 'წაშლა']) {
      expect(itemWith(label)!.querySelector('svg'), `„${label}“ აიქონით`).toBeTruthy()
    }

    // არჩევა — `run` ერთხელ ეშვება (გადადებულია `setTimeout`-ით; `act` მას თვითონ ასრულებს)
    await act(async () => {
      const item = itemWith('გახსნა')!
      item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      item.click()
    })
    await flush()
    expect(run).toHaveBeenCalledTimes(1)
    expect(del).not.toHaveBeenCalled()
  })

  it('with no actions the child renders alone and keeps the browser menu', async () => {
    const m = await import('@/components/ui/record-menu')

    await render(h(m.RecordContextMenu, { actions: [], children: h('span', { 'data-testid': 'plain' }, 'x') }))

    const plain = document.querySelector<HTMLElement>('[data-testid="plain"]')!
    expect(plain.getAttribute('data-state')).toBeNull()
  })
})

describe('RecordActionMenu', () => {
  it('flattens a submenu into a titled group inside the ⋯ popover', async () => {
    const m = await import('@/components/ui/record-menu')
    const pick = vi.fn()

    const actions: MenuAction[] = [
      {
        key: 'status',
        label: 'სტატუსი',
        icon: m.MENU_ICONS.status,
        sub: [
          { key: 'a', label: 'ნანახი', icon: CircleCheck, iconClassName: 'text-success', checked: true, run: pick },
          { key: 'b', label: 'საყურებელი', icon: Circle, run: () => {} },
        ],
      },
      { key: 'delete', label: 'წაშლა', icon: m.MENU_ICONS.delete, danger: true, separator: true, run: () => {} },
    ]

    await render(h(m.RecordActionMenu, { label: 'მეტი', actions }))

    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="მეტი"]')!
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      trigger.click()
    })
    await flush()

    expect(document.body.textContent).toContain('სტატუსი')
    const button = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!
    const status = button('ნანახი')
    expect(status).toBeTruthy()

    // ჯგუფის სათაურს აიქონი აქვს; პუნქტს — ✓ და თავისი აიქონი (ფერით), არჩეულზე ✓ ჩანს
    const title = [...document.body.querySelectorAll('p')].find((p) => p.textContent?.includes('სტატუსი'))!
    expect(title.querySelector('svg'), 'ჯგუფის სათაურის აიქონი').toBeTruthy()
    const [check, icon] = [...status.querySelectorAll('svg')]
    expect(status.querySelectorAll('svg')).toHaveLength(2)
    expect(check.getAttribute('class')).toContain('opacity-100')
    expect(icon.getAttribute('class')).toContain('text-success')
    const other = [...button('საყურებელი').querySelectorAll('svg')]
    expect(other).toHaveLength(2)
    expect(other[0].getAttribute('class')).toContain('opacity-0')
    expect(button('წაშლა').querySelector('svg'), 'წაშლის აიქონი').toBeTruthy()

    await act(async () => status.click())
    expect(pick).toHaveBeenCalledTimes(1)
  })
})

describe('favoriteAction / statusActions', () => {
  it('build the standard items from state', async () => {
    const m = await import('@/components/ui/record-menu')

    const on = m.favoriteAction(true, () => {}, (k) => i18n.t(k))
    const off = m.favoriteAction(false, () => {}, (k) => i18n.t(k))
    expect(on.label).toBe(i18n.t('actions.unfavorite'))
    expect(on.iconClassName).toContain('fill-current')
    expect(off.label).toBe(i18n.t('actions.favorite'))
    expect(off.iconClassName).toBeUndefined()

    const statuses = [
      { id: 1, key: 'to_watch', name_ka: 'საყურებელი', name_en: 'To watch', role: 'todo' },
      { id: 2, key: 'watched', name_ka: 'ნანახი', name_en: 'Watched', role: 'done' },
    ] as unknown as Parameters<typeof m.statusActions>[1]
    const picked: string[] = []
    const sub = m.statusActions('სტატუსი', statuses, statuses[1], 'ka', (key) => picked.push(key))

    expect(sub.sub?.map((s) => s.checked)).toEqual([false, true])
    sub.sub?.[0].run?.()
    expect(picked).toEqual(['to_watch'])
    // ქვემენიუს გამხსნელსაც და ყოველ სტატუსსაც თავისი აიქონი აქვს
    expect(sub.icon).toBe(m.MENU_ICONS.status)
    expect(sub.sub?.every((s) => typeof s.icon === 'function' || typeof s.icon === 'object')).toBe(true)
  })

  it('builds the enum status submenu with the icon and the tone the badge uses', async () => {
    const m = await import('@/components/ui/record-menu')
    const { enumStatusIcon } = await import('@/components/StatusBadge')
    const { enumStatusKey, enumStatusTone } = await import('@/lib/statuses')
    const { STATUS_TEXT } = await import('@/lib/statusStyles')
    const { BOOK_STATUSES } = await import('@/api/books')
    const { GAME_STATUSES } = await import('@/api/games')
    const { COURSE_STATUSES } = await import('@/api/courses')
    const { PLACE_STATUSES } = await import('@/api/places')

    const cases = [
      ['book', BOOK_STATUSES],
      ['game', GAME_STATUSES],
      ['course', COURSE_STATUSES],
      ['place', PLACE_STATUSES],
    ] as const

    for (const [domain, options] of cases) {
      const picked: string[] = []
      const current = options[options.length - 1]
      const action = m.enumStatusActions<string>(domain, 'სტატუსი', options, current, (k) => i18n.t(k), (next) => picked.push(next))

      expect(action.key).toBe('status')
      expect(action.icon).toBe(m.MENU_ICONS.status)
      expect(action.sub).toHaveLength(options.length)

      action.sub!.forEach((item, i) => {
        const status = options[i]
        expect(item.label, `${domain}:${status}`).toBe(i18n.t(enumStatusKey(domain, status)!))
        // აიქონი ბეჯისაა; რომელსაც საკუთარი არ აქვს — წრე, ცარიელი არასდროს
        expect(item.icon, `${domain}:${status}`).toBe(enumStatusIcon(domain, status) ?? Circle)
        expect(item.iconClassName).toBe(STATUS_TEXT[enumStatusTone(domain, status)])
        expect(item.checked).toBe(status === current)
      })

      action.sub![0].run?.()
      expect(picked).toEqual([options[0]])
    }
  })
})

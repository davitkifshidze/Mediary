import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **კონტექსტური მენიუს პოზიცია — ნაგულისხმევები შემფუთავშია** (Tasks §2).

   ⚠️ jsdom-ში Radix-ის Popper რეალურ კოორდინატებს არ ითვლის, ამიტომ ვამოწმებთ
   არა პიქსელებს, არამედ იმას, რომ შემფუთავი პრიმიტივს სწორ `sideOffset`/
   `alignOffset`/`collisionPadding`-ს აწვდის და გამომძახებლის მნიშვნელობა მას
   გადაფარავს. პრიმიტივი იმიტირებულია — მხოლოდ პროპებს იწერს.
   ============================================================ */

const seen = vi.hoisted(() => ({ content: [] as Record<string, unknown>[], sub: [] as Record<string, unknown>[] }))

vi.mock('@radix-ui/react-context-menu', async (original) => {
  const real = await original<typeof import('@radix-ui/react-context-menu')>()
  const { createElement } = await import('react')
  return {
    ...real,
    Portal: ({ children }: { children?: unknown }) => children,
    Content: (props: Record<string, unknown>) => {
      seen.content.push(props)
      return createElement('div', { 'data-testid': 'content' })
    },
    SubContent: (props: Record<string, unknown>) => {
      seen.sub.push(props)
      return createElement('div', { 'data-testid': 'sub' })
    },
  }
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  seen.content.length = 0
  seen.sub.length = 0
})

async function render(node: unknown) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node as Parameters<Root['render']>[0]))
}

describe('ContextMenu positioning defaults', () => {
  it('the submenu is pushed off its parent and both menus keep away from the viewport edge', async () => {
    const m = await import('@/components/ui/context-menu')

    // ⚠️ იმიტირებული Content შვილებს არ ხატავს — ორივე ცალ-ცალკე იხატება
    await render(h('div', null, h(m.ContextMenuContent, null), h(m.ContextMenuSubContent, null)))

    expect(seen.content[0]).toMatchObject({ collisionPadding: m.CONTEXT_MENU_POSITION.collisionPadding })
    expect(seen.sub[0]).toMatchObject({
      sideOffset: m.CONTEXT_MENU_POSITION.sideOffset,
      alignOffset: m.CONTEXT_MENU_POSITION.alignOffset,
      collisionPadding: m.CONTEXT_MENU_POSITION.collisionPadding,
    })
    // ⚠️ ქვემენიუ მშობლის კიდეზე (-5 = p-1 + ჩარჩო) დგება და მისგან მოშორებულია
    expect(m.CONTEXT_MENU_POSITION.alignOffset).toBeLessThan(0)
    expect(m.CONTEXT_MENU_POSITION.sideOffset).toBeGreaterThan(0)
  })

  it('a caller can still override the defaults', async () => {
    const m = await import('@/components/ui/context-menu')

    await render(h(m.ContextMenuSubContent, { sideOffset: 12, alignOffset: 0 }))

    expect(seen.sub[0]).toMatchObject({ sideOffset: 12, alignOffset: 0 })
  })

  it('a long list can scroll instead of leaving the screen', async () => {
    const m = await import('@/components/ui/context-menu')

    await render(h(m.ContextMenuContent, null))

    expect(String(seen.content[0].className)).toContain('max-h-[var(--radix-context-menu-content-available-height)]')
    expect(String(seen.content[0].className)).toContain('overflow-y-auto')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **გვერდის ჰედერი — სათაური არ იჭყლიტება**.

   ⚠️ jsdom განლაგებას არ ითვლის, ამიტომ მოწმდება ის, რაც ქცევას წყვეტს:
   სათაურის ბლოკის ბაზისი საკუთარი სიგანეა (`flex-auto`) და არა 0
   (`flex-1`) — 0-ბაზისიანი ბლოკი flex-wrap-ს მოქმედებებთან ერთ ხაზზე
   ყოველთვის „ეტეოდა" და სათაური იჭრებოდა; მოქმედებები ერთი ბლოკია, რომელიც
   მთლიანად სათაურის ქვეშ ჩადის და თავის შიგნით ტყდება.
   ============================================================ */

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({ all: [], enabled: [], mediaModules: [], pageModules: [], customModules: [], has: () => true, loading: false }),
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

async function mount() {
  const { PageHeader } = await import('@/components/ui/page-header')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      h(PageHeader, {
        title: 'სიმღერები',
        subtitle: '0 სიმღერა',
        actions: h(Fragment, null, h('button', { type: 'button' }, 'a'), h('button', { type: 'button' }, 'b')),
      }),
    ),
  )
  return container
}

describe('PageHeader', () => {
  it('keeps the title at its own width and wraps the actions as one block', async () => {
    const el = await mount()
    const title = el.querySelector('h1')!.closest('div.min-w-0')!
    const actions = el.querySelector('[data-testid="page-header-actions"]')!

    expect(title.className).toContain('flex-auto')
    expect(title.className).not.toContain('flex-1')
    expect(actions.parentElement).toBe(title.parentElement)
    expect(actions.parentElement!.className).toContain('flex-wrap')
    expect(actions.className).toContain('flex-wrap')
    expect(actions.querySelectorAll('button')).toHaveLength(2)
  })
})

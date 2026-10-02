import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **ფორმის სექციის მედია-სვეტი იჭიმება** (Tasks §14.1) — კლასების შემოწმება
   snapshot-ის გარეშე: `media`-იანი სექცია `sm:items-stretch` რიგია, რომ
   `PosterUploader fill` ყუთმა ზუსტად ველების სიმაღლე მიიღოს.
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

describe('FormSection', () => {
  it('stretches the media column to the fields next to it', async () => {
    const { FormSection } = await import('@/components/ui/form-layout')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () =>
      root!.render(h(FormSection, { title: 'T', media: h('div', { 'data-testid': 'media' }, 'M'), children: h('div', null, 'fields') })),
    )

    const row = container.querySelector('[data-testid="form-media-row"]')!
    expect(row.className).toContain('sm:items-stretch')
    expect(row.className).not.toContain('sm:items-start')
    expect(row.querySelector('[data-testid="media"]')).toBeTruthy()
  })

  it('without media there is no stretch row — just the grid', async () => {
    const { FormSection } = await import('@/components/ui/form-layout')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => root!.render(h(FormSection, { title: 'T', children: h('div', null, 'fields') })))

    expect(container.querySelector('[data-testid="form-media-row"]')).toBeNull()
    expect(container.querySelector('.grid-cols-12')).toBeTruthy()
  })
})

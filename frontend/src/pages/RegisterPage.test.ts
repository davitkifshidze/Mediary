import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'

/* ============================================================
   რეგისტრაცია — **ბმულით მოსული ბმულს არ კარგავს** (Tasks §40.6).

   აქამდე რეგისტრაცია ყოველთვის `/modules`-ზე გადადიოდა, ე.ი. გაზიარების
   გვერდიდან „რეგისტრაცია" დაჭერილს გვერდი სამუდამოდ ეკარგებოდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({ register: vi.fn() }))

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ register: mocks.register }) }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function submitFrom(state: { from?: string } | null) {
  const { RegisterPage } = await import('@/pages/RegisterPage')
  mocks.register.mockResolvedValue(undefined)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [{ pathname: '/register', state }] },
        h(
          Routes,
          null,
          h(Route, { path: '/register', element: h(RegisterPage) }),
          h(Route, { path: '/share/:token', element: h('p', null, 'share-page') }),
          h(Route, { path: '/modules', element: h('p', null, 'modules-page') }),
        ),
      ),
    )
  })

  const form = document.querySelector('form')!
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
  await flush()
}

describe('RegisterPage — დაბრუნება', () => {
  it('returns to the share link it came from', async () => {
    await submitFrom({ from: '/share/abc' })

    expect(mocks.register).toHaveBeenCalled()
    expect(document.body.textContent).toContain('share-page')
  })

  it('still goes to the modules page without a return path', async () => {
    await submitFrom(null)

    expect(document.body.textContent).toContain('modules-page')
  })
})

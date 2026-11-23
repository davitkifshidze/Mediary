import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import i18n from '@/i18n'

/* ============================================================
   ადმინის ერთჯერადი აღდგენის ბმული `/reset/:token`: ჯერ ბმული
   მოწმდება (ვისი ანგარიშია), მერე ახალი პაროლი იგზავნება. ვადაგასული ან
   გამოყენებული ბმული (410) ცალკე ეკრანია — როგორც გახსნისას, ისე
   გაგზავნისას.
   ============================================================ */

const mocks = vi.hoisted(() => ({ fetchResetTarget: vi.fn(), submitReset: vi.fn() }))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchResetTarget: mocks.fetchResetTarget,
  submitReset: mocks.submitReset,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function apiError(status: number, data: Record<string, unknown>): AxiosError {
  const response = {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response)
}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mount(token = 'tok-123') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [`/reset/${token}`] },
        h(
          TooltipProvider,
          null,
          h(
            Routes,
            null,
            h(Route, { path: '/reset/:token', element: h(ResetPasswordPage) }),
            h(Route, { path: '/login', element: h('div', { 'data-testid': 'login' }, 'login page') }),
          ),
        ),
      ),
    ),
  )
  await flush()
}

const text = () => container?.textContent ?? ''

function type(el: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setValue.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function fillAndSubmit(password: string, confirmation: string) {
  await act(async () => {
    type(container!.querySelector<HTMLInputElement>('#reset-password')!, password)
    type(container!.querySelector<HTMLInputElement>('#reset-confirm')!, confirmation)
  })
  await act(async () => {
    container!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
}

const buttonWith = (label: string) =>
  [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

describe('ResetPasswordPage', () => {
  it('shows a spinner while the link is being checked', async () => {
    mocks.fetchResetTarget.mockReturnValue(new Promise(() => {}))
    await mount()

    expect(text()).toContain(i18n.t('reset.checking'))
    expect(container!.querySelector('form')).toBeNull()
  })

  it('checks the token, names the account and sets the new password', async () => {
    mocks.fetchResetTarget.mockResolvedValue({ display_name: 'Alice Doe', username: 'alice' })
    mocks.submitReset.mockResolvedValue(undefined)
    await mount('tok-123')

    expect(mocks.fetchResetTarget).toHaveBeenCalledWith('tok-123')
    expect(text()).toContain(i18n.t('reset.title'))
    expect(text()).toContain('Alice Doe')

    await fillAndSubmit('new-password-1', 'new-password-1')

    expect(mocks.submitReset).toHaveBeenCalledWith('tok-123', 'new-password-1', 'new-password-1')
    expect(text()).toContain(i18n.t('reset.done'))
    expect(container!.querySelector('form')).toBeNull()

    await act(async () => buttonWith(i18n.t('reset.toLogin'))!.click())
    expect(container!.querySelector('[data-testid="login"]')).not.toBeNull()
  })

  it('shows the expired screen instead of the form when the link is expired or used', async () => {
    mocks.fetchResetTarget.mockRejectedValue(apiError(410, { message: 'reset_link_expired' }))
    await mount()

    expect(text()).toContain(i18n.t('reset.expiredTitle'))
    expect(text()).toContain(i18n.t('reset.expiredHint'))
    expect(container!.querySelector('form')).toBeNull()

    await act(async () => buttonWith(i18n.t('reset.toLogin'))!.click())
    expect(container!.querySelector('[data-testid="login"]')).not.toBeNull()
  })

  it('switches to the expired screen when the link runs out while the form is being filled', async () => {
    mocks.fetchResetTarget.mockResolvedValue({ display_name: 'Alice Doe', username: 'alice' })
    mocks.submitReset.mockRejectedValue(apiError(410, { message: 'reset_link_expired' }))
    await mount()

    await fillAndSubmit('new-password-1', 'new-password-1')

    expect(text()).toContain(i18n.t('reset.expiredTitle'))
    expect(container!.querySelector('form')).toBeNull()
  })

  it('keeps the form and shows the field error on a validation failure', async () => {
    mocks.fetchResetTarget.mockResolvedValue({ display_name: 'Alice Doe', username: 'alice' })
    mocks.submitReset.mockRejectedValue(
      apiError(422, { message: 'The password field confirmation does not match.', errors: { password: ['The password field confirmation does not match.'] } }),
    )
    await mount()

    await fillAndSubmit('new-password-1', 'other')

    expect(text()).toContain('The password field confirmation does not match.')
    expect(container!.querySelector('form')).not.toBeNull()
    expect(text()).not.toContain(i18n.t('reset.done'))
  })
})

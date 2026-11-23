import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LoginPage } from '@/pages/LoginPage'
import i18n from '@/i18n'

/* ============================================================
   შესვლის გვერდი: წარმატება → გადამისამართება, არასწორი პაროლი →
   ველის შეცდომა, 409 `two_factor_required` → კოდის ნაბიჯი (პაროლი ფორმაში
   რჩება და კოდთან ერთად ხელახლა იგზავნება).
   ============================================================ */

const mocks = vi.hoisted(() => ({ login: vi.fn() }))

/* ერთი და იგივე ობიექტი ყოველ გამოძახებაზე */
const auth = vi.hoisted(() => ({ value: { login: (...args: unknown[]) => mocks.login(...args) } }))
vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => auth.value,
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

async function mount(from?: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [{ pathname: '/login', state: from ? { from } : null }] },
        h(
          TooltipProvider,
          null,
          h(
            Routes,
            null,
            h(Route, { path: '/login', element: h(LoginPage) }),
            h(Route, { path: '/', element: h('div', { 'data-testid': 'home' }, 'home page') }),
            h(Route, { path: '/movies', element: h('div', { 'data-testid': 'movies' }, 'movies page') }),
          ),
        ),
      ),
    ),
  )
}

const text = () => container?.textContent ?? ''

function type(el: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setValue.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function fill(login: string, password: string) {
  await act(async () => {
    type(container!.querySelector<HTMLInputElement>('#login')!, login)
    type(container!.querySelector<HTMLInputElement>('#password')!, password)
  })
}

async function submit() {
  await act(async () => {
    container!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
}

describe('LoginPage', () => {
  it('logs in with the typed credentials and goes to the page the visitor came from', async () => {
    mocks.login.mockResolvedValue({ id: 1 })
    await mount('/movies')

    await fill('alice', 'secret-pass')
    await submit()

    expect(mocks.login).toHaveBeenCalledWith({ login: 'alice', password: 'secret-pass', remember: true })
    expect(container!.querySelector('[data-testid="movies"]')).not.toBeNull()
  })

  it('falls back to the home page when there is no origin', async () => {
    mocks.login.mockResolvedValue({ id: 1 })
    await mount()

    await fill('alice', 'secret-pass')
    await submit()

    expect(container!.querySelector('[data-testid="home"]')).not.toBeNull()
  })

  it('shows the validation error under the field and stays on the page when the password is wrong', async () => {
    mocks.login.mockRejectedValue(
      apiError(422, { message: 'These credentials do not match our records.', errors: { login: ['These credentials do not match our records.'] } }),
    )
    await mount()

    await fill('alice', 'wrong')
    await submit()

    expect(text()).toContain('These credentials do not match our records.')
    expect(container!.querySelector('#login')).not.toBeNull()
    expect(container!.querySelector('[data-testid="home"]')).toBeNull()
    // ღილაკი ისევ აქტიურია — შემდეგი ცდა შესაძლებელია
    expect(container!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
  })

  it('shows the server message when the error carries no field errors', async () => {
    mocks.login.mockRejectedValue(apiError(429, { message: 'Too many login attempts.' }))
    await mount()

    await fill('alice', 'wrong')
    await submit()

    expect(text()).toContain('Too many login attempts.')
  })

  it('shows the generic failure text when the error is not an API response', async () => {
    mocks.login.mockRejectedValue({ reason: 'unknown' })
    await mount()

    await fill('alice', 'wrong')
    await submit()

    expect(text()).toContain(i18n.t('auth.failed'))
  })

  it('asks for the code on two_factor_required without showing an error, then resends the password with the code', async () => {
    mocks.login.mockRejectedValueOnce(apiError(409, { message: 'two_factor_required' }))
    await mount()

    await fill('alice', 'secret-pass')
    await submit()

    expect(text()).toContain(i18n.t('auth.twoFactorTitle'))
    expect(text()).not.toContain(i18n.t('auth.failed'))
    expect(container!.querySelector('.text-destructive')).toBeNull()
    const code = container!.querySelector<HTMLInputElement>('#code')!
    expect(code).not.toBeNull()
    // პაროლის ველი მხოლოდ იმალება — მნიშვნელობა ფორმაში რჩება
    expect(container!.querySelector<HTMLInputElement>('#password')!.value).toBe('secret-pass')

    mocks.login.mockResolvedValueOnce({ id: 1 })
    await act(async () => type(code, '123456'))
    await submit()

    expect(mocks.login).toHaveBeenLastCalledWith({ login: 'alice', password: 'secret-pass', remember: true, code: '123456' })
    expect(container!.querySelector('[data-testid="home"]')).not.toBeNull()
  })

  it('goes back to the password step and drops the code', async () => {
    mocks.login.mockRejectedValueOnce(apiError(409, { message: 'two_factor_required' }))
    await mount()

    await fill('alice', 'secret-pass')
    await submit()

    const back = [...container!.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('auth.backToPassword')))!
    await act(async () => back.click())

    expect(container!.querySelector('#code')).toBeNull()
    expect(text()).toContain(i18n.t('auth.loginTitle'))

    mocks.login.mockResolvedValueOnce({ id: 1 })
    await submit()
    expect(mocks.login).toHaveBeenLastCalledWith({ login: 'alice', password: 'secret-pass', remember: true })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TwoFactorCard } from '@/components/TwoFactorCard'
import i18n from '@/i18n'

/* ============================================================
   ორფაქტორიანი შესვლის ბარათი: ჩართვა პაროლით → საიდუმლო → კოდის
   დადასტურება → აღდგენის კოდები (ერთხელ ჩანს); გამორთვა და კოდების
   განახლება — ორივე პაროლით, განახლება კიდევ დადასტურებით.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  startTwoFactor: vi.fn(),
  confirmTwoFactor: vi.fn(),
  disableTwoFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn(),
  copyText: vi.fn(),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  startTwoFactor: mocks.startTwoFactor,
  confirmTwoFactor: mocks.confirmTwoFactor,
  disableTwoFactor: mocks.disableTwoFactor,
  regenerateRecoveryCodes: mocks.regenerateRecoveryCodes,
}))

/* ⚠️ ერთი და იგივე ობიექტი ყოველ გამოძახებაზე; ტესტი მხოლოდ `user`-ს ცვლის */
const auth = vi.hoisted(() => ({
  value: {
    user: { id: 1, two_factor_enabled: false, two_factor_pending: false } as Record<string, unknown> | null,
    refresh: (...args: unknown[]) => mocks.refresh(...args),
  },
}))
vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => auth.value,
}))

const feedback = vi.hoisted(() => ({
  toast: { toast: (...args: unknown[]) => mocks.toast(...args), dismiss: () => {} },
  confirm: (...args: unknown[]) => mocks.confirm(...args),
}))
vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => feedback.toast,
  useConfirm: () => feedback.confirm,
}))

vi.mock('@/lib/clipboard', async (original) => ({
  ...(await original<typeof import('@/lib/clipboard')>()),
  copyText: mocks.copyText,
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

beforeEach(() => {
  auth.value.user = { id: 1, two_factor_enabled: false, two_factor_pending: false }
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(TooltipProvider, null, h(TwoFactorCard))))
}

// მოდალი პორტალით იხატება — ვეძებთ მთელ დოკუმენტში
const text = () => document.body.textContent ?? ''

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

function type(el: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setValue.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function click(label: string) {
  await act(async () => button(label)!.click())
  await flush()
}

async function typePassword(value: string) {
  await act(async () => type(document.querySelector<HTMLInputElement>('#tfa-password')!, value))
}

describe('TwoFactorCard', () => {
  it('renders nothing without a user', async () => {
    auth.value.user = null
    await mount()
    expect(container!.innerHTML).toBe('')
  })

  it('enables two-factor: password, secret, code confirmation and one-time recovery codes', async () => {
    mocks.startTwoFactor.mockResolvedValue({ secret: 'ABCDEF123456', uri: 'otpauth://totp/Mediary:alice?secret=ABCDEF123456' })
    mocks.confirmTwoFactor.mockResolvedValue(['aaaa-1111', 'bbbb-2222'])
    await mount()

    expect(text()).toContain(i18n.t('twoFactor.off'))
    await click(i18n.t('twoFactor.enable'))

    // პაროლის გარეშე გაგრძელება გამორთულია
    expect(button(i18n.t('twoFactor.continue'))!.disabled).toBe(true)
    await typePassword('my-password')
    expect(button(i18n.t('twoFactor.continue'))!.disabled).toBe(false)
    await click(i18n.t('twoFactor.continue'))

    expect(mocks.startTwoFactor).toHaveBeenCalledWith('my-password')
    expect(text()).toContain('ABCDEF123456')
    expect(text()).toContain(i18n.t('twoFactor.scanTitle'))

    const verify = button(i18n.t('auth.verify'))!
    expect(verify.disabled).toBe(true)
    await act(async () => type(document.querySelector<HTMLInputElement>('#tfa-code')!, '654321'))
    await click(i18n.t('auth.verify'))

    expect(mocks.confirmTwoFactor).toHaveBeenCalledWith('654321')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith({ title: i18n.t('twoFactor.enabled'), variant: 'success' })
    expect(text()).toContain(i18n.t('twoFactor.recoveryTitle'))
    expect(text()).toContain('aaaa-1111')
    expect(text()).toContain('bbbb-2222')

    // დახურვის შემდეგ კოდები აღარსად ჩანს
    await click(i18n.t('actions.close'))
    expect(text()).not.toContain('aaaa-1111')
  })

  it('copies the secret to the clipboard', async () => {
    mocks.startTwoFactor.mockResolvedValue({ secret: 'ABCDEF123456', uri: 'otpauth://totp/x' })
    mocks.copyText.mockResolvedValue(true)
    await mount()

    await click(i18n.t('twoFactor.enable'))
    await typePassword('my-password')
    await click(i18n.t('twoFactor.continue'))
    await click(i18n.t('twoFactor.copy'))

    expect(mocks.copyText).toHaveBeenCalledWith('ABCDEF123456')
    expect(text()).toContain(i18n.t('twoFactor.copied'))
  })

  it('stays on the password step and shows the error when the password is wrong', async () => {
    mocks.startTwoFactor.mockRejectedValue(apiError(422, { message: 'account_password_wrong' }))
    await mount()

    await click(i18n.t('twoFactor.enable'))
    await typePassword('nope')
    await click(i18n.t('twoFactor.continue'))

    expect(text()).toContain(i18n.t('errors.account_password_wrong'))
    expect(document.querySelector('#tfa-password')).not.toBeNull()
    expect(document.querySelector('#tfa-code')).toBeNull()
  })

  it('shows the error and keeps the scan step when the code is wrong', async () => {
    mocks.startTwoFactor.mockResolvedValue({ secret: 'ABCDEF123456', uri: 'otpauth://totp/x' })
    mocks.confirmTwoFactor.mockRejectedValue(apiError(422, { message: 'The code is invalid.', errors: { code: ['The code is invalid.'] } }))
    await mount()

    await click(i18n.t('twoFactor.enable'))
    await typePassword('my-password')
    await click(i18n.t('twoFactor.continue'))
    await act(async () => type(document.querySelector<HTMLInputElement>('#tfa-code')!, '000000'))
    await click(i18n.t('auth.verify'))

    expect(text()).toContain('The code is invalid.')
    expect(document.querySelector('#tfa-code')).not.toBeNull()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('disables two-factor with the password', async () => {
    auth.value.user = { id: 1, two_factor_enabled: true, two_factor_pending: false }
    mocks.disableTwoFactor.mockResolvedValue(undefined)
    await mount()

    expect(text()).toContain(i18n.t('twoFactor.on'))
    expect(button(i18n.t('twoFactor.enable'))).toBeUndefined()

    await click(i18n.t('twoFactor.disable'))
    await typePassword('my-password')
    // მოდალის ღილაკი — ბარათის ღილაკის შემდეგ
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes(i18n.t('twoFactor.disable')))
    await act(async () => buttons.at(-1)!.click())
    await flush()

    expect(mocks.disableTwoFactor).toHaveBeenCalledWith('my-password')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith({ title: i18n.t('twoFactor.disabled'), variant: 'success' })
    expect(document.querySelector('#tfa-password')).toBeNull()
  })

  it('regenerates recovery codes only after the confirmation and the password', async () => {
    auth.value.user = { id: 1, two_factor_enabled: true, two_factor_pending: false }
    mocks.confirm.mockResolvedValue(true)
    mocks.regenerateRecoveryCodes.mockResolvedValue(['cccc-3333', 'dddd-4444'])
    await mount()

    await click(i18n.t('twoFactor.regenerate'))
    expect(mocks.confirm).toHaveBeenCalledWith({
      title: i18n.t('twoFactor.regenerate'),
      description: i18n.t('twoFactor.regenerateWarn'),
    })

    await typePassword('my-password')
    await click(i18n.t('twoFactor.continue'))

    expect(mocks.regenerateRecoveryCodes).toHaveBeenCalledWith('my-password')
    expect(mocks.toast).toHaveBeenCalledWith({ title: i18n.t('twoFactor.codesRegenerated'), variant: 'success' })
    expect(text()).toContain('cccc-3333')
    expect(text()).toContain('dddd-4444')
  })

  it('does nothing when the regeneration is not confirmed', async () => {
    auth.value.user = { id: 1, two_factor_enabled: true, two_factor_pending: false }
    mocks.confirm.mockResolvedValue(false)
    await mount()

    await click(i18n.t('twoFactor.regenerate'))

    expect(document.querySelector('#tfa-password')).toBeNull()
    expect(mocks.regenerateRecoveryCodes).not.toHaveBeenCalled()
  })

  it('marks a started but unconfirmed setup as pending', async () => {
    auth.value.user = { id: 1, two_factor_enabled: false, two_factor_pending: true }
    await mount()

    expect(text()).toContain(i18n.t('twoFactor.pending'))
    expect(text()).toContain(i18n.t('twoFactor.pendingHint'))
    expect(button(i18n.t('twoFactor.enable'))).toBeDefined()
  })
})

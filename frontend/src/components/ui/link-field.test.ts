import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'

/* ============================================================
   **ბმულის ველი შემოთავაზებით** (Tasks §15.2).

   ⚠️ მოწმდება: blur-ზე ბმული ერთხელ იკითხება (იგივე ბმულზე მეორედ არა);
   ბარათი სათაურს აჩვენებს; `onFound` მოსვლისთანავე ეშვება; „ჩასმა"
   `onApply`-ს უშვებს და ბარათს ხურავს; „უარყოფა" მალავს; ნახევრად აკრეფილი
   მისამართი არ იგზავნება; paste-იც კითხულობს.
   ============================================================ */

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('@/api/links', async (original) => ({
  ...(await original<typeof import('@/api/links')>()),
  fetchLinkPreview: mocks.fetch,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const PREVIEW = {
  kind: 'page' as const,
  url: 'https://example.test/a',
  platform: 'other',
  external_id: null,
  embed_url: null,
  title: 'Example page',
  description: 'Desc',
  image_url: null,
  favicon_url: null,
  site_name: 'Example',
  domain: 'example.test',
  author: null,
  duration: null,
}

beforeEach(() => mocks.fetch.mockReset().mockResolvedValue(PREVIEW))

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

async function mount(props: Record<string, unknown> = {}) {
  const { LinkField } = await import('@/components/ui/link-field')

  function Harness() {
    const [value, setValue] = useState('')
    return h(LinkField, { id: 'url', value, onChange: setValue, ...props })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(Harness)))
  return container
}

const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

async function typeAndBlur(text: string) {
  const input = document.getElementById('url') as HTMLInputElement
  await act(async () => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    // ⚠️ React-ის `onBlur` `focusout`-ზეა მიბმული და არა `blur`-ზე
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
  await flush()
}

describe('LinkField', () => {
  it('reads the link once on blur, shows the card and fills through onFound', async () => {
    const onFound = vi.fn()
    const el = await mount({ onFound })

    await typeAndBlur('https://example.test/a')

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(onFound).toHaveBeenCalledWith(PREVIEW)
    const card = el.querySelector('[data-testid="link-suggest"]')
    expect(card?.textContent).toContain(i18n.t('links.found'))
    expect(card?.textContent).toContain('Example page')

    // იგივე ბმულზე ხელახალი blur — მეორედ არ იკითხება
    await typeAndBlur('https://example.test/a')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('“insert” applies and closes, “dismiss” only closes', async () => {
    const onApply = vi.fn()
    const el = await mount({ onApply })
    await typeAndBlur('https://example.test/a')

    const apply = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('links.apply')))!
    await act(async () => apply.click())
    expect(onApply).toHaveBeenCalledWith(PREVIEW)
    expect(el.querySelector('[data-testid="link-suggest"]')).toBeNull()

    // ახალი ბმული → ბარათი ისევ, „უარყოფა" მალავს
    await typeAndBlur('https://example.test/b')
    expect(el.querySelector('[data-testid="link-suggest"]')).toBeTruthy()
    const dismiss = el.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('links.dismiss')}"]`)!
    await act(async () => dismiss.click())
    expect(el.querySelector('[data-testid="link-suggest"]')).toBeNull()
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('does not send a half-typed address and reads a pasted one', async () => {
    const el = await mount()

    await typeAndBlur('htt')
    expect(mocks.fetch).not.toHaveBeenCalled()

    const input = el.querySelector('input')!
    await act(async () => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } }
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'https://example.test/pasted' } })
      input.dispatchEvent(event)
    })
    await flush()
    expect(mocks.fetch).toHaveBeenCalledWith('https://example.test/pasted')
  })

  it('shows nothing when the server found neither a title nor an image', async () => {
    mocks.fetch.mockResolvedValue({ ...PREVIEW, title: null, image_url: null })
    const onFound = vi.fn()
    const el = await mount({ onFound })

    await typeAndBlur('https://example.test/empty')

    expect(el.querySelector('[data-testid="link-suggest"]')).toBeNull()
    expect(onFound).not.toHaveBeenCalled()
  })
})

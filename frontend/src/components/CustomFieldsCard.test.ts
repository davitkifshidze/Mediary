import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CustomFieldDefinition } from '@/api/account'
import type { CustomFieldDraft } from '@/lib/customFieldDraft'
import i18n from '@/i18n'

/* ============================================================
   **დამატებითი ველები ახალ ჩანაწერზე** (Tasks §26.5).

   ⚠️ აქამდე ახალ ჩანაწერზე ბარათი მხოლოდ „ჯერ შეინახე"-ს წერდა. ახლა
   ველები მაშინვე ივსება, ფაილიც ემატება, ხოლო შენახვის შემდეგ მშობელი
   `draft.flush(id)`-ს იძახებს: ჯერ მნიშვნელობები (ერთი `PUT`), მერე ფაილები
   სათითაოდ. ეს მხოლოდ მონტირებით ჩანს.
   ============================================================ */

const defs = [
  { key: 'isbn13', type: 'text', label_ka: 'ISBN-13', label_en: 'ISBN-13', enabled: true, required: true },
  { key: 'scan', type: 'file', label_ka: 'სკანი', label_en: 'Scan', enabled: true, required: false },
] as CustomFieldDefinition[]

const mocks = vi.hoisted(() => ({
  fetchCustomFields: vi.fn(),
  fetchCustomFieldValues: vi.fn(),
  saveCustomFieldValues: vi.fn(),
  uploadCustomFieldFile: vi.fn(),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** ⚠️ მონახაზი ტესტს გარეთ გამოაქვს — `flush()` მშობელი ფორმის საქმეა */
let drafted: CustomFieldDraft | null = null

async function mount(recordId: number | null, withDraft: boolean) {
  mocks.fetchCustomFields.mockResolvedValue(defs)
  mocks.fetchCustomFieldValues.mockResolvedValue({ isbn13: '978' })
  mocks.saveCustomFieldValues.mockImplementation(async (_m, _id, values) => values)
  mocks.uploadCustomFieldFile.mockResolvedValue([])

  const { CustomFieldsCard } = await import('@/components/CustomFieldsCard')
  const { useCustomFieldDraft } = await import('@/lib/customFieldDraft')

  function Harness() {
    const draft = useCustomFieldDraft('book')
    drafted = draft
    return h(CustomFieldsCard, { module: 'book', recordId, draft: withDraft ? draft : undefined })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(Harness)))),
  )
  await flush()
  await flush()

  return container
}

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('CustomFieldsCard', () => {
  it('a new record gets real inputs, not "save first", and no save button of its own', async () => {
    const el = await mount(null, true)

    expect(el.querySelector('#cf-isbn13')).toBeTruthy()
    expect(el.textContent).toContain('ISBN-13')
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.trim() === i18n.t('actions.save'))).toBe(
      false,
    )
  })

  it('flush saves the values, then uploads each file one by one', async () => {
    const el = await mount(null, true)

    await type(el.querySelector<HTMLInputElement>('#cf-isbn13')!, '9780000000001')

    const file = new File(['x'], 'scan.pdf', { type: 'application/pdf' })
    const picker = el.querySelector<HTMLInputElement>('#cf-scan')!
    await act(async () => {
      Object.defineProperty(picker, 'files', { value: [file], configurable: true })
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(el.textContent).toContain('scan.pdf')

    let result: Awaited<ReturnType<CustomFieldDraft['flush']>> | null = null
    await act(async () => {
      result = await drafted!.flush(42)
    })

    expect(mocks.saveCustomFieldValues).toHaveBeenCalledWith('book', 42, { isbn13: '9780000000001' })
    expect(mocks.uploadCustomFieldFile).toHaveBeenCalledWith('book', 42, 'scan', [file])
    expect(result!.ok).toBe(true)
  })

  it('a failed file keeps the draft on screen with its reason', async () => {
    const el = await mount(null, true)
    const failure = new Error('quota')
    mocks.uploadCustomFieldFile.mockRejectedValue(failure)
    const { errorMessage } = await import('@/lib/errors')

    const file = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    const picker = el.querySelector<HTMLInputElement>('#cf-scan')!
    await act(async () => {
      Object.defineProperty(picker, 'files', { value: [file], configurable: true })
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      await drafted!.flush(42)
    })
    await flush()

    // ⚠️ ჩანაწერს id უკვე აქვს, ბარათი კი მაინც მონახაზს აჩვენებს
    expect(el.textContent).toContain('big.pdf')
    expect(el.textContent).toContain(errorMessage(failure))
  })

  it('an existing record saves itself', async () => {
    const el = await mount(7, false)

    expect(mocks.fetchCustomFieldValues).toHaveBeenCalledWith('book', 7)
    expect(el.querySelector<HTMLInputElement>('#cf-isbn13')!.value).toBe('978')
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes(i18n.t('actions.save')))).toBe(true)
  })
})

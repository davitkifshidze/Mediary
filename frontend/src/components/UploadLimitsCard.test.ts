import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UploadKindLimit, UploadLimits } from '@/api/account'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **ატვირთვის ლიმიტების ბარათი** (Tasks §34).

   ⚠️ რასაც ტიპი ვერ ხედავს:
    · სურათზე **ნამდვილი სია** წერია და არა „ნებისმიერი ფორმატი" (§34.4);
    · მოთხოვნის ფანჯარა **მხოლოდ იმას** გთავაზობს, რაც ჯერ არ გაქვს, და
      სერვერს ზუსტად არჩეულს აგზავნის (ზომა — კილობაიტებში);
    · ღია მოთხოვნაზე ღილაკის ნაცვლად „რიგშია" ჩანს;
    · სუპერადმინის რედაქტორი **მხოლოდ შეცვლილ** სახეობას აგზავნის.
   ============================================================ */

function kind(k: UploadKindLimit['kind'], formats: string[], selectable: string[], maxKb = 8192): UploadKindLimit {
  return {
    kind: k,
    max_kb: maxKb,
    max_bytes: maxKb * 1024,
    capped_by_server: false,
    mimes: formats,
    extensions: formats,
    locked: false,
    selectable,
    installation: { max_kb: maxKb, formats },
    personal: null,
    default: { max_kb: maxKb, formats },
  }
}

const mocks = vi.hoisted(() => ({
  limits: { value: null as unknown },
  mine: { value: [] as unknown[] },
  request: vi.fn(async () => ({ id: 1 })),
  // ⚠️ რედაქტორი პასუხს ქეშში წერს — ის ნამდვილი ლიმიტების ფორმისაა
  save: vi.fn(async (_kinds: unknown) => mocks.limits.value),
  toast: vi.fn(),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchUploadLimits: async () => mocks.limits.value,
  fetchMyRequests: async () => mocks.mine.value,
  requestUploadLimit: mocks.request,
  saveInstallationUploadLimits: mocks.save,
}))

vi.mock('@/api/chat', async (original) => ({
  ...(await original<typeof import('@/api/chat')>()),
  fetchChatAdmins: async () => [{ username: 'root', display_name: 'Root', avatar_path: null }],
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  mocks.mine.value = []
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function limits(canEdit: boolean): UploadLimits {
  return {
    kinds: [
      kind('image', ['jpg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif'], ['jpg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif']),
      kind('doc', ['pdf', 'docx'], ['pdf', 'docx', 'mp3', 'flac'], 20480),
    ],
    catalog: { image: ['jpg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif'], document: ['pdf', 'docx'], audio: ['mp3', 'flac'] },
    max_files: 20,
    min_kb: 1024,
    ceiling_kb: 4194304,
    server: { upload_max_filesize: '128M', post_max_size: '256M', max_bytes: 128 * 1024 * 1024 },
    can_edit: canEdit,
  }
}

async function mount(canEdit: boolean) {
  mocks.limits.value = limits(canEdit)
  const { UploadLimitsCard } = await import('@/components/UploadLimitsCard')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(UploadLimitsCard)))),
    ),
  )
  // ⚠️ ორი ტიკი: „ჩემი მოთხოვნები" მხოლოდ ლიმიტების ჩამოსვლის შემდეგ ირთვება
  await flush()
  await flush()
}

const buttons = (text: string) =>
  [...document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text)

async function click(el: Element) {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await flush()
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('UploadLimitsCard — ordinary account', () => {
  it('shows the real image list instead of "any format"', async () => {
    await mount(false)

    expect(container!.textContent).toContain('JPG, PNG, GIF, WEBP, BMP, AVIF, HEIC, HEIF')
    expect(container!.textContent).not.toContain(i18n.t('uploads.kind.primary'))
  })

  it('offers only what is missing and sends exactly the choice', async () => {
    await mount(false)

    // სურათს ყველაფერი აქვს — ზომის მოთხოვნა მაინც შეიძლება, ე.ი. ღილაკი ორივეზეა
    const ask = buttons(i18n.t('uploads.request'))
    expect(ask).toHaveLength(2)
    await click(ask[1])

    const chips = [...document.body.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent)
    expect(chips).toEqual(['MP3', 'FLAC'])

    await click(buttons('FLAC')[0])
    await type(document.body.querySelector('#upload-request-size') as HTMLInputElement, '50')
    await click(buttons(i18n.t('uploads.requestSend'))[0])

    expect(mocks.request).toHaveBeenCalledWith({ kind: 'doc', formats: ['flac'], max_kb: 51200, message: undefined })
  })

  it('shows "pending" instead of a second request', async () => {
    mocks.mine.value = [{ id: 7, type: 'upload_limit', status: 'pending', payload: { kind: 'doc' } }]
    await mount(false)

    expect(buttons(i18n.t('uploads.request'))).toHaveLength(1)
    expect(container!.textContent).toContain(i18n.t('uploads.requestPending'))
  })

  it('lets you message an admin', async () => {
    await mount(false)

    expect(container!.textContent).toContain(i18n.t('uploads.writeAdmin'))
  })
})

describe('UploadLimitsCard — super admin', () => {
  it('opens the editor and sends only the changed kind', async () => {
    await mount(true)

    expect(buttons(i18n.t('uploads.request'))).toHaveLength(0)
    await click(buttons(i18n.t('actions.edit'))[0])

    // PDF-ის მოხსნა დოკუმენტებიდან
    const pdf = [...document.body.querySelectorAll('button[aria-pressed="true"]')].find((b) => b.textContent === 'PDF')!
    await click(pdf)
    await click(buttons(i18n.t('actions.save'))[0])

    expect(mocks.save).toHaveBeenCalledWith({ doc: { max_kb: 20480, formats: ['docx'] } })
  })

  it('refuses to save a kind without any format', async () => {
    await mount(true)
    await click(buttons(i18n.t('actions.edit'))[0])

    for (const f of ['PDF', 'DOCX']) {
      const chip = [...document.body.querySelectorAll('button[aria-pressed="true"]')].find((b) => b.textContent === f)!
      await click(chip)
    }

    expect(document.body.textContent).toContain(i18n.t('uploads.formatsRequired'))
    expect((buttons(i18n.t('actions.save'))[0] as HTMLButtonElement).disabled).toBe(true)
  })
})

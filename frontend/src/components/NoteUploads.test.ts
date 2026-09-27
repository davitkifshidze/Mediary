import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'

/* ============================================================
   **ფაილები ჯერ შეუნახავ ჩანაწერზე** (Tasks §23.4).

   ⚠️ აქამდე სამივე სექციაში „ჯერ შეინახე" ეწერა. ახლა ფაილი ბრაუზერში
   ემატება და შენახვისას ადის — და **ბრაუზერშივე მოწმდება**: 100 MB-ზე დიდი
   ვიდეო შენახვამდე ითქმის და არა ჩანაწერის შექმნის შემდეგ.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  limits: {
    data: {
      kinds: [
        { kind: 'image', max_kb: 8192, max_bytes: 1000, capped_by_server: false, mimes: [] },
        { kind: 'doc', max_kb: 20480, max_bytes: 1000, capped_by_server: false, mimes: ['pdf'] },
        { kind: 'video', max_kb: 102400, max_bytes: 1000, capped_by_server: false, mimes: ['mp4'] },
      ],
      max_files: 20,
      server: { upload_max_filesize: '100M', post_max_size: '100M', max_bytes: 1000 },
    },
  },
}))

vi.mock('@/lib/uploadLimits', async (original) => ({
  ...(await original<typeof import('@/lib/uploadLimits')>()),
  useUploadLimits: () => mocks.limits,
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
  root = null
  container = null
  vi.clearAllMocks()
})

async function mount() {
  const { NoteUploads } = await import('@/components/NoteUploads')
  const { usePendingUploads } = await import('@/lib/pendingUploads')

  function Harness() {
    const pending = usePendingUploads<'image' | 'doc' | 'video'>()
    return h(NoteUploads, { noteId: null, pending })
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(Harness)))),
  )

  return container
}

/** ფაილის არჩევა დამალულ `<input>`-ზე — ბრაუზერის დიალოგის გარეშე */
async function pick(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('NoteUploads before the note is saved', () => {
  it('keeps a picked document and never says "save first"', async () => {
    const el = await mount()

    expect(el.textContent).not.toContain(i18n.t('notes.uploadsSaveFirst'))

    // ⚠️ §23.4 — დოკუმენტსაც აქვს `accept`
    const doc = el.querySelector<HTMLInputElement>('input[type="file"][accept=".pdf"]')!
    expect(doc).toBeTruthy()

    await pick(doc, [new File(['x'], 'plan.pdf')])

    expect(el.textContent).toContain('plan.pdf')
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('refuses a file over the limit in the browser, by name', async () => {
    const el = await mount()
    const video = el.querySelector<HTMLInputElement>('input[type="file"][accept=".mp4"]')!

    await pick(video, [new File(['x'.repeat(2000)], 'huge.mp4')])

    expect(el.textContent).not.toContain('huge.mp4')
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'error', title: expect.stringContaining('huge.mp4') }),
    )
  })
})

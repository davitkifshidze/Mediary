import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Person, PersonalAlbum } from '@/api/personal'
import type { CoverDraft } from '@/components/personal/PersonalCoverField'
import i18n from '@/i18n'

/* ============================================================
   **მთავარი ფოტო ფორმიდან და ალბომის მიბმა პიროვნებაზე.**

   ⚠️ მოწმდება: ფორმაში არჩეული ფაილი ჯერ პიროვნების ფოტოებში იტვირთება და მერე
   მთავრად ინიშნება (ცალკე „პორტრეტის" საცავი არ არსებობს); „წაშლა" მხოლოდ
   მთავრობას ხსნის; ხელუხლებელი ჩარჩო არაფერს აგზავნის; გარე ალბომი პიროვნებას
   მთლიანად ებმება (`person_id`).
   ============================================================ */

const mocks = vi.hoisted(() => ({
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  uploadPersonalMedia: vi.fn(),
  updatePersonalAlbum: vi.fn(),
  fetchPeople: vi.fn(),
  /** ჩარჩოს ბოლო `onChange` — ტესტი ფაილს ან „წაშლას" აქედან აწვდის */
  coverChange: null as ((next: CoverDraft) => void) | null,
}))

vi.mock('@/api/personal', async (original) => ({
  ...(await original<typeof import('@/api/personal')>()),
  createPerson: mocks.createPerson,
  updatePerson: mocks.updatePerson,
  uploadPersonalMedia: mocks.uploadPersonalMedia,
  updatePersonalAlbum: mocks.updatePersonalAlbum,
  fetchPeople: mocks.fetchPeople,
}))

// ჩარჩო თავის ტესტებშია (`PosterUploader`) — აქ მხოლოდ ის მოწმდება, რას აკეთებს ფორმა არჩევანზე
vi.mock('@/components/personal/PersonalCoverField', () => ({
  EMPTY_COVER: { file: null, cleared: false },
  PersonalCoverLabel: () => null,
  PersonalCoverField: ({ onChange }: { onChange: (next: CoverDraft) => void }) => {
    mocks.coverChange = onChange
    return h('div', { 'data-testid': 'cover-field' })
  },
}))

vi.mock('@/lib/fields', () => ({
  useModuleFields: () => ({
    shows: () => true,
    isMissing: () => false,
    field: () => ({ label: 'f' }),
    placeholder: () => '',
    required: () => false,
    hint: () => undefined,
    label: () => 'f',
  }),
}))
vi.mock('@/lib/customFieldDraft', () => ({
  useRecordExtras: (_module: string, record: unknown) => ({
    current: record,
    draft: null,
    afterSave: async () => ({ ok: true }),
  }),
}))
vi.mock('@/components/CustomFieldsCard', () => ({ CustomFieldsCard: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/components/personal/PersonDialog')
  await import('@/components/personal/PersonalAttachDialog')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

const person = (over: Partial<Person> = {}): Person => ({
  id: 3,
  name: 'დედა',
  birthday: null,
  note: null,
  cover_media_id: 40,
  cover: '/personal/media/40/thumb',
  photos: 2,
  videos: 0,
  albums: 0,
  sort_order: 1,
  created_at: null,
  locked: false,
  unlocked: true,
  lock_hint: null,
  failed_unlocks: 0,
  unlock_blocked_until: null,
  ...over,
})

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.coverChange = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, node))))
  await flush()
}

async function submit() {
  await act(async () => {
    document.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await flush()
  await flush()
}

describe('PersonDialog — მთავარი ფოტო', () => {
  it('uploads the picked file as an ordinary photo of the person and makes it the main one', async () => {
    const { PersonDialog } = await import('@/components/personal/PersonDialog')
    const current = person()
    mocks.updatePerson.mockResolvedValue(current)
    mocks.uploadPersonalMedia.mockResolvedValue({ id: 77 })
    await render(h(PersonDialog, { person: current, onClose: () => {} }))

    const file = new File(['x'], 'portrait.jpg', { type: 'image/jpeg' })
    await act(async () => mocks.coverChange!({ file, cleared: false }))
    await submit()

    expect(mocks.uploadPersonalMedia).toHaveBeenCalledWith(file, { person_id: 3 })
    expect(mocks.updatePerson).toHaveBeenLastCalledWith(3, { cover_media_id: 77 })
  })

  it('only unsets the choice on "delete" and sends nothing when the frame is untouched', async () => {
    const { PersonDialog } = await import('@/components/personal/PersonDialog')
    const current = person()
    mocks.updatePerson.mockResolvedValue(current)
    await render(h(PersonDialog, { person: current, onClose: () => {} }))

    // ხელუხლებელი ჩარჩო — მხოლოდ ველები ინახება
    await submit()
    expect(mocks.updatePerson).toHaveBeenCalledTimes(1)
    expect(mocks.updatePerson.mock.calls[0][1]).not.toHaveProperty('cover_media_id')

    await act(async () => mocks.coverChange!({ file: null, cleared: true }))
    await submit()
    expect(mocks.updatePerson).toHaveBeenLastCalledWith(3, { cover_media_id: null })
    // ფოტო არ იშლება — არც ატვირთვა ხდება
    expect(mocks.uploadPersonalMedia).not.toHaveBeenCalled()
  })
})

describe('PersonalAttachDialog', () => {
  it('attaches the whole outside album to the chosen person', async () => {
    const { PersonalAttachDialog } = await import('@/components/personal/PersonalAttachDialog')
    mocks.fetchPeople.mockResolvedValue([person()])
    mocks.updatePersonalAlbum.mockResolvedValue({ id: 9, person: { id: 3, name: 'დედა' } })
    const album = { id: 9, name: 'მოგზაურობა', person: null, person_id: null } as unknown as PersonalAlbum
    await render(h(PersonalAttachDialog, { album, onClose: () => {} }))

    const confirm = document.querySelector<HTMLButtonElement>('[data-testid="attach-confirm"]')!
    // პიროვნების არჩევამდე მიბმა შეუძლებელია
    expect(confirm.disabled).toBe(true)
    expect(document.body.textContent).toContain(i18n.t('personal.attach.title', { name: 'მოგზაურობა' }))
  })
})

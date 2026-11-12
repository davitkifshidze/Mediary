import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CustomFieldDefinition } from '@/api/account'
import type { NoteCategory, NoteEntry } from '@/api/notes'
import type { Status } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **ახალი ჩანაწერი — დამატებითი ველები და ქვედა ზოლი**.

   ⚠️ ორი რამ მხოლოდ მონტირებით ჩანს: „შენახვის" ღილაკი `<form>`-ის
   **გარეთაა** (მიმაგრებული ზოლი) და მაინც ამ ფორმას უშვებს (`form="…"`),
   და ახალ ჩანაწერზე შევსებული დამატებითი ველი ჩანაწერის შექმნის შემდეგ
   ინახება — აქამდე იქ მხოლოდ „ჯერ შეინახე" ეწერა.
   ============================================================ */

const statuses = [
  { id: 1, key: 'open', module: 'note', name_ka: 'ღია', name_en: 'Open', role: 'todo', icon: null, color: null, is_default: true, sort_order: 0 },
] as Status[]

const categories = [
  { id: 3, key: 'work', name_ka: 'სამსახური', name_en: 'Work', icon: null, color: null, sort_order: 0 },
] as unknown as NoteCategory[]

const defs = [
  { key: 'mood', type: 'text', label_ka: 'განწყობა', label_en: 'Mood', enabled: true, required: false },
] as CustomFieldDefinition[]

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  uploadNoteFiles: vi.fn(),
  setNotePhoto: vi.fn(),
  privateUrl: vi.fn(),
  fetchCustomFields: vi.fn(),
  saveCustomFieldValues: vi.fn(),
  fetchModuleFields: vi.fn(),
  statuses: { data: [] as unknown[] },
}))

vi.mock('@/api/notes', async (original) => ({
  ...(await original<typeof import('@/api/notes')>()),
  createNote: mocks.createNote,
  updateNote: mocks.updateNote,
  uploadNoteFiles: mocks.uploadNoteFiles,
  setNotePhoto: mocks.setNotePhoto,
}))

// მთავარი ფოტო პრივატულ დისკზეა — ფორმა მას blob-ად კითხულობს
vi.mock('@/components/PrivateFile', async (original) => ({
  ...(await original<typeof import('@/components/PrivateFile')>()),
  usePrivateFileUrl: (url: string | null | undefined) => mocks.privateUrl(url),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchCustomFields: mocks.fetchCustomFields,
  saveCustomFieldValues: mocks.saveCustomFieldValues,
  fetchModuleFields: mocks.fetchModuleFields,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/lib/uploadLimits', async (original) => ({
  ...(await original<typeof import('@/lib/uploadLimits')>()),
  useUploadLimits: () => ({ data: undefined }),
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

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

async function mount(onSaved: (saved: unknown) => void, note: NoteEntry | null = null) {
  mocks.statuses.data = statuses
  mocks.privateUrl.mockImplementation((url: string | null | undefined) => ({ url: url ? 'blob:saved' : null, loading: false, failed: false }))
  mocks.updateNote.mockImplementation(async (id: number, input: object) => ({ id, ...input }))
  mocks.fetchCustomFields.mockResolvedValue(defs)
  mocks.fetchModuleFields.mockResolvedValue([])
  mocks.createNote.mockResolvedValue({ id: 5, title: 'x' })
  mocks.saveCustomFieldValues.mockImplementation(async (_m, _id, values) => values)

  const { NoteForm } = await import('@/components/NoteForm')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          TooltipProvider,
          null,
          h(NoteForm, { note, allTags: [], categories, onClose: () => {}, onSaved }),
        ),
      ),
    ),
  )
  await flush()
  await flush()
}

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Radix `Select`: კლავიატურით გახსნა და რიგის არჩევა */
async function choose(triggerId: string, label: string) {
  const trigger = document.getElementById(triggerId)!
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await flush()
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (o) => o.textContent?.trim() === label,
  )!
  await act(async () => option.click())
  await flush()
}

/* ⚠️ **მძიმე მოდულების გათბობა ტესტის ბიუჯეტის გარეთ**: ფორმა
   თარიღის ამრჩევს, ტეგებსა და ფაილებს ტვირთავს, და სრულ, პარალელურ გაშვებაზე
   პირველი იმპორტი 5 წამს ცდებოდა — ტესტი „დროში ვერ ჩაეტია" და არა „ჩავარდა". */
beforeAll(async () => {
  await import('@/components/NoteForm')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

describe('NoteForm (new note)', () => {
  it('the pinned save button sits outside the form and still submits it', async () => {
    await mount(() => {})

    const save = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
      (b) => b.textContent?.trim() === i18n.t('actions.save'),
    )!
    expect(save.closest('form')).toBeNull()
    expect(save.form?.id).toBe('note-form')
  })

  it('an extra field filled before saving is stored right after the note is created', async () => {
    const onSaved = vi.fn()
    await mount(onSaved)

    // „ჯერ შეინახე" აღარ წერია — ველი მაშინვე ივსება
    const mood = document.getElementById('cf-mood') as HTMLInputElement
    expect(mood).toBeTruthy()

    await type(document.getElementById('note-title') as HTMLInputElement, 'სია')
    await choose('note-category', 'სამსახური')
    await choose('note-status', 'ღია')
    await type(mood, 'კარგი')

    const save = [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
      (b) => b.textContent?.trim() === i18n.t('actions.save'),
    )!
    await act(async () => save.click())
    await flush()
    await flush()

    // ⚠️ შექმნა → ველების შენახვა → `onSaved` ჯაჭვია; დატვირთულ გაშვებაზე ორი `flush` არ კმარა
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mocks.createNote).toHaveBeenCalledTimes(1)
    expect(mocks.saveCustomFieldValues).toHaveBeenCalledWith('note', 5, { mood: 'კარგი' })
  })
})

/* იერი: ხატულა, ფონის ფერი და მთავარი ფოტო — ნებისმიერი კომბინაციით */
describe('NoteForm — look', () => {
  const saveButton = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find((b) => b.textContent?.trim() === i18n.t('actions.save'))!

  it('sends the colour with the note and uploads the chosen photo right after it is saved', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picked')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mocks.setNotePhoto.mockResolvedValue({ id: 5, title: 'სია', photo_url: '/notes/5/photo?v=11112222' })
    const onSaved = vi.fn()

    try {
      await mount(onSaved)
      await type(document.getElementById('note-title') as HTMLInputElement, 'სია')
      await choose('note-category', 'სამსახური')
      await choose('note-status', 'ღია')

      // ფონის ფერი პალიტრიდან
      const swatch = document.querySelector<HTMLButtonElement>(`[role="radio"][aria-label="${i18n.t('statuses.colorPick', { n: '3' })}"]`)!
      await act(async () => swatch.click())
      expect(swatch.getAttribute('aria-checked')).toBe('true')

      // მთავარი ფოტო: ჩარჩოში ჩაგდებული ფაილი შენახვამდე ბრაუზერშია
      const file = new File(['x'], 'cover.png', { type: 'image/png' })
      const input = document.querySelector<HTMLInputElement>('[data-testid="poster-dropzone"] input[type="file"]')!
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
      await vi.waitFor(() => expect(document.querySelector('[data-testid="poster-preview"]')).not.toBeNull())
      expect(mocks.setNotePhoto).not.toHaveBeenCalled()

      await act(async () => saveButton().click())
      await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())

      expect(mocks.createNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'სია', icon: null, color: 'c3' }))
      expect(mocks.createNote.mock.calls[0][0]).not.toHaveProperty('remove_photo')
      // ფოტო ჩანაწერის შემდეგ ადის — მის id-ზე — და ფანჯარა განახლებულ ჩანაწერს აბრუნებს
      expect(mocks.setNotePhoto).toHaveBeenCalledWith(5, file)
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ photo_url: '/notes/5/photo?v=11112222' }))
    } finally {
      create.mockRestore()
      revoke.mockRestore()
    }
  })

  it('an existing note shows its photo and icon; clearing both sends remove_photo and an empty icon', async () => {
    const note = {
      id: 9, title: 'დაზღვევა', description: null, icon: 'Car', color: 'c1', photo_url: '/notes/9/photo?v=aaaa0000',
      category_id: 3, category: categories[0], tags: [], links: [], status: statuses[0], is_favorite: false,
      visibility: 'private', created_at: null, updated_at: null,
    } as NoteEntry
    const onSaved = vi.fn()
    await mount(onSaved, note)

    // შენახული ფოტო პრივატული გზიდან იკითხება და ჩარჩოში ჩანს
    expect(mocks.privateUrl).toHaveBeenCalledWith('/notes/9/photo?v=aaaa0000')
    expect(document.querySelector('[data-testid="poster-preview"] img')?.getAttribute('src')).toBe('blob:saved')

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="poster-actions"] button[aria-label="remove"]')!.click())
    expect(document.querySelector('[data-testid="poster-preview"]')).toBeNull()
    expect(document.querySelector('[data-testid="poster-dropzone"]')).not.toBeNull()

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="note-icon-clear"]')!.click())
    expect(document.querySelector('[data-testid="note-icon-clear"]')).toBeNull()

    await act(async () => saveButton().click())
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())

    expect(mocks.updateNote).toHaveBeenCalledWith(9, expect.objectContaining({ icon: null, color: 'c1', remove_photo: true }))
    expect(mocks.setNotePhoto).not.toHaveBeenCalled()
  })
})

/* შემხსენებლების ზოლი სათაურის ზემოთაა; ახალზე გამორთული, მიზეზით */
describe('NoteForm — reminders bar', () => {
  it('the reminders bar sits above the title field and is disabled on a new note', async () => {
    await mount(() => {})

    const bar = document.querySelector<HTMLElement>('[data-testid="note-reminders-bar"]')!
    const title = document.getElementById('note-title')!
    expect(bar).not.toBeNull()
    // ზოლი DOM-ში სათაურის ველზე **წინაა**
    expect(bar.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const button = bar.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.textContent).toContain(i18n.t('notes.remindersTitle'))
    // ზოლი ფორმის ქვემოთ აღარ არის
    expect(document.querySelectorAll('[data-testid="note-reminders-bar"]')).toHaveLength(1)
  })
})

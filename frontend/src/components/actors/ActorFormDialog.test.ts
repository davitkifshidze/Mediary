import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Actor } from '@/api/media'
import i18n from '@/i18n'

/* ============================================================
   **ახალი მსახიობი** — ხელით შექმნა ველებით, TMDB-ის პირის
   არჩევა (საერთო ლექსიკონში შემოდის), ბიბლიოთეკაში უკვე მყოფის არჩევა
   (ახალი არ იქმნება) და ხელით შექმნილის რედაქტირება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  createActor: vi.fn(),
  updateActor: vi.fn(),
  searchCastMembers: vi.fn(),
}))

vi.mock('@/api/actors', async (original) => ({
  ...(await original<typeof import('@/api/actors')>()),
  createActor: mocks.createActor,
  updateActor: mocks.updateActor,
}))

vi.mock('@/api/cast', async (original) => ({
  ...(await original<typeof import('@/api/cast')>()),
  searchCastMembers: mocks.searchCastMembers,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ⚠️ ფანჯარა მძიმე ხეა (ფორმა, კალენდარი, ატვირთვა) — სრულ ნაკრებში ცივი იმპორტი 5 წამს სცდება
beforeAll(async () => {
  await import('@/components/actors/ActorFormDialog')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

const saved = (actor: Partial<Actor> = {}) => ({ actor: { id: 9, name: 'Nino Kasradze', name_ka: null, photo: null, tags: [], ...actor }, existing: false })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function render(actor?: Actor) {
  const onSaved = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const { ActorFormDialog } = await import('@/components/actors/ActorFormDialog')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(ActorFormDialog, { actor, onClose: () => {}, onSaved })))))
  )
  await flush()

  return onSaved
}

function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement

describe('ActorFormDialog', () => {
  it('creates an actor by hand with the filled fields', async () => {
    mocks.createActor.mockResolvedValue(saved())
    const onSaved = await render()

    type('actor-name', 'Nino Kasradze')
    type('actor-name-ka', 'ნინო ქასრაძე')
    type('actor-place', 'თბილისი')
    await act(async () => button(i18n.t('gallery.cast.female')).click())
    await act(async () => button(i18n.t('actors.form.create')).click())
    await flush()

    expect(mocks.createActor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Nino Kasradze', name_ka: 'ნინო ქასრაძე', gender: 1, place_of_birth: 'თბილისი' }),
    )
    expect(onSaved).toHaveBeenCalledWith(saved())
  })

  it('brings a TMDB person in, and an actor already in my library is opened without creating one', async () => {
    mocks.searchCastMembers.mockResolvedValue({
      tmdb: true,
      items: [
        { source: 'local', id: 4, tmdb_person_id: 11, name: 'Liam Neeson', name_ka: null, photo: null, known_for: null, attached: false },
        { source: 'tmdb', id: null, tmdb_person_id: 287, name: 'Brad Pitt', name_ka: null, photo: null, known_for: 'Fight Club', attached: false },
      ],
    })
    mocks.createActor.mockResolvedValue(saved({ id: 12, name: 'Brad Pitt' }))
    const onSaved = await render()

    type('actor-find', 'Pi')
    await act(async () => button(i18n.t('cast.search')).click())
    await flush()

    const candidate = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(name)) as HTMLButtonElement

    await act(async () => candidate('Brad Pitt').click())
    await flush()
    expect(mocks.createActor).toHaveBeenCalledWith({ tmdb_person_id: 287, name: 'Brad Pitt' })

    await act(async () => candidate('Liam Neeson').click())
    await flush()
    expect(mocks.createActor).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ existing: true, actor: expect.objectContaining({ id: 4 }) }))
  })

  it('edits my hand-made actor without the search block', async () => {
    mocks.updateActor.mockResolvedValue(saved({ name: 'Nino K.' }))
    await render({ id: 9, name: 'Nino Kasradze', name_ka: 'ნინო', photo: null, tags: [], created_by_me: true, is_private: true })

    expect(document.getElementById('actor-find')).toBeNull()

    type('actor-name', 'Nino K.')
    await act(async () => button(i18n.t('actions.save')).click())
    await flush()

    expect(mocks.updateActor).toHaveBeenCalledWith(9, expect.objectContaining({ name: 'Nino K.', name_ka: 'ნინო' }))
  })
})

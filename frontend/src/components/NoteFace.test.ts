import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/* ============================================================
   **ჩანაწერის სახე** — ფოტო, ან ხატულა ფონის ფერზე.

   ⚠️ მოწმდება წესი, რომელიც ოთხ ადგილას ერთია: ფოტო თუ არის — ის ჩანს; თუ არა —
   ხატულა (საკუთარი → კატეგორიისა → მოდულისა) ფერად ფონზე; ფერის გარეშე ჩარჩოს
   საკუთარი ფონი რჩება. ფოტო პრივატულია — მისამართი `usePrivateFileUrl`-იდან მოდის.
   ============================================================ */

const mocks = vi.hoisted(() => ({ privateUrl: vi.fn() }))

vi.mock('@/components/PrivateFile', () => ({
  usePrivateFileUrl: (url: string | null | undefined) => mocks.privateUrl(url),
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

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  return container
}

const note = (extra: Record<string, unknown> = {}) => ({ icon: null, color: null, photo_url: null, category: null, ...extra })

describe('NoteFace', () => {
  it('picks the icon: the note’s own, then the category’s, then the module’s', async () => {
    const { noteIcon } = await import('@/components/NoteFace')

    expect(noteIcon(note({ icon: 'Car', category: { icon: 'Briefcase' } }))).toBe('Car')
    expect(noteIcon(note({ category: { icon: 'Briefcase' } }))).toBe('Briefcase')
    expect(noteIcon(note())).toBe('NotebookPen')
  })

  it('draws the icon on the chosen colour and leaves the frame alone without one', async () => {
    const { NoteIconFace } = await import('@/components/NoteFace')

    const coloured = await mount(h(NoteIconFace, { note: note({ icon: 'Car', color: 'c7' }) }))
    const face = coloured.querySelector<HTMLElement>('[data-testid="note-face"]')!
    expect(face.dataset.icon).toBe('Car')
    expect(face.style.backgroundColor).toBe('var(--status-c7)')
    expect(face.querySelector('svg')).not.toBeNull()

    act(() => root?.unmount())
    container?.remove()

    const plain = await mount(h(NoteIconFace, { note: note({ color: 'not-a-colour' }) }))
    expect(plain.querySelector<HTMLElement>('[data-testid="note-face"]')!.style.backgroundColor).toBe('')
  })

  it('the tile shows the private photo when there is one and the icon while it is missing', async () => {
    const { NoteTile } = await import('@/components/NoteFace')

    mocks.privateUrl.mockReturnValue({ url: 'blob:photo-1', loading: false, failed: false })
    const withPhoto = await mount(h(NoteTile, { note: note({ photo_url: '/notes/5/photo?v=abc', color: 'c2' }) }))
    expect(mocks.privateUrl).toHaveBeenCalledWith('/notes/5/photo?v=abc')
    expect(withPhoto.querySelector('img')?.getAttribute('src')).toBe('blob:photo-1')
    expect(withPhoto.querySelector('[data-testid="note-face"]')).toBeNull()

    act(() => root?.unmount())
    container?.remove()

    // ჯერ იტვირთება (ან ფოტო არ არის) — ხატულა ფერად ფონზე და არა ცარიელი ჩარჩო
    mocks.privateUrl.mockReturnValue({ url: null, loading: true, failed: false })
    const loading = await mount(h(NoteTile, { note: note({ photo_url: '/notes/5/photo?v=abc', color: 'c2' }) }))
    expect(loading.querySelector('img')).toBeNull()
    expect(loading.querySelector<HTMLElement>('[data-testid="note-face"]')!.style.backgroundColor).toBe('var(--status-c2)')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

/* ============================================================
   **რიგის გადალაგება მის „სახლში" ინახება** — ფლეილისტში ან სიმღერების ხელით რიგში.

   ⚠️ მოწმდება: ფლეილისტის რიგი სრული სიით მიდის (ახალი თანმიმდევრობით), სიმღერების
   რიგი — `reorder`-ით; სახლის გარეშე რიგი არაფერს ინახავს; ვიდეოიანი ან
   გამეორებული ჩანაწერის მქონე რიგი ფლეილისტს არ გადააწერს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  setPlaylistSongs: vi.fn(),
  reorderSongs: vi.fn(),
}))

vi.mock('@/api/playlists', () => ({ setPlaylistSongs: mocks.setPlaylistSongs }))
vi.mock('@/api/songs', () => ({ reorderSongs: mocks.reorderSongs }))

afterEach(() => vi.clearAllMocks())

const song = (id: number) => ({ kind: 'song', id })

describe('saveQueueOrder', () => {
  it('writes a playlist queue back to the playlist in the new order', async () => {
    const { saveQueueOrder } = await import('@/lib/queueHome')
    mocks.setPlaylistSongs.mockResolvedValue({})

    const keys = await saveQueueOrder({ kind: 'playlist', id: 9 }, [song(3), song(1), song(2)])

    expect(mocks.setPlaylistSongs).toHaveBeenCalledWith(9, [3, 1, 2])
    expect(mocks.reorderSongs).not.toHaveBeenCalled()
    expect(keys).toEqual([['playlists']])
  })

  it('writes an “all songs” queue into the manual order of songs', async () => {
    const { saveQueueOrder } = await import('@/lib/queueHome')
    mocks.reorderSongs.mockResolvedValue([2, 1])

    const keys = await saveQueueOrder({ kind: 'songs' }, [song(2), song(1)])

    expect(mocks.reorderSongs).toHaveBeenCalledWith([2, 1])
    expect(mocks.setPlaylistSongs).not.toHaveBeenCalled()
    expect(keys).toEqual([['songs']])
  })

  it('saves nothing for a queue without a home', async () => {
    const { saveQueueOrder, homeOrder } = await import('@/lib/queueHome')

    expect(await saveQueueOrder(null, [song(1), song(2)])).toBeNull()
    expect(homeOrder(null, [song(1)])).toBeNull()
    expect(mocks.setPlaylistSongs).not.toHaveBeenCalled()
    expect(mocks.reorderSongs).not.toHaveBeenCalled()
  })

  it('never rewrites a playlist from a queue that no longer mirrors it', async () => {
    const { saveQueueOrder } = await import('@/lib/queueHome')
    const home = { kind: 'playlist', id: 9 } as const

    // ვიდეო რიგში — ფლეილისტი სიმღერებისაა
    expect(await saveQueueOrder(home, [song(1), { kind: 'video', id: 5 }])).toBeNull()
    // ერთი სიმღერა ორჯერ
    expect(await saveQueueOrder(home, [song(1), song(1)])).toBeNull()
    expect(await saveQueueOrder(home, [])).toBeNull()
    expect(mocks.setPlaylistSongs).not.toHaveBeenCalled()
  })
})

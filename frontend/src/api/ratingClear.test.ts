import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ============================================================
   **გასუფთავებული ქულა სერვერამდე მიდის** (Tasks §25.3, §4.8-ის წესი).

   ⚠️ წიგნის, სამაგიდოსა და სიმღერის სერიალიზატორი რიცხვს მხოლოდ მაშინ
   ამატებდა, როცა ის შევსებული იყო — ე.ი. „შეფასების გარეშე" (`null`)
   საერთოდ არ იგზავნებოდა და შენახვის შემდეგ ძველი ქულა უკან ბრუნდებოდა.
   წესი: `null` → ცარიელი სტრიქონი („გაასუფთავე"), `undefined` → არაფერი
   („არ შეეხო").
   ============================================================ */

const post = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: { post },
}))

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { data: {} } })
})

/** ბოლო გაგზავნილი ფორმის ველი — `null`, თუ საერთოდ არ გაიგზავნა */
const sent = (key: string) => (post.mock.calls.at(-1)?.[1] as FormData).get(key)

describe('clearing a rating', () => {
  it.each([
    ['book', async (rating: number | null | undefined) => (await import('@/api/books')).updateBook(1, { rating } as never)],
    ['game', async (rating: number | null | undefined) => (await import('@/api/games')).updateGame(1, { rating } as never)],
    ['board game', async (rating: number | null | undefined) => (await import('@/api/boardGames')).updateBoardGame(1, { rating } as never)],
    ['song', async (rating: number | null | undefined) => (await import('@/api/songs')).updateSong(1, { title: 't', url: 'https://x.test', rating } as never)],
    ['place', async (rating: number | null | undefined) => (await import('@/api/places')).updatePlace(1, { name: 'p', rating } as never)],
  ])('%s: null clears, undefined leaves it, a number is sent', async (_, save) => {
    await save(null)
    expect(sent('rating')).toBe('')

    await save(undefined)
    expect(sent('rating')).toBeNull()

    await save(8)
    expect(sent('rating')).toBe('8')
  })
})

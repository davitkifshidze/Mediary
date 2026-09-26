import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SerpImage } from '@/api/web'

/* ============================================================
   ვებიდან ფოტოების შემოტანა ნაწილებად (Tasks §4.3).

   ძებნა ნაგულისხმევად 100 შედეგს აბრუნებს, სერვერი კი ერთ მოთხოვნაზე 50-ს
   იღებს ⇒ „ყველას მონიშვნა“ 422 იყო. ახლა 100 → 50 + 50, ერთი შეჯამებით;
   კვოტამ გაჩერებული ნაწილი (413) უკვე შემოსულს არ აუქმებს.
   ============================================================ */

const post = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({ api: { post } }))

const images = (n: number): SerpImage[] =>
  Array.from({ length: n }, (_, i) => ({ original: `https://x.test/${i}.jpg` }) as SerpImage)

const result = (added: number, extra: Record<string, unknown> = {}) => ({
  added, skipped: 0, failed: 0, thumbnails: 0, bytes: added * 10, quota_exceeded: false,
  assigned: { 'movie:1': added }, ...extra,
})

beforeEach(() => post.mockReset())

describe('importWebImages', () => {
  it('100 ფოტოს ორ ნაწილად აგზავნის და შედეგს აჯამებს', async () => {
    const { importWebImages, WEB_IMPORT_CHUNK } = await import('@/api/web')
    post.mockResolvedValueOnce({ data: result(50) }).mockResolvedValueOnce({ data: result(48) })
    const progress: number[] = []

    const res = await importWebImages({ target: 'movie', id: 1, images: images(100) }, (done) => progress.push(done))

    expect(post).toHaveBeenCalledTimes(2)
    for (const call of post.mock.calls) expect(call[1].images.length).toBeLessThanOrEqual(WEB_IMPORT_CHUNK)
    expect(res.added).toBe(98)
    expect(res.bytes).toBe(980)
    expect(res.assigned).toEqual({ 'movie:1': 98 })
    expect(progress).toEqual([0, 50, 100])
  })

  it('კვოტაზე (413) ჩერდება, უკვე შემოსულს კი ინარჩუნებს', async () => {
    const { importWebImages, notImported } = await import('@/api/web')
    post
      .mockResolvedValueOnce({ data: result(50) })
      .mockRejectedValueOnce({ response: { status: 413, data: result(10, { quota_exceeded: true }) } })

    const res = await importWebImages({ target: 'movie', id: 1, images: images(150) })

    // მესამე ნაწილი აღარ იგზავნება
    expect(post).toHaveBeenCalledTimes(2)
    expect(res.quota_exceeded).toBe(true)
    expect(res.added).toBe(60)
    expect(notImported(res, 150)).toBe(90)
  })

  it('პირველივე ნაწილის სხვა შეცდომა ჩვეულებრივ ვარდება', async () => {
    const { importWebImages } = await import('@/api/web')
    post.mockRejectedValueOnce({ response: { status: 403, data: { message: 'forbidden' } } })

    await expect(importWebImages({ target: 'movie', id: 1, images: images(10) })).rejects.toBeTruthy()
  })
})

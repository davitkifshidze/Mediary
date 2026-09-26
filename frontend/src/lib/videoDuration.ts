/**
 * პირდაპირი ფაილის ხანგრძლივობა ბრაუზერიდან (Tasks K2 — ნარჩენი).
 *
 * `.mp4`/`.webm`/… ბმულზე oEmbed/API არ არსებობს, სამაგიეროდ ბრაუზერი
 * მხოლოდ metadata-ს ჩამოტვირთვით იცის `duration`. სერვერი ამას ვერ აკეთებს
 * (ffprobe არ გვაქვს), ამიტომ ველი ფორმაზე ივსება და ჩვეულებრივ იგზავნება.
 *
 * CORS არ სჭირდება — media ელემენტი cross-origin ფაილსაც კითხულობს
 * (`crossOrigin` განზრახ **არ** ეყენება: ჩართვისას მრავალი CDN 403-ს აბრუნებს).
 */

const FILE_EXTENSIONS = /\.(mp4|webm|ogg|ogv|m4v|mov|m4a|mp3)(\?|#|$)/i

/** წამები → `h:mm:ss` / `m:ss` */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds < 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** ბმული პირდაპირი მედია-ფაილია? (backend-ის `VideoUrl::parse`-ის ანალოგი) */
export function isDirectMediaUrl(url: string): boolean {
  return FILE_EXTENSIONS.test(url.trim())
}

/**
 * აბრუნებს ხანგრძლივობას წამებში, ან `null`-ს — თუ ვერ წაიკითხა
 * (არასწორი ბმული, დაბლოკილი წყარო, stream ცნობილი ხანგრძლივობის გარეშე).
 */
export function probeMediaDuration(url: string, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video')
    let done = false

    const finish = (value: number | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      el.removeAttribute('src')
      el.load() // ჩამოტვირთვის შეწყვეტა
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)

    el.preload = 'metadata'
    el.muted = true
    el.onloadedmetadata = () => {
      // ∞ — live stream; NaN — ვერ დადგინდა
      finish(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : null)
    }
    el.onerror = () => finish(null)
    el.src = url
  })
}

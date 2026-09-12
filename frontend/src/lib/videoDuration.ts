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

/**
 * წუთები → „2 სთ 20 წთ" (Tasks §2.5).
 *
 * ⚠️ `formatDuration`-ის ტყუპი არ არის და განზრახ: ის **წამებს** იღებს და
 * `h:mm:ss`-ს ხატავს (მედია-პლეერის ენა), აქ კი სვეტი წუთებშია და მკითხველს
 * „55:30" ორაზროვნად წაეკითხებოდა. ერთეულების წარწერები არგუმენტად მოდის,
 * რომ ამ ფაილს i18n არ დასჭირდეს.
 */
export function formatMinutes(
  total: number | null | undefined,
  hoursShort: string,
  minutesShort: string,
): string | null {
  if (!total || total < 0) return null
  const h = Math.floor(total / 60)
  const m = Math.round(total % 60)
  if (!h) return `${m} ${minutesShort}`
  return m ? `${h} ${hoursShort} ${m} ${minutesShort}` : `${h} ${hoursShort}`
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

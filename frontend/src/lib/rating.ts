/* ============================================================
   **„ჩემი ქულა" — ერთი შკალა, ერთი ფორმატი** (Tasks §9).

   შენი სიტყვები: „ვარსკვლავები; და ხელითაც გაწერო… ვარსკვლავი ივსება და
   მერე ეწეროს 4.6 / 10". შკალა ყველგან 0–10-ია მეათედებით (backend
   `Rating`), ვარსკვლავი კი ხუთია — ერთი ვარსკვლავი ორი ქულაა, ნახევარი
   ერთი. ეს ფაილი მხოლოდ არითმეტიკაა, რომ ვიჯეტი და ტესტი ერთსა და იმავეს
   ითვლიდნენ.

   ⚠️ **ფილმზე ორი ქულაა** (Q1): `rating` TMDB-ის საშუალოა (სტრიქონი, API-ის
   ძველი ფორმა), `my_rating` — შენი. `cardRatings()` საჯარო/გაზიარების
   ბარათზე ამ ორს ერთმანეთისგან არჩევს, რომ TMDB-ის 6.8 „შენს ქულად" არ
   დაიხატოს.
   ============================================================ */

export const RATING_MAX = 10
export const RATING_STARS = 5
const POINTS_PER_STAR = RATING_MAX / RATING_STARS

/** „4.6" ან „7" — მთელი ქულა ნულის გარეშე, წილადი მეათედით */
export function formatRating(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** i-ური (0-დან) ვარსკვლავის შევსების წილი 0…1 */
export function starFill(value: number | null, index: number): number {
  if (value == null) return 0
  return Math.min(1, Math.max(0, value / POINTS_PER_STAR - index))
}

/** ვარსკვლავზე დაჭერა → ქულა: მარცხენა ნახევარი ნახევარი ვარსკვლავია */
export function ratingFromStar(index: number, half: boolean): number {
  return (index + (half ? 0.5 : 1)) * POINTS_PER_STAR
}

/**
 * რიცხვითი ველის ტექსტი → ქულა ან `null`.
 * ⚠️ ცარიელი, არარიცხვი და 0 — „ქულის გარეშე" (`Rating::normalize()`-ის იგივე წესი);
 * მძიმე წერტილად ითვლება, მეტი სიზუსტე მეათედამდე მრგვალდება, ჭერი 10-ია.
 */
export function parseRating(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  if (!text.trim() || !Number.isFinite(n) || n <= 0) return null
  return Math.min(RATING_MAX, Math.round(n * 10) / 10)
}

const MEDIA_DOMAINS = new Set(['movie', 'series', 'anime'])

/**
 * საჯარო/გაზიარების ბარათი: **მფლობელის** ქულა და (მედიაზე) TMDB-ის საშუალო
 * ცალ-ცალკე. მედიაზე `rating` TMDB-ისაა და `my_rating` — ადამიანის;
 * დანარჩენ დომენებზე `rating` თვითონაა პირადი და საშუალო არ არსებობს.
 */
export function cardRatings(card: {
  domain: string
  rating?: number | string | null
  my_rating?: number | null
}): { mine: number | null; average: string | null } {
  const toNumber = (v: number | string | null | undefined): number | null => {
    if (v == null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  if (MEDIA_DOMAINS.has(card.domain)) {
    return {
      mine: toNumber(card.my_rating),
      average: card.rating == null || card.rating === '' ? null : String(card.rating),
    }
  }

  return { mine: toNumber(card.rating), average: null }
}

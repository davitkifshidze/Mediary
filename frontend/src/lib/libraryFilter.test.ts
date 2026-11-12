import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { EMPTY_PICK_FILTER, pickFilterChips, pickFilterParams, type LibraryPickFilter } from '@/lib/libraryFilter'

/* ============================================================
   **„რა ვნახო დღეს?" ფანჯრის ფილტრი ბიბლიოთეკაზე**: სიის ფილტრის ასლი
   API-ის პარამეტრებად იქცევა და ჩიპებად იშლება — თითო ჩიპი თავის პირობას ხსნის.
   ============================================================ */

const genres = [
  { id: 1, slug: 'comedy', name_en: 'Comedy', name_ka: 'კომედია' },
  { id: 2, slug: 'horror', name_en: 'Horror', name_ka: 'საშინელება' },
]

const filter: LibraryPickFilter = {
  ...EMPTY_PICK_FILTER,
  q: ' love ',
  genres: ['comedy', 'horror'],
  genreMode: 'all',
  favorite: true,
  ranges: { ...EMPTY_PICK_FILTER.ranges, yearMin: '2010', yearMax: '2000', myRatingMin: '8' },
  drill: { done: '2026-03' },
}

const chips = (f: LibraryPickFilter) => pickFilterChips(f, { genres, lang: 'ka', t: i18n.t })

describe('ბიბლიოთეკის ფანჯრის ფილტრი', () => {
  it('ცარიელი ფილტრი არაფერს აგზავნის და ჩიპი არ აქვს', () => {
    expect(Object.values(pickFilterParams(EMPTY_PICK_FILTER)).filter((v) => v !== undefined)).toEqual([])
    expect(chips(EMPTY_PICK_FILTER)).toEqual([])
  })

  it('პარამეტრებში შებრუნებული წყვილი გადაისმება, რეჟიმი მხოლოდ რამდენიმე ჟანრზე მიდის', () => {
    expect(pickFilterParams(filter)).toMatchObject({
      q: 'love',
      genre: 'comedy,horror',
      genre_mode: 'all',
      favorite: true,
      year_min: 2000,
      year_max: 2010,
      my_rating_min: 8,
      done: '2026-03',
    })
    expect(pickFilterParams({ ...filter, genres: ['comedy'] }).genre_mode).toBeUndefined()
  })

  it('თითო პირობა ჩიპია და ✕ მხოლოდ მას ხსნის', () => {
    const list = chips(filter)

    expect(list.map((c) => c.key)).toEqual([
      'q',
      'favorite',
      'genre-comedy',
      'genre-horror',
      'genre-mode',
      'year',
      'my-rating',
      'drill-done',
    ])
    expect(list.find((c) => c.key === 'genre-comedy')!.label).toBe('კომედია')
    // შებრუნებული წყვილი წარწერაშიც გადასმულია
    expect(list.find((c) => c.key === 'year')!.label).toContain('2000–2010')
    expect(list.find((c) => c.key === 'my-rating')!.label).toContain('≥ 8')

    const withoutComedy = list.find((c) => c.key === 'genre-comedy')!.without
    expect(withoutComedy.genres).toEqual(['horror'])
    expect(withoutComedy.q).toBe(filter.q)
    // ერთ ჟანრზე „ყველა ერთად" ჩიპი აღარ ჩანს
    expect(chips(withoutComedy).some((c) => c.key === 'genre-mode')).toBe(false)

    expect(list.find((c) => c.key === 'year')!.without.ranges).toMatchObject({ yearMin: '', yearMax: '', myRatingMin: '8' })
    expect(list.find((c) => c.key === 'drill-done')!.without.drill).toEqual({})
  })
})

import { useTranslation } from 'react-i18next'
import type { Genre } from '@/api/types'
import { genreName } from '@/lib/display'
import { filterCount } from '@/lib/filters'
import { GENRE_MODES, type GenreMode, type LibraryDraft, type Ranges } from '@/lib/libraryFilter'
import type { MediaType } from '@/lib/media'
import { useContentLang } from '@/lib/settings'
import { FilterGroup, FilterOption, FilterOptionList, FilterRange } from '@/components/FilterPanel'
import { Chip, ChipRow } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'

/**
 * **ფილმის · სერიალის · ანიმეს ფილტრის ველები** — ჟანრები (რეჟიმით) და სამი დიაპაზონი.
 *
 * ⚠️ ერთი კომპონენტი ორ ადგილას: სიის პანელსა და „რა ვნახო დღეს" ფანჯარაში — ფანჯრის
 * „ფილტრის შეცვლა" ზუსტად იმავე ველებს აჩვენებს, რასაც სია.
 *
 * ⚠️ `onChange` **ფუნქციით** ცვლის (`(d) => …`): ჯგუფის „გასუფთავება" თითო რიგის
 * `onChange(false)`-ს ზედიზედ იძახებს — მნიშვნელობით ჩაწერა ბოლოს გარდა ყველას დაკარგავდა.
 */
export function LibraryFilterFields({
  type,
  genres,
  draft,
  onChange,
  genreMode,
  onGenreMode,
}: {
  type: MediaType
  /** ჟანრები — უკვე კონტენტის ენაზე დალაგებული */
  genres: Genre[]
  draft: LibraryDraft
  onChange: (update: (current: LibraryDraft) => LibraryDraft) => void
  genreMode: GenreMode
  onGenreMode: (mode: GenreMode) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const currentYear = new Date().getFullYear()

  const toggleGenre = (slug: string, on: boolean) =>
    onChange((d) => ({ ...d, genres: on ? [...d.genres, slug] : d.genres.filter((g) => g !== slug) }))

  const setRange = (key: keyof Ranges, value: string) =>
    onChange((d) => ({ ...d, ranges: { ...d.ranges, [key]: value } }))

  return (
    <>
      {/* სტატუსის ჯგუფი აქ განზრახ არ არის — სექცია საიდბარშია, ფანჯარაში კი თავისი ჩიპებია */}
      <FilterGroup title={t('filter.genres')} count={draft.genres.length}>
        {/* რამდენიმე ჟანრი: ერთი მაინც თუ ყველა ერთად */}
        <ChipRow className="mb-2 items-center gap-1.5 px-0.5">
          {GENRE_MODES.map((mode) => (
            <Chip key={mode} active={genreMode === mode} onClick={() => onGenreMode(mode)} className="py-1">
              {t(`filter.genreMode.${mode}`)}
            </Chip>
          ))}
          <InfoHint info={t('filter.genreMode.hint')} />
        </ChipRow>
        <FilterOptionList>
          {genres.map((g) => (
            <FilterOption
              key={g.slug}
              label={genreName(g, lang)}
              // ⚠️ თითო მოდული თავის რიცხვს: ანიმეს გვერდზე ფილმების რაოდენობა ცარიელ ჟანრს სავსედ აჩვენებდა
              count={type === 'series' ? g.series_count : type === 'anime' ? g.animes_count : g.movies_count}
              checked={draft.genres.includes(g.slug)}
              onChange={(on) => toggleGenre(g.slug, on)}
            />
          ))}
        </FilterOptionList>
      </FilterGroup>

      {/* ⚠️ დიაპაზონები **გაშლილია** (ჯგუფის ნაგულისხმევი მდგომარეობა):
          შეკეცილი ჯგუფი მალავდა იმას, რომ წელი და ქულა საერთოდ იფილტრება.
          შეკეცვა შესაძლებელი რჩება, უბრალოდ ხელით. */}
      <FilterGroup title={t('filter.ranges')} count={filterCount(draft.ranges)} info={t('filter.rangesHint')}>
        <div className="space-y-3 px-0.5 pt-1">
          <FilterRange
            label={t('filter.year')}
            from={draft.ranges.yearMin}
            to={draft.ranges.yearMax}
            onFrom={(v) => setRange('yearMin', v)}
            onTo={(v) => setRange('yearMax', v)}
            fromPlaceholder="1700"
            toPlaceholder={String(currentYear + 1)}
            min={1700}
            max={currentYear + 1}
          />
          <FilterRange
            label={t('filter.tmdbRating')}
            from={draft.ranges.ratingMin}
            to={draft.ranges.ratingMax}
            onFrom={(v) => setRange('ratingMin', v)}
            onTo={(v) => setRange('ratingMax', v)}
            fromPlaceholder="0.0"
            toPlaceholder="10.0"
            min={0}
            max={10}
            step="0.1"
          />
          <FilterRange
            label={t('filter.myRating')}
            from={draft.ranges.myRatingMin}
            to={draft.ranges.myRatingMax}
            onFrom={(v) => setRange('myRatingMin', v)}
            onTo={(v) => setRange('myRatingMax', v)}
            fromPlaceholder="1"
            toPlaceholder="10"
            min={1}
            max={10}
            step="0.5"
          />
        </div>
      </FilterGroup>
    </>
  )
}

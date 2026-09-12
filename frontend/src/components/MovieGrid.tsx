import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MovieCard } from './MovieCard'
import { statusName } from '@/lib/statuses'
import { genreName } from '@/lib/display'
import type { MediaType } from '@/lib/media'
import { useContentLang, useSettings, type CardSize, type GroupBy } from '@/lib/settings'
import type { MovieListItem } from '@/api/types'

/* ============================================================
   ბადე — ბარათის ზომითა და სექციებად დაჯგუფებით (Tasks 18).

   ⚠️ **დაჯგუფება ფრანჩაიზისა არაა.** ფრანჩაიზა backend-ის `group=`-ია
   (კოლექცია ერთ ბარათად იკვრება); აქ ბადე ვიზუალურ სექციებად იშლება.
   ორივე ერთდროულად მუშაობს და ერთმანეთს არ ეხება.
   ============================================================ */

/** ბარათის ზომა = სვეტების რაოდენობა; `medium` ისტორიული ნაგულისხმევია */
const COLUMNS: Record<CardSize, string> = {
  compact: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
  medium: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  large: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4',
}

interface Section {
  key: string
  title: string
  /** დალაგებისთვის — წელი რიცხვია, დანარჩენი ტექსტი */
  sort: number | string
  movies: MovieListItem[]
}

export function MovieGrid({
  movies,
  type = 'movie',
  groupBy = 'off',
}: {
  movies: MovieListItem[]
  type?: MediaType
  groupBy?: GroupBy
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { settings } = useSettings()
  const columns = COLUMNS[settings.cardSize] ?? COLUMNS.medium

  const sections = useMemo<Section[] | null>(() => {
    if (groupBy === 'off') return null

    const buckets = new Map<string, Section>()
    const push = (key: string, title: string, sort: number | string, movie: MovieListItem) => {
      const bucket = buckets.get(key)
      if (bucket) bucket.movies.push(movie)
      else buckets.set(key, { key, title, sort, movies: [movie] })
    }

    for (const movie of movies) {
      if (groupBy === 'year') {
        // ⚠️ წელი **კლებადობით** ეწყობა (ახალი ზემოთ), დანარჩენი ანბანურად
        push(String(movie.year ?? 'none'), movie.year ? String(movie.year) : t('sort.groupNone'), movie.year ?? -1, movie)
      } else if (groupBy === 'status') {
        /* §6.4 — სტატუსი ლექსიკონის რიგია: დაჯგუფება `key`-ზე, სათაური
           ლექსიკონის სახელიდან, რიგი კი `sort_order`-იდან (ე.ი. სექციები
           იმავე თანმიმდევრობით დგება, რაც საიდბარშია). */
        const st = movie.status
        push(
          st?.key ?? 'none',
          st ? statusName(st, lang) : t('sort.groupNone'),
          st ? st.sort_order : 999,
          movie,
        )
      } else {
        // ⚠️ **პირველი ჟანრი და არა ყველა** — თორემ სამჟანრიანი ფილმი
        // ბადეზე სამჯერ გამოჩნდებოდა და მრიცხველიც აღარ დაემთხვეოდა სიის სიგრძეს.
        const first = movie.genres[0]
        push(first ? `g${first.id}` : 'none', first ? genreName(first, lang) : t('sort.groupNone'), first ? genreName(first, lang) : '￿', movie)
      }
    }

    return [...buckets.values()].sort((a, b) => {
      if (typeof a.sort === 'number' && typeof b.sort === 'number') return b.sort - a.sort
      return String(a.sort).localeCompare(String(b.sort), lang)
    })
  }, [movies, groupBy, lang, t])

  if (!sections) {
    return (
      <div className={`grid gap-x-4 gap-y-6 ${columns}`}>
        {movies.map((m) => (
          <MovieCard key={m.id} movie={m} type={type} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key}>
          <h2 className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
            <span className="font-display text-lg font-semibold tracking-tight">{section.title}</span>
            <span className="text-sm text-muted-foreground">{section.movies.length}</span>
          </h2>
          <div className={`grid gap-x-4 gap-y-6 ${columns}`}>
            {section.movies.map((m) => (
              <MovieCard key={m.id} movie={m} type={type} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

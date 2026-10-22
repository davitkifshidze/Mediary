import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MovieCard, MovieRow } from './MovieCard'
import { MediaLockedCard, MediaLockedRow } from './MediaLockedCard'
import { RecordList } from './RecordView'
import { statusName } from '@/lib/statuses'
import { genreName } from '@/lib/display'
import type { MediaType } from '@/lib/media'
import { useContentLang, useSettings, type CardSize, type GroupBy } from '@/lib/settings'
import type { MovieListItem } from '@/api/types'
import type { RecordLayout } from '@/lib/recordLayout'

/* ============================================================
   ბადე — ბარათის ზომითა და სექციებად დაჯგუფებით.

   ⚠️ **დაჯგუფება ფრანჩაიზისა არაა.** ფრანჩაიზა backend-ის `group=`-ია
   (კოლექცია ერთ ბარათად იკვრება); აქ ბადე ვიზუალურ სექციებად იშლება.
   ორივე ერთდროულად მუშაობს და ერთმანეთს არ ეხება.
   ============================================================ */

/** ბარათის ზომა = სვეტების რაოდენობა; `medium` ისტორიული ნაგულისხმევია */
/* ⚠️ **კონტეინერის** ზღვრები და არა ეკრანისა: `<main>` `@container`-ია
   და დამკვრელის პანელით მიწოლილ გვერდზე სვეტები თავისით იკლებს. `@2xl`=42rem ≈ `sm`,
   `@3xl`=48rem ≈ `md`, `@5xl`=64rem ≈ `lg`, `@7xl`=80rem = `xl` (1280px).
   ⚠️ ზედა ზღვარი (10 · 6 · 4) `lib/pageSize.ts`-ის `POSTER_COLUMNS`-შიცაა — „გვერდზე
   რამდენის" ვარიანტები მისი ჯერადია; ერთად უნდა შეიცვალოს. */
const COLUMNS: Record<CardSize, string> = {
  compact: 'grid-cols-3 @2xl:grid-cols-4 @3xl:grid-cols-6 @5xl:grid-cols-8 @7xl:grid-cols-10',
  medium: 'grid-cols-2 @2xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 @7xl:grid-cols-6',
  large: 'grid-cols-1 @2xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 @7xl:grid-cols-4',
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
  layout = 'cards',
}: {
  movies: MovieListItem[]
  type?: MediaType
  groupBy?: GroupBy
  /** ბარათები (პარამეტრების ზომით) · ბადე (კომპაქტური) · სტრიქონები */
  layout?: RecordLayout
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { settings } = useSettings()
  const columns = layout === 'grid' ? COLUMNS.compact : (COLUMNS[settings.cardSize] ?? COLUMNS.medium)

  /* ⚠️ დაჯგუფება სამივე ხედში მუშაობს — სექცია თავის სიას ხატავს */
  const items = (list: MovieListItem[]) =>
    layout === 'rows' ? (
      <RecordList layout="rows">
        {list.map((m) =>
          m.hidden ? <MediaLockedRow key={m.id} movie={m} type={type} /> : <MovieRow key={m.id} movie={m} type={type} />,
        )}
      </RecordList>
    ) : (
      <div className={`grid gap-x-4 gap-y-6 ${columns}`}>
        {list.map((m) =>
          m.hidden ? <MediaLockedCard key={m.id} movie={m} type={type} /> : <MovieCard key={m.id} movie={m} type={type} />,
        )}
      </div>
    )

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
        /* სტატუსი ლექსიკონის რიგია: დაჯგუფება `key`-ზე, სათაური
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
        // ბოქლომიან ბარათს ჟანრი არ მოსდევს
        const first = movie.genres?.[0]
        push(first ? `g${first.id}` : 'none', first ? genreName(first, lang) : t('sort.groupNone'), first ? genreName(first, lang) : '￿', movie)
      }
    }

    return [...buckets.values()].sort((a, b) => {
      if (typeof a.sort === 'number' && typeof b.sort === 'number') return b.sort - a.sort
      return String(a.sort).localeCompare(String(b.sort), lang)
    })
  }, [movies, groupBy, lang, t])

  if (!sections) return items(movies)

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key}>
          <h2 className="mb-3 flex items-baseline gap-2 border-b border-border pb-1.5">
            <span className="font-display text-lg font-semibold tracking-tight">{section.title}</span>
            <span className="text-sm text-muted-foreground">{section.movies.length}</span>
          </h2>
          {items(section.movies)}
        </section>
      ))}
    </div>
  )
}

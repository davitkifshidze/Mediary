import type { TFunction } from 'i18next'
import type { SoonItem } from '@/api/soon'

/* ============================================================
   „მალე" ბარათის ხაზი — რა გამოდის და როდის.

   „12 დეკ 2026 · პრემიერა" · „3 მარ 2027 · ახალი სეზონი 4" ·
   „20 ნოე 2026 · სეზონი 2, სერია 5" · „თარიღი უცნობია · მზადდება".
   ============================================================ */

/** TMDB-ის მდგომარეობა → i18n-ის გასაღების ბოლო („Post Production" → `post_production`) */
const TMDB_STATUS: Record<string, string> = {
  Rumored: 'rumored',
  Planned: 'planned',
  'In Production': 'in_production',
  'Post Production': 'post_production',
  Pilot: 'pilot',
}

/** TMDB-ის მდგომარეობა ეკრანის ენაზე; უცნობი სიტყვა ისე ჩანს, როგორც მოვიდა */
export function tmdbStatusLabel(status: string | null, t: TFunction): string | null {
  if (!status) return null
  const key = TMDB_STATUS[status]

  return key ? t(`soon.tmdbStatus.${key}`) : status
}

/** რა გამოდის — პრემიერა, ახალი სეზონი თუ შემდეგი სერია */
export function soonWhat(item: Pick<SoonItem, 'kind' | 'season' | 'episode' | 'tmdb_status'>, t: TFunction): string | null {
  switch (item.kind) {
    case 'premiere':
      return t('soon.kind.premiere')
    case 'season':
      return item.season != null ? t('soon.kind.season', { season: item.season }) : t('soon.kind.premiere')
    case 'episode':
      return item.season != null && item.episode != null
        ? t('soon.kind.episode', { season: item.season, episode: item.episode })
        : t('soon.kind.episodeUnknown')
    default:
      return tmdbStatusLabel(item.tmdb_status, t)
  }
}

/** ბარათის ხაზი: თარიღი (ან „თარიღი უცნობია") · რა გამოდის */
export function soonLine(
  item: Pick<SoonItem, 'date' | 'kind' | 'season' | 'episode' | 'tmdb_status'>,
  t: TFunction,
  formatDate: (value: string) => string,
): string {
  const when = item.date ? formatDate(item.date) : t('soon.dateUnknown')

  return [when, soonWhat(item, t)].filter(Boolean).join(' · ')
}

import type { CastMember, Genre, MovieListItem } from '@/api/types'

type Lang = string

/** ფილმის სახელი მიმდინარე ენაზე (fallback მეორე ენაზე) */
export function movieTitle(m: Pick<MovieListItem, 'title_ka' | 'title_en'>, lang: Lang): string {
  return lang === 'ka'
    ? m.title_ka || m.title_en || '—'
    : m.title_en || m.title_ka || '—'
}

/** მეორადი (ქვე-)სახელი — მეორე ენა, თუ განსხვავდება */
export function movieSubtitle(m: Pick<MovieListItem, 'title_ka' | 'title_en'>, lang: Lang): string | null {
  const primary = movieTitle(m, lang)
  const other = lang === 'ka' ? m.title_en : m.title_ka
  return other && other !== primary ? other : null
}

export function genreName(g: Pick<Genre, 'name_ka' | 'name_en'>, lang: Lang): string {
  return lang === 'ka' ? g.name_ka || g.name_en : g.name_en || g.name_ka || ''
}

export function castName(c: CastMember, lang: Lang): string {
  return lang === 'ka' ? c.name_ka || c.name : c.name
}

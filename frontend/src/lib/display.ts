import type { ApprovalRequestItem } from '@/api/account'
import type { CastMember, Genre, MovieListItem } from '@/api/types'
import { formatBytes } from '@/lib/utils'

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

/* --- TMDB-ის ჩანაწერები (discover / მსახიობის შემოთავაზებები): `title` = EN, `title_ka` = თარგმანი --- */

type TmdbTitled = { title: string; title_ka?: string | null }

/** სახელი მიმდინარე ენაზე (fallback ინგლისურზე) */
export function tmdbTitle(s: TmdbTitled, lang: Lang): string {
  return lang === 'ka' ? s.title_ka || s.title : s.title
}

/** მეორადი (ქვე-)სახელი — მეორე ენა, თუ განსხვავდება */
export function tmdbSubtitle(s: TmdbTitled, lang: Lang): string | null {
  const primary = tmdbTitle(s, lang)
  const other = lang === 'ka' ? s.title : s.title_ka
  return other && other !== primary ? other : null
}

export function genreName(g: Pick<Genre, 'name_ka' | 'name_en'>, lang: Lang): string {
  return lang === 'ka' ? g.name_ka || g.name_en : g.name_en || g.name_ka || ''
}

/**
 * როლის სახელი (Tasks 1.6). სახელი ბაზიდან მოდის, რომ **საკუთარი** როლებიც
 * ითარგმნებოდეს — i18n-ის `roles.*` მხოლოდ სისტემურ ორს იცნობდა.
 */
export function roleName(
  r: { role_name_ka?: string | null; role_name_en?: string | null; role?: string },
  lang: Lang,
): string {
  const name = lang === 'ka' ? r.role_name_ka || r.role_name_en : r.role_name_en || r.role_name_ka
  return name || r.role || '—'
}

/** ვიდეოს ტიპის სახელი (Tasks 5.1) — იგივე წესი, რაც ჟანრზე */
export function videoTypeName(t: { name_ka: string; name_en: string }, lang: Lang): string {
  return lang === 'ka' ? t.name_ka || t.name_en : t.name_en || t.name_ka || ''
}

/**
 * ⚠️ **`Pick`-ია და არა სრული `CastMember`**: მსახიობის სახელი გალერეის
 * ვიწრო ფორმებშიც ჩნდება (`GalleryCastMember`, ფოტოს `actor`), ე.ი. სრული
 * ტიპის მოთხოვნა მეორე, იდენტურ რენდერერს დაწერდა.
 */
export function castName(c: Pick<CastMember, 'name' | 'name_ka'>, lang: Lang): string {
  return lang === 'ka' ? c.name_ka || c.name : c.name
}

/* --- მოთხოვნები (`approval_requests`) --- */

/** მოთხოვნილი სრული ლიმიტი ბაიტებში (17.4) — `payload`-ის ერთადერთი მკითხველი */
export function requestedQuota(r: ApprovalRequestItem): number {
  return Number(r.payload?.requested_bytes ?? 0)
}

/** დამტკიცებისას რეალურად მინიჭებული ლიმიტი (თუ ადმინმა სხვა რიცხვი დაწერა) */
export function grantedQuota(r: ApprovalRequestItem): number | null {
  const value = r.payload?.granted_bytes
  return value == null ? null : Number(value)
}

/**
 * მოთხოვნის ერთსტრიქონიანი აღწერა. **ერთი წყარო** სამივე ხედისთვის —
 * `/requests` (ადმინის სია + ჩემი), `/users/{id}` და `/settings` — თორემ
 * ახალი ტიპის დამატებისას ერთგან დაგვავიწყდებოდა.
 */
export function requestLabel(
  r: ApprovalRequestItem,
  lang: Lang,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (r.type === 'module_access') {
    const name = (lang === 'ka' ? r.module?.name_ka : r.module?.name_en) ?? '—'
    return t('admin.wantsModule', { name })
  }

  if (r.type === 'storage_increase') {
    return t('admin.wantsStorage', {
      requested: formatBytes(requestedQuota(r)),
      current: formatBytes(Number(r.payload?.current_bytes ?? 0)),
    })
  }

  const name = (lang === 'ka' ? r.genre?.name_ka : r.genre?.name_en) ?? '—'
  return t('admin.wantsGenreDelete', { name })
}

import { api } from '@/lib/api'

/* ============================================================
   სეზონები და ეპიზოდები (FEAT-09).

   ⚠️ **ერთი endpoint ორივე TV-დომენზე** (`series` · `anime`) —
   `/media/sync/{type}/{id}`-ის იგივე ფორმა. ფილმი აქ ვერ მოხვდება:
   მას სეზონი არ აქვს და მარშრუტიც მხოლოდ TV-ტიპებს იღებს.
   ============================================================ */

export type TvType = 'series' | 'anime'

export interface Episode {
  id: number
  episode: number
  name: string | null
  air_date: string | null
  runtime: number | null
  watched: boolean
  watched_at: string | null
}

export interface Season {
  season: number
  total: number
  watched: number
  episodes: Episode[]
}

export interface EpisodeOverview {
  total: number
  watched: number
  percent: number
  next: { id: number; season: number; episode: number; name: string | null; air_date: string | null } | null
  seasons: Season[]
}

/** მონიშვნის პასუხი — პროგრესს უკვე შეცვლილს აბრუნებს */
export interface EpisodeMarkResult extends EpisodeOverview {
  changed: number
  /** ახალი როლი, თუ სტატუსი პროგრესმა გადაანაცვლა (`null` — არ შეცვლილა) */
  status_role: string | null
}

export interface EpisodeSyncResult extends EpisodeOverview {
  synced: { seasons: number; episodes: number }
}

export async function fetchEpisodes(type: TvType, id: number): Promise<EpisodeOverview> {
  const res = await api.get(`/media/episodes/${type}/${id}`)
  return res.data
}

/** ეპიზოდების ჩამოტანა TMDB-იდან — სეზონზე ერთი გამოძახება, ამიტომ ცხადი ღილაკია */
export async function syncEpisodes(type: TvType, id: number): Promise<EpisodeSyncResult> {
  const res = await api.post(`/media/episodes/${type}/${id}`)
  return res.data
}

/**
 * მონიშვნა/მოხსნა.
 *
 * ⚠️ **`PATCH` და არა `POST`** — არსებულ ჩანაწერს ვცვლით; POST-ს
 * `EnsureModulePermission` `create`-ად წაიკითხავდა.
 *
 * ⚠️ **სეზონი ნომრით მიდის და არა id-ების სიით**: ბრაუზერს მხოლოდ
 * ჩატვირთული გვერდი აქვს, სეზონი კი სრული უნდა იყოს — სიას სერვერი აგებს.
 */
export async function markEpisodes(
  type: TvType,
  id: number,
  body: { watched: boolean; episode_ids?: number[]; season?: number },
): Promise<EpisodeMarkResult> {
  const res = await api.patch(`/media/episodes/${type}/${id}`, body)
  return res.data
}

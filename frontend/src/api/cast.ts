import { api } from '@/lib/api'
import type { MediaType } from '@/lib/media'
import type { CastMember } from './types'

/* ============================================================
   ჩანაწერის მსახიობების ხელით მართვა (ეტაპი 1, 2026-09-13).

   ⚠️ **ოთხივე მისამართი `media/cast/{type}/{id}`-ია** და არა
   `movies/{id}/cast` — ზუსტად ის ფორმა, რაც `/media/sync/{type}/{id}`-ს
   აქვს: ერთი endpoint სამივე მედია-დომენზე, ტიპი მისამართშია. დომენზე
   თითო ასლი მეოთხე დომენის დღეს სამ ადგილას გასასწორებელი იქნებოდა.
   ============================================================ */

/** ერთი რიგი ძებნის შედეგში — ბიბლიოთეკიდან ან TMDB-დან */
export interface CastCandidate {
  source: 'local' | 'tmdb'
  /** ლექსიკონის id — TMDB-ის რიგზე `null` (ჯერ არ შემოსულა) */
  id: number | null
  tmdb_person_id: number | null
  name: string
  name_ka: string | null
  photo: string | null
  /** „რითი არის ცნობილი" — ერთსახელიანების გასარჩევად */
  known_for: string | null
  /** უკვე აბია ამ ჩანაწერს */
  attached: boolean
}

export interface CastSearchResult {
  items: CastCandidate[]
  /** `null` = TMDB-ის გასაღები არ არის · `false` = არ გვიპასუხა · `true` = გვიპასუხა */
  tmdb: boolean | null
}

export interface AttachCastInput {
  cast_member_id?: number
  tmdb_person_id?: number
  name?: string
  name_ka?: string
  gender?: number
  character?: string
}

export async function searchCastMembers(
  q: string,
  ctx?: { type: MediaType; id: number },
): Promise<CastSearchResult> {
  const { data } = await api.get<CastSearchResult>('/cast/search', {
    params: { q, type: ctx?.type, id: ctx?.id },
  })
  return data
}

export async function attachCastMember(
  type: MediaType,
  id: number,
  input: AttachCastInput,
): Promise<CastMember> {
  const { data } = await api.post<{ data: CastMember }>(`/media/cast/${type}/${id}`, input)
  return data.data
}

export async function updateRecordCast(
  type: MediaType,
  id: number,
  castId: number,
  input: { character?: string | null; billing_order?: number },
): Promise<CastMember> {
  const { data } = await api.patch<{ data: CastMember }>(
    `/media/cast/${type}/${id}/${castId}`,
    input,
  )
  return data.data
}

export async function detachCastMember(type: MediaType, id: number, castId: number) {
  await api.delete(`/media/cast/${type}/${id}/${castId}`)
}

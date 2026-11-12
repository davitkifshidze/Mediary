import { isCustomModuleKey } from '@/lib/customModules'

/* ============================================================
   **ჩანაწერის მისამართი მისსავე მოდულში** — გალერეის ბარათიდან, ვიდეოს წყაროდან.

   ⚠️ მოდულის ფესვი გამომძახებლისგან მოდის (`GET /api/modules`) — მისამართების მეორე
   ასლი აქ არ იწერება. წესი სამი სახისაა:
   - ფილმს · სერიალს · ანიმეს საკუთარი გვერდი აქვს (`/movies/12`), მსახიობს — `/actors/5`;
   - ბუკმარკი, კურსი, ვიდეო და პირადი მოდული ჩანაწერს id-ით ხსნის (`?open=12`);
   - დანარჩენებში ჩანაწერი ფანჯარაში იხსნება და პირდაპირი ბმული არ არსებობს — სექცია
     სათაურის ძებნით იხსნება (`?q=`), როგორც ძებნის შედეგი (`lib/searchResults.ts`).
   ============================================================ */

const MEDIA = ['movie', 'series', 'anime']

/** მოდულები, რომელთა გვერდიც `?open=<id>`-ს კითხულობს */
const OPENS_BY_ID = ['bookmark', 'course', 'video']

export interface RecordRef {
  /** მოდულის გასაღები (`movie` · `place` · `c5-recipes`) ან `actor` */
  kind: string
  id: number
  title: string | null
}

/** ჩანაწერის გახსნა; `null` — მისამართი ვერ აიგება (მოდული გამორთულია, სათაური უცნობია) */
export function recordOpenPath(record: RecordRef, routeBase: string | undefined): string | null {
  if (record.kind === 'actor') return `/actors/${record.id}`
  if (!routeBase) return null

  if (MEDIA.includes(record.kind)) return `${routeBase}/${record.id}`
  if (OPENS_BY_ID.includes(record.kind) || isCustomModuleKey(record.kind)) return `${routeBase}?open=${record.id}`

  return recordListPath(record, routeBase)
}

/** მოდულის სია ამ ჩანაწერზე დავიწროებული (სათაურის ძებნით) */
export function recordListPath(record: RecordRef, routeBase: string | undefined): string | null {
  if (record.kind === 'actor' || !routeBase || !record.title) return null

  return `${routeBase}?q=${encodeURIComponent(record.title)}`
}

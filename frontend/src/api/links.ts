import { api } from '@/lib/api'

/* ============================================================
   **ბმულის მეტა-მონაცემი — ერთი კარი ყველა ფორმისთვის** (Tasks §15).

   `POST /links/metadata` ჯერ ვიდეო-პლატფორმას ცნობს (YouTube/Vimeo/
   Dailymotion → oEmbed: სათაური, არხი, ესკიზი, ხანგრძლივობა), სხვა
   შემთხვევაში გვერდის `<head>`-ს კითხულობს (Open Graph). ⚠️ ჩავარდნა
   ცარიელი 200-ია — ველები `null`-ით ბრუნდება და ფორმა ხელით ივსება.
   ============================================================ */

export interface LinkPreview {
  kind: 'video' | 'page'
  url: string
  platform: string
  external_id: string | null
  embed_url: string | null
  title: string | null
  description: string | null
  image_url: string | null
  favicon_url: string | null
  site_name: string | null
  domain: string | null
  author: string | null
  duration: number | null
}

/** რას აქვს აზრი გაგზავნას — ნახევრად აკრეფილი „htt" სერვერს არ უნდა მივაწოდოთ */
export function isProbeableUrl(value: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(value.trim())
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const { data } = await api.post('/links/metadata', { url: url.trim() })
  return data
}

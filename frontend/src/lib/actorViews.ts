import { Drama, Images, Star } from 'lucide-react'

/* ============================================================
   მსახიობების გვერდის ხედები — **ერთი რუკა** გვერდისთვისაც და საიდბარისთვისაც
   (`galleryCuts.ts`-ის წესი: საიდბარი `pages/`-ს არ იმპორტებს).

   · **ყველა** — ყველა ჩემი მსახიობი;
   · **რჩეულები** — ვინც ვარსკვლავით მოვნიშნე;
   · **გალერეა** — მხოლოდ ისინი, ვისაც ჩემი ფოტო ან ვიდეო-ბმული აქვს, დასტებად.

   ⚠️ ხედი მისამართშია (`/actors?view=…`) — ბრაუზერის „უკან" და საიდბარის
   მონიშვნა ერთსა და იმავეს კითხულობს.
   ============================================================ */

export type ActorView = 'all' | 'favorites' | 'gallery'

export const ACTOR_VIEWS = [
  { key: 'all', icon: Drama, color: 'var(--tool-actors)' },
  { key: 'favorites', icon: Star, color: 'var(--favorite)' },
  { key: 'gallery', icon: Images, color: 'var(--tool-people)' },
  // ⚠️ `color` სავალდებულოა: მენიუს ქვეპუნქტის აიქონი ყოველთვის ფერადია
] as const satisfies readonly { key: ActorView; icon: unknown; color: string }[]

/** `?view=`-ის მნიშვნელობა → ხედი; უცნობი „ყველაა" */
export function actorViewOf(value: string | null | undefined): ActorView {
  return value === 'favorites' || value === 'gallery' ? value : 'all'
}

/** ხედის მისამართი */
export function actorViewPath(view: ActorView): string {
  return view === 'all' ? '/actors' : `/actors?view=${view}`
}

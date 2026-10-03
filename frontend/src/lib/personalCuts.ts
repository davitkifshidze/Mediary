import { Clapperboard, Folders, Users } from 'lucide-react'

/* ============================================================
   **პირადი გალერეის ჭრილები (Tasks §33.5)** — ერთი რუკა გვერდისთვისაც და
   საიდბარისთვისაც (`galleryCuts.ts`-ის წესი: გვერდის იმპორტი საიდბარიდან
   მთელ ლაითბოქსს საწყის ბანდლში ჩაათრევდა).

   ⚠️ **„ადამიანები" პირველია** — შენს მოთხოვნაში ასეა რიგი („ადამიანები ·
   ალბომები · ფოტო & ვიდეო"), და მოდულის ფესვიც (`/personal`) მისია.
   ============================================================ */

export type PersonalCut = 'people' | 'albums' | 'media'

export const PERSONAL_CUTS = [
  { key: 'people', path: '/personal', icon: Users },
  { key: 'albums', path: '/personal/albums', icon: Folders },
  { key: 'media', path: '/personal/media', icon: Clapperboard },
] as const satisfies readonly { key: PersonalCut; path: string; icon: unknown }[]

import { Clapperboard, Folders, Users } from 'lucide-react'

/* ============================================================
   **პირადი გალერეის ჭრილები** — ერთი რუკა გვერდისთვისაც და
   საიდბარისთვისაც (`galleryCuts.ts`-ის წესი: გვერდის იმპორტი საიდბარიდან
   მთელ ლაითბოქსს საწყის ბანდლში ჩაათრევდა).

   ⚠️ **„პიროვნებები" პირველია** — შენს მოთხოვნაში ასეა რიგი („პიროვნებები ·
   ალბომები · ფოტო & ვიდეო"), და მოდულის ფესვიც (`/personal`) მისია. გვერდზე
   ჭრილები ბარათ-ტაბებია (`CutTabs`), საიდბარში — ქვე-მენიუ.
   ⚠️ **„ადამიანი" აქ აღარ წერია** — ცნებას „პიროვნება" ჰქვია (`GLOSSARY.md`);
   იდენტიფიკატორები (`people`, `Person`) იგივე დარჩა.
   ============================================================ */

export type PersonalCut = 'people' | 'albums' | 'media'

export const PERSONAL_CUTS = [
  { key: 'people', path: '/personal', icon: Users, color: 'var(--tool-people)' },
  { key: 'albums', path: '/personal/albums', icon: Folders, color: 'var(--gold)' },
  { key: 'media', path: '/personal/media', icon: Clapperboard, color: 'var(--tool-stats)' },
  // ⚠️ `color` სავალდებულოა (`satisfies`): მენიუს ქვეპუნქტის აიქონი ყოველთვის ფერადია
] as const satisfies readonly { key: PersonalCut; path: string; icon: unknown; color: string }[]

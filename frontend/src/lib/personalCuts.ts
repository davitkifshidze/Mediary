import { Folders, LayoutGrid, MonitorSmartphone, Users } from 'lucide-react'

/* ============================================================
   **პირადი გალერეის ჭრილები** — ერთი რუკა გვერდისთვისაც და
   საიდბარისთვისაც (`galleryCuts.ts`-ის წესი: გვერდის იმპორტი საიდბარიდან
   მთელ ლაითბოქსს საწყის ბანდლში ჩაათრევდა).

   ⚠️ **„ყველა" პირველია** (ყოფილი „ფოტო & ვიდეო") და მოდულის ფესვიც (`/personal`)
   მისია: რიგი — ყველა · პიროვნებები · ალბომები. შიდა გასაღები `media` დარჩა (ძველი
   მისამართი `/personal/media` იმავე ჭრილს ხსნის). გვერდზე ჭრილები ბარათ-ტაბებია
   (`CutTabs`), საიდბარში — ქვე-მენიუ.
   ⚠️ **„ადამიანი" აქ აღარ წერია** — ცნებას „პიროვნება" ჰქვია (`GLOSSARY.md`);
   იდენტიფიკატორები (`people`, `Person`) იგივე დარჩა.
   ============================================================ */

export type PersonalCut = 'people' | 'albums' | 'media' | 'screenshots'

export const PERSONAL_CUTS = [
  { key: 'media', path: '/personal', icon: LayoutGrid, color: 'var(--tool-stats)' },
  { key: 'people', path: '/personal/people', icon: Users, color: 'var(--tool-people)' },
  { key: 'albums', path: '/personal/albums', icon: Folders, color: 'var(--gold)' },
  /* სქრინშოტები — ცალკე სივრცე საკუთარი ალბომებით: „ყველა"-ში, პიროვნებებსა და
     ალბომებში არ ერევა (პაროლების სქრინშოტი ოჯახის ფოტოებს შორის არ უნდა გამოჩნდეს) */
  { key: 'screenshots', path: '/personal/screenshots', icon: MonitorSmartphone, color: 'var(--tool-requests)' },
  // ⚠️ `color` სავალდებულოა (`satisfies`): მენიუს ქვეპუნქტის აიქონი ყოველთვის ფერადია
] as const satisfies readonly { key: PersonalCut; path: string; icon: unknown; color: string }[]

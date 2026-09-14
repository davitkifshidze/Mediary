import { Boxes, Film, Images, Radio, Users, Video } from 'lucide-react'

/* ============================================================
   გალერეის ჭრილები (§8.5) — **ერთი რუკა** გვერდისთვისაც და საიდბარისთვისაც.

   ⚠️ **რატომ ცალკე ფაილში და არა `GalleryPage.tsx`-ში.** საიდბარი ამ სიას
   კითხულობს, ე.ი. `import … from '@/pages/GalleryPage'` მთელ გალერეის
   გვერდს (ლაითბოქსით, `react-select`-ით და ვებძებნის დიალოგებით)
   **საწყის ბანდლში** ათრევდა — მარშრუტების `lazy()`-ს სწორედ ეს ერთი
   იმპორტი აზრს უკარგავდა (გაზომილი: `photo-grid` 57 kB, `selectStyles`
   81 kB და `WebVideoDialog` 34 kB საწყის ნაკრებში ისხდნენ).

   ორი ასლი მაინც არ ჩნდება — სია აქ ერთია და ორივე მხარე აქედან კითხულობს.
   ============================================================ */

export type GalleryCut = 'all' | 'records' | 'actors' | 'videos' | 'sources' | 'modules'

/** ჭრილი → მისამართი და ხატულა */
export const GALLERY_CUTS = [
  { key: 'all', path: '/gallery', icon: Images },
  { key: 'records', path: '/gallery/records', icon: Film },
  { key: 'actors', path: '/gallery/actors', icon: Users },
  { key: 'videos', path: '/gallery/videos', icon: Video },
  { key: 'sources', path: '/gallery/sources', icon: Radio },
  { key: 'modules', path: '/gallery/modules', icon: Boxes },
] as const satisfies readonly { key: GalleryCut; path: string; icon: unknown }[]

/**
 * **ჭრილის სახელი (ეტაპი 2).**
 *
 * ⚠️ **„ჩანაწერები" ცუდი სახელია მაშინ, როცა მხოლოდ ფილმები გაქვს** — ესაა
 * შენი შენიშვნა („რატო დაარქვი, ფილმებია ეს"). სახელი ახლა **ჩართული
 * მედია-მოდულებიდან** იგება: ერთია — „ფილმები", ორია — „ფილმები · სერიალები".
 *
 * ⚠️ **სახელს `useModules()` აძლევს და არა i18n-ის ცალკე გასაღები** — მოდულის
 * სახელი ბაზაშია (`modules.name_ka/name_en`) და საიდბარიც სწორედ მას ხატავს;
 * მეორე წყარო ერთ დღეს გაშორდებოდა (და გადარქმეულ მოდულს ძველ სახელს
 * აჩვენებდა).
 *
 * ⚠️ **ფოლბექი მაინც საჭიროა** — მედია-მოდული შეიძლება საერთოდ არ იყოს
 * ჩართული (ჭრილში მაშინ სიმღერა/წიგნი/თამაში დგას), და უსახელო ტაბი
 * უარესია, ვიდრე ზოგადი „ჩანაწერები".
 */
export function galleryCutLabel(cut: GalleryCut, fallback: string, mediaNames: string[]): string {
  return cut === 'records' && mediaNames.length > 0 ? mediaNames.join(' · ') : fallback
}

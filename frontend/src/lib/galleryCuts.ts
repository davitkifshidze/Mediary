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

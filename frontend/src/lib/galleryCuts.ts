import { Boxes, Folders, Images, LibraryBig, Radio, Users, Video } from 'lucide-react'

/* ============================================================
   გალერეის ჭრილები — **ერთი რუკა** გვერდისთვისაც და საიდბარისთვისაც.

   ⚠️ **რატომ ცალკე ფაილში და არა `GalleryPage.tsx`-ში.** საიდბარი ამ სიას
   კითხულობს, ე.ი. `import … from '@/pages/GalleryPage'` მთელ გალერეის
   გვერდს (ლაითბოქსით, `react-select`-ით და ვებძებნის დიალოგებით)
   **საწყის ბანდლში** ათრევდა — მარშრუტების `lazy()`-ს სწორედ ეს ერთი
   იმპორტი აზრს უკარგავდა (გაზომილი: `photo-grid` 57 kB, `selectStyles`
   81 kB და `WebVideoDialog` 34 kB საწყის ნაკრებში ისხდნენ).

   ორი ასლი მაინც არ ჩნდება — სია აქ ერთია და ორივე მხარე აქედან კითხულობს.
   ============================================================ */

export type GalleryCut =
  | 'all'
  | 'records'
  | 'actors'
  | 'albums'
  | 'videos'
  | 'sources'
  | 'modules'

/** ჭრილი → მისამართი და ხატულა */
export const GALLERY_CUTS = [
  { key: 'all', path: '/gallery', icon: Images, color: 'var(--mod)' },
  { key: 'records', path: '/gallery/records', icon: LibraryBig, color: 'var(--tool-bulk)' },
  { key: 'actors', path: '/gallery/actors', icon: Users, color: 'var(--tool-people)' },
  /* ⚠️ **„უკატეგორიო" → „ალბომები" (შენი მითითება, 2026-09-16).** ჭრილის
     სახელი მისი **ნარჩენით** ერქვა — „ის ფოტოები, რომლებსაც მშობელი არ
     ჰყავთ" —, თუმცა მისი შინაარსი ალბომებია: სწორედ აქ ალაგებ, ქმნი
     საქაღალდეს და ჩააგდებ ფოტოს. „უკატეგორიო" ახლა ერთი ბარათია შიგნით
     („ალბომის გარეშე") და არა მთელი სექციის სახელი.
     ⚠️ ძველი მისამართი `/gallery/uncategorized` ცოცხალია და აქ
     გადმოამისამართებს — შენახული ბმული არ უნდა გატყდეს. */
  { key: 'albums', path: '/gallery/albums', icon: Folders, color: 'var(--gold)' },
  { key: 'videos', path: '/gallery/videos', icon: Video, color: 'var(--tool-translations)' },
  { key: 'sources', path: '/gallery/sources', icon: Radio, color: 'var(--tool-sync)' },
  { key: 'modules', path: '/gallery/modules', icon: Boxes, color: 'var(--tool-modules)' },
  // ⚠️ `color` სავალდებულოა (`satisfies`): მენიუს ქვეპუნქტის აიქონი ყოველთვის ფერადია
] as const satisfies readonly { key: GalleryCut; path: string; icon: unknown; color: string }[]

/* ⚠️ **`galleryCutLabel()` წაშლილია.** ის ჭრილის სახელს ჩართული
   მედია-მოდულებისგან აწყობდა („ფილმები · სერიალები · ანიმეები") და შენი
   შენიშვნაც სწორედ ეს იყო: ტაბისთვის გრძელია, ოთხ მოდულზე კიდევ
   გაიზრდება — და **მაინც იტყუება**, რადგან ამ ჭრილში სიმღერაც ზის,
   წიგნიც და თამაშიც. სახელი, რომელიც ჩამოთვლას ცდილობს, ან ვერ ეტევა,
   ან არასრულია.

   ახლა ჭრილს **ერთი ზოგადი სახელი** აქვს (`gallery.cut.records` —
   „ბიბლიოთეკა"), ხოლო რომელი დომენებია შიგნით, ბარათებზე წერია, თითოს
   თავისი რიცხვით. ფუნქცია რომ დარჩენილიყო `t()`-ს გადამცემ
   გარსად, ორივე მხარეს ეჭვი დარჩებოდა, ხომ არ აკეთებს ის კიდევ რაღაცას. */

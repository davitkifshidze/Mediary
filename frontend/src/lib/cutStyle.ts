import type { LucideIcon } from 'lucide-react'
import {
  BellOff,
  BellRing,
  BookOpen,
  Boxes,
  CheckCheck,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  DatabaseBackup,
  FileText,
  Film,
  Frame,
  Globe,
  Image,
  Images,
  LayoutGrid,
  ListMusic,
  Lock,
  MessageSquare,
  Radio,
  Sparkles,
  User,
  UserCog,
  Users,
  Video,
} from 'lucide-react'

/* ============================================================
   **ჭრილის ხატულა და ტონი — ერთი რეესტრი** (Tasks §2).

   შენი სიტყვები: „ყველგან სადაც არის ტაბების მსგავსი რამ ან გადამრთველი,
   იყოს ქარდის სტილის ტაბი შესაბამისი ფერით და აიქონებით".

   ხატულებიან ბარათებზე გადაყვანისას გამოჩნდა, რომ **ცხრა ჭრილიდან სამს
   ფერი და ხატულა საერთოდ არ ჰქონდა** (შეხსენების მდგომარეობები,
   ხილვადობა, არა-მოდულური დომენები), ორს კი არასწორ ადგილას ჰქონდა —
   `RequestsPage`-ის ლოკალურ `STATUSES`-ში და `GALLERY_SCOPE_STYLE`-ში,
   რომელიც `components/`-ში იჯდა და მხოლოდ გალერეას ემსახურებოდა.
   სამივე აქ გადმოვიდა; ფორმა `lib/actionStyle.ts`-ის ზუსტი ასლია.

   ⚠️ **ფერი თემის ტოკენია (`var(--…)`) და არასდროს hex** — `modAccent()`
   მნიშვნელობას `color-mix()`-ში სვამს, ე.ი. მუქ თემას მეორე პალიტრა არ
   სჭირდება (`index.css`-ს ორივე ნაკრები ერთ ადგილას აქვს).

   ⚠️ **`statusTone()` აქ არ გამოდგება** — `lib/statusStyles.ts` Tailwind-ის
   **კლასებს** აბრუნებს და არა CSS-ცვლადებს, ბარათს კი ცვლადი სჭირდება.

   ⚠️ **გასაღები საერთოა ორ მხარეს.** მაგ. `active`/`paused`/`done`-ს
   `ReminderCard`-იც კითხულობს, ე.ი. ერთსა და იმავე შეხსენებას ბარათზე
   და ტაბზე **ერთი** ფერი აქვს. ორი კომპლექტი ზუსტად ის დაშორება იქნებოდა,
   რისთვისაც ეს ფაილი გაჩნდა.
   ============================================================ */

export type CutStyle = { icon: LucideIcon; color: string }

const CUT_STYLE: Record<string, CutStyle> = {
  /* ---- საერთო ---- */
  all: { icon: LayoutGrid, color: 'var(--primary)' },

  /* ---- გალერეის კატეგორიები (TMDB-ის ტექნიკური ტიპი) ---- */
  backdrop: { icon: Frame, color: 'var(--tool-sync)' },
  poster: { icon: Image, color: 'var(--gold)' },
  logo: { icon: Sparkles, color: 'var(--tool-requests)' },
  actor: { icon: User, color: 'var(--tool-people)' },

  /* ---- მსახიობების სქესი (TMDB: 1 = ქალი, 2 = კაცი) ---- */
  female: { icon: User, color: 'var(--favorite)' },
  male: { icon: User, color: 'var(--tool-chat)' },

  /* ---- გალერეის „წყაროები": ორი სხვადასხვა კითხვა ---- */
  provider: { icon: Radio, color: 'var(--tool-translations)' },
  source: { icon: Film, color: 'var(--tool-sync)' },

  /* ---- ჩანაწერები ↔ მსახიობები ერთი დომენის შიგნით ---- */
  records: { icon: Film, color: 'var(--tool-bulk)' },
  /* ⚠️ მხოლობითი ფორმებიც დევს, რადგან გამომძახებლები ერთსა და იმავე
     ცნებას სხვადასხვაგვარად ამოძახებენ: გალერეის ჭრილს „ჩანაწერები"
     ჰქვია, ჩამოტვირთვის დიალოგის ნაკადს კი „ჩანაწერი". ორივე ერთსა
     და იმავე სახეს უნდა ხატავდეს, ე.ი. ალიასი აქ სჯობს იმას, რომ
     გამომძახებელმა ხატულა და ტონი ხელით გადმოსცეს. */
  record: { icon: Film, color: 'var(--tool-bulk)' },
  actors: { icon: Users, color: 'var(--tool-people)' },
  module: { icon: Boxes, color: 'var(--tool-modules)' },

  /* ---- მოთხოვნების მდგომარეობა (`RequestsPage`-იდან გადმოვიდა) ----
     ⚠️ ფერი მდგომარეობისაა: რიგი — „ჯერ არ გადაწყვეტილა", დამტკიცებული —
     მწვანე, უარყოფილი — წითელი. */
  pending: { icon: Clock, color: 'var(--status-undecided)' },
  approved: { icon: CircleCheck, color: 'var(--icon-ok)' },
  rejected: { icon: CircleX, color: 'var(--destructive)' },

  /* ---- შეხსენების მდგომარეობა (`lib/reminders.ts::reminderState`) ----
     ⚠️ ხატულები `ReminderCard`-ს უკვე ჰქონდა — აქ **გადმოვიდა** და არა
     ხელახლა გამოიგონა. ⚠️ „შეჩერებული" და „აღარ გაისვრის" სხვადასხვა
     ფერია განზრახ: პირველი ერთი დაჭერით ბრუნდება, მეორეს რედაქტირება
     სჭირდება — სწორედ ეს განსხვავება ქრებოდა, სანამ ორივე ნაცრისფერი იყო. */
  active: { icon: BellRing, color: 'var(--primary)' },
  paused: { icon: BellOff, color: 'var(--status-undecided)' },
  done: { icon: CheckCheck, color: 'var(--icon-ok)' },

  /* ---- ხილვადობა (Tasks §16.1) ---- */
  public: { icon: Globe, color: 'var(--icon-ok)' },
  private: { icon: Lock, color: 'var(--status-undecided)' },

  /* ---- დომენები, რომლებიც მოდული **არ** არის ----
     ⚠️ `cast` გლობალური ლექსიკონია, `playlist` სიმღერის შიგნითაა,
     `gallery` მოდულია მაგრამ ჩანაწერს ვერ ხსნის, ხოლო `account`/`chat`/
     `backup` ფსევდო-მოდულებია საცავის ჭრილში. `modules.color` მათ ვერ
     უპასუხებს, ე.ი. ფერი მხოლოდ აქედან მოდის. */
  cast: { icon: Users, color: 'var(--tool-people)' },
  playlist: { icon: ListMusic, color: 'var(--tool-chat)' },
  gallery: { icon: Images, color: 'var(--gold)' },
  account: { icon: UserCog, color: 'var(--tool-users)' },
  chat: { icon: MessageSquare, color: 'var(--tool-chat)' },
  backup: { icon: DatabaseBackup, color: 'var(--tool-backups)' },

  /* ---- საცავის ფაილის სახეობა ---- */
  image: { icon: Image, color: 'var(--tool-sync)' },
  video: { icon: Video, color: 'var(--tool-translations)' },
  doc: { icon: FileText, color: 'var(--muted-foreground)' },
  book: { icon: BookOpen, color: 'var(--tool-dictionaries)' },
}

/**
 * უცნობი ჭრილი ნეიტრალურად იხატება და **არ** ქრება — `actionStyle()`-ის
 * წესი: სერვერს ხვალ ახალი დომენი შეიძლება დაემატოს, ხატულის უქონელი
 * რიგი კი ჩუმად გამქრალი ჭრილი იქნებოდა.
 */
export function cutStyle(key: string): CutStyle {
  return CUT_STYLE[key] ?? { icon: CircleSlash, color: 'var(--muted-foreground)' }
}

/** რეესტრში ჩაწერილი გასაღებები — ტესტს სჭირდება, რომ ყველა შეამოწმოს */
export const CUT_STYLE_KEYS = Object.keys(CUT_STYLE)

/** ამ ჭრილს რეესტრში საკუთარი ჩანაწერი აქვს? (მოდულის ფერს ეს არ ეხება) */
export function hasCutStyle(key: string): boolean {
  return key in CUT_STYLE
}

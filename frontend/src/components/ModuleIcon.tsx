import { Suspense, lazy } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Award,
  Bell,
  Book,
  BookMarked,
  BookOpen,
  BookOpenCheck,
  Bookmark,
  Boxes,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  Circle,
  CircleDot,
  Clapperboard,
  Clock,
  Coffee,
  Crown,
  Dices,
  Download,
  Dumbbell,
  Eye,
  EyeOff,
  FileText,
  Film,
  Flag,
  Flame,
  Folder,
  FolderHeart,
  FolderOpen,
  Gamepad2,
  Globe,
  GraduationCap,
  HardDriveDownload,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Hourglass,
  Image,
  Inbox,
  Joystick,
  Key,
  Layers,
  LayoutGrid,
  Leaf,
  Library,
  Lightbulb,
  Link as LinkIcon,
  List,
  ListChecks,
  ListMusic,
  MapPin,
  MessageSquare,
  Mic,
  Music,
  Newspaper,
  NotebookPen,
  Paperclip,
  PawPrint,
  Pause,
  Pin,
  Plane,
  Play,
  Puzzle,
  Radio,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Swords,
  Tag,
  Tags,
  ThumbsUp,
  Trophy,
  Tv,
  Upload,
  User,
  UserRound,
  Users,
  Utensils,
  Video,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react'

/* ============================================================
   **მოდულის, სტატუსის, ტიპისა და კატეგორიის ხატულა სახელით (Tasks §1).**

   ორდონიანი რუკაა და ორივე დონე საჭიროა:

   1. **`GROUPS` — ხელით შედგენილი ~90 ხატულა**, რომელიც *სინქრონულად*
      იხატება. ყველაფერი, რასაც კოდი წერს (`ModulesSeeder`,
      `StatusDomain::defaults()`, ლექსიკონების `DEFAULTS`,
      `PSEUDO_SECTIONS`), **სავალდებულოდ აქ დევს** — საიდბარის რიგს
      ჩანქის ჩამოტვირთვა არ უნდა სჭირდებოდეს.
   2. **უცნობი სახელი ზარმაცად იხსნება** lucide-ის `dynamicIconImports`-ით
      (≈2000 ხატულა, თითო თავისი პატარა ჩანქით), სანამ იტვირთება — და თუ
      სახელი საერთოდ არ არსებობს — `LayoutGrid`.

   ⚠️ **აქამდე მეორე დონე არ იყო და ეს ცოცხალი ხარვეზი გახლდათ.** რუკაში
   21 სახელი იდო, ყველა დანარჩენი კი ჩუმად `LayoutGrid`-ად იხატებოდა —
   ე.ი. `note` მოდულს, ვიდეოს „ჩამოწერილებს", „რჩეულს" და მედია-დომენების
   ოთხი სტატუსიდან სამს (`undecided` · `watching` · `watched`) **ერთი და
   იგივე ნაცრისფერი ბადე** ჰქონდათ. შეცდომას ვერც `tsc` ხედავდა, ვერც
   lint — სწორედ ამიტომ არსებობს
   `RegistryConsistencyTest::test_every_default_icon_is_drawn_without_a_lazy_fetch`.

   ⚠️ **მთელი lucide სტატიკურად განზრახ არ შემოდის** — ეს ბანდლში ~1.5 MB-ია.
   ზარმაცი გზა ზუსტად ამიტომაა ზარმაცი.
   ============================================================ */

/**
 * ხატულების ჯგუფები — **ერთადერთი წყარო**: აქედან იწყობა როგორც საძიებო
 * რუკა (`ICONS`), ისე ამრჩევის განლაგება. ორი ცალკე სია (რუკა + „ამრჩევში
 * რა რიგით"), ჩვეულებისამებრ, პირველივე დამატებაზე დაშორდებოდა.
 *
 * ⚠️ `key` i18n-ის გასაღებია — `icons.group.<key>`.
 */
const GROUPS = [
  {
    key: 'media',
    icons: { Film, Tv, Video, Clapperboard, Music, Mic, Headphones, ListMusic, Image, Camera, Radio },
  },
  {
    key: 'books',
    icons: { BookOpen, BookOpenCheck, Book, BookMarked, NotebookPen, Newspaper, GraduationCap, ScrollText, FileText, Library },
  },
  {
    key: 'games',
    icons: { Gamepad2, Dices, Puzzle, Trophy, Swords, Joystick },
  },
  {
    key: 'state',
    icons: { HelpCircle, Circle, CircleDot, Eye, EyeOff, Clock, Hourglass, Play, Pause, CheckCircle2, CheckCheck, Check, Archive, Inbox },
  },
  {
    key: 'marks',
    icons: { Star, Heart, Flame, Sparkles, Bookmark, Tag, Tags, Flag, Pin, ThumbsUp, Award, Crown },
  },
  {
    key: 'files',
    icons: { Folder, FolderOpen, FolderHeart, Paperclip, LinkIcon, Download, HardDriveDownload, Upload, Layers, LayoutGrid, List, ListChecks, Boxes },
  },
  {
    key: 'people',
    icons: { User, UserRound, Users, Home, MapPin, Globe, Plane },
  },
  {
    key: 'life',
    icons: { Utensils, Coffee, ShoppingCart, Briefcase, Dumbbell, Wrench, Lightbulb, Wallet, Calendar, Bell, MessageSquare, Settings, Shield },
  },
  {
    key: 'other',
    icons: { Zap, Key, Rocket, Leaf, PawPrint },
  },
] as const satisfies readonly { key: string; icons: Record<string, LucideIcon> }[]

const ICONS: Record<string, LucideIcon> = Object.assign({}, ...GROUPS.map((g) => g.icons))

/** ამრჩევის განლაგება — ჯგუფი და მისი სახელები, `GROUPS`-ის რიგით */
export const ICON_GROUPS: { key: string; names: string[] }[] = GROUPS.map((g) => ({
  key: g.key,
  names: Object.keys(g.icons),
}))

/** სწრაფი (სინქრონული) ხატულების სახელები */
export const ICON_NAMES = Object.keys(ICONS)

export function isKnownIcon(name?: string | null): boolean {
  return !!name && name in ICONS
}

/**
 * შენახული სახელი → **lucide-ის საკუთარი id** (kebab).
 *
 * ⚠️ ორი კონვენცია ერთდროულად ცოცხალია და ეს განზრახაა: ძველი ჩანაწერები
 * (და კოდში ჩაწერილი ნაგულისხმევები) React-ის ექსპორტის სახელს ინახავს
 * (`NotebookPen`), გაფართოებული ამრჩევი კი lucide-ის id-ს (`notebook-pen`).
 * **id-ის ჩაწერა უფრო სწორია** — `CLAUDE.md`-ის გაფრთხილება „React-ის
 * სახელი კლასის id-ს არ ემთხვევა" (`DownloadCloud` → `cloud-download`)
 * სწორედ იმას ნიშნავს, რომ უკუ-გარდაქმნა ყოველთვის ვერ მუშაობს.
 * აქ მხოლოდ **წინა** მიმართულება გვჭირდება და ისიც მხოლოდ იმ სახელებზე,
 * რაც სტატიკურ რუკაში არ არის.
 */
export function iconId(name: string): string {
  /* ჩვენი ერთადერთი მეტსახელი: lucide-ში `Link`-ია, ჩვენთან `LinkIcon`
     (React-ის `Link`-თან შეჯახების გამო) */
  if (name === 'LinkIcon') return 'link'
  if (!/[A-Z]/.test(name)) return name // უკვე lucide-ის id-ია

  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .toLowerCase()
}

/**
 * ≈2000 ხატულის რუკა **ცალკე ჩანქშია** — `lucide-react/dynamic` თავისთავად
 * 2000 `() => import(…)` ფუნქციაა და საწყის ბანდლში მას ადგილი არ აქვს.
 */
const DynamicIcon = lazy(() => import('lucide-react/dynamic').then((m) => ({ default: m.DynamicIcon })))

export function ModuleIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = name ? ICONS[name] : undefined
  if (Icon) return <Icon className={className} />
  if (!name) return <LayoutGrid className={className} />

  const Fallback = () => <LayoutGrid className={className} />

  return (
    <Suspense fallback={<LayoutGrid className={className} />}>
      <DynamicIcon name={iconId(name) as never} className={className} fallback={Fallback} />
    </Suspense>
  )
}

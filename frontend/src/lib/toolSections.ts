import type { LucideIcon } from 'lucide-react'
import {
  ContactRound,
  DatabaseBackup,
  DownloadCloud,
  Import,
  Inbox,
  KeyRound,
  Languages,
  Library,
  ListChecks,
  MessageSquare,
  Puzzle,
  ScrollText,
  ShieldCheck,
  Tags,
  Trash2,
  UserCog,
} from 'lucide-react'
import { modAccent } from '@/lib/modules'

/* ============================================================
   **არა-მოდულური სექციების რეესტრი (Tasks §23).**

   საიდბარის რიგი და გვერდის ჰედერი ერთსა და იმავე სექციას ხატავენ, ე.ი.
   ფერიც და ხატულაც **ერთ ადგილას** უნდა ეწეროს. აქამდე ფერი `Sidebar.tsx`-ის
   პირად `TOOL_ACCENT`-ში იდო და ჰედერს საერთოდ არ ჰქონდა: `PageHeader`
   მხოლოდ `modules.color`-ს კითხულობს, ეს სექციები კი `modules` ცხრილში
   არ არიან — ე.ი. თორმეტივე გვერდის სათაური ერთნაირად ნაცრისფერი იყო.

   ⚠️ **ორი ასლი აქ განსაკუთრებით სწრაფად დაშორდებოდა**: ერთ მხარეს
   ფერის შეცვლა მეორეს არ ეტყობოდა და „საიდბარში ლურჯია, გვერდზე — მწვანე"
   იქნებოდა ზუსტად ის, რასაც ფერი ვერ პატიობს.

   ⚠️ **ფერი `var(--tool-*)`-ია და არა hex** — ორივე თემის მნიშვნელობა
   `index.css`-შია, გვერდიგვერდ დანარჩენ ტოკენებთან. მუქ თემაზე ცალკე
   ნაკრები სწორედ იმიტომ არსებობს, რომ ღია თემის ინდიგო ბნელ ფონზე
   უბრალოდ შავი ლაქაა.

   ⚠️ **ხატულა აქაა და არა გვერდზე** — ჰედერის ფილა და საიდბარის რიგი ერთი
   და იგივე ხატულით უნდა ხატავდნენ ერთსა და იმავე სექციას; ეს ზუსტად ის
   კავშირია, რითიც მომხმარებელი „სად ვდგავარ"-ს პასუხობს.
   ============================================================ */

export type ToolSectionKey =
  | 'dictionaries'
  | 'genres'
  | 'bulk'
  | 'sync'
  | 'translations'
  | 'people'
  | 'chat'
  | 'modules'
  | 'requests'
  | 'users'
  | 'roles'
  | 'audit'
  | 'credentials'
  | 'backups'
  | 'import'
  | 'purge'

type ToolSection = { color: string; icon: LucideIcon }

export const TOOL_SECTIONS: Record<ToolSectionKey, ToolSection> = {
  dictionaries: { color: 'var(--tool-dictionaries)', icon: Library },
  genres: { color: 'var(--tool-genres)', icon: Tags },
  bulk: { color: 'var(--tool-bulk)', icon: ListChecks },
  sync: { color: 'var(--tool-sync)', icon: DownloadCloud },
  translations: { color: 'var(--tool-translations)', icon: Languages },
  people: { color: 'var(--tool-people)', icon: ContactRound },
  chat: { color: 'var(--tool-chat)', icon: MessageSquare },
  modules: { color: 'var(--tool-modules)', icon: Puzzle },
  requests: { color: 'var(--tool-requests)', icon: Inbox },
  users: { color: 'var(--tool-users)', icon: UserCog },
  roles: { color: 'var(--tool-roles)', icon: ShieldCheck },
  audit: { color: 'var(--tool-audit)', icon: ScrollText },
  credentials: { color: 'var(--tool-credentials)', icon: KeyRound },
  backups: { color: 'var(--tool-backups)', icon: DatabaseBackup },
  import: { color: 'var(--tool-import)', icon: Import },
  purge: { color: 'var(--tool-purge)', icon: Trash2 },
}

/**
 * საიდბარის რიგისთვის — იგივე `--mod`/`--mod-soft` წყვილი, რასაც მოდულები
 * იყენებენ. ⚠️ ცალკე მექანიზმი განზრახ **არ** ჩნდება: რიგის კლასები
 * (`hover:border-l-[var(--mod)]`, `[&>svg]:text-[var(--mod)]`) ერთია
 * მოდულზეც და ინსტრუმენტზეც.
 */
export function toolAccent(key: ToolSectionKey) {
  return modAccent(TOOL_SECTIONS[key].color)
}

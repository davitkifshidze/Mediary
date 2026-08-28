import {
  Bookmark,
  Film,
  Gamepad2,
  Image,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  Music,
  Sparkles,
  Tv,
  Video,
} from 'lucide-react'

/**
 * მოდულის აიქონი სახელით (`modules.icon`).
 * ცნობილი აიქონების რუკა — მთელი lucide-ის დინამიური იმპორტი bundle-ს გაზრდიდა.
 */
const ICONS: Record<string, typeof Film> = {
  Film,
  Tv,
  Video,
  Music,
  Image,
  Gamepad2,
  Bookmark,
  LinkIcon,
  ListChecks,
  Sparkles,
  LayoutGrid,
}

export function ModuleIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || LayoutGrid
  return <Icon className={className} />
}

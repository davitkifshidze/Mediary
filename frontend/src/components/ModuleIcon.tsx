import {
  BookOpen,
  Bookmark,
  Clapperboard,
  Dices,
  Dumbbell,
  Film,
  Gamepad2,
  GraduationCap,
  Image,
  LayoutGrid,
  Link as LinkIcon,
  ListChecks,
  Mic,
  Music,
  Newspaper,
  Plane,
  Sparkles,
  Tv,
  Utensils,
  Video,
  Wrench,
} from 'lucide-react'

/**
 * მოდულის (და ვიდეოს ტიპის — Tasks 5.1) აიქონი სახელით.
 * ცნობილი აიქონების რუკა — მთელი lucide-ის დინამიური იმპორტი bundle-ს გაზრდიდა.
 */
const ICONS: Record<string, typeof Film> = {
  Film,
  Tv,
  Video,
  Music,
  Image,
  Gamepad2,
  Dices,
  Bookmark,
  LinkIcon,
  ListChecks,
  Sparkles,
  LayoutGrid,
  BookOpen,
  Clapperboard,
  GraduationCap,
  Newspaper,
  Mic,
  Dumbbell,
  Utensils,
  Plane,
  Wrench,
}

/** ვიდეოს ტიპის ფორმაში შემოთავაზებული აიქონები (5.1) */
export const ICON_NAMES = Object.keys(ICONS)

export function ModuleIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || LayoutGrid
  return <Icon className={className} />
}

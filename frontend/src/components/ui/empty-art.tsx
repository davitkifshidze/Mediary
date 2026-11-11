import { useId, type ReactNode } from 'react'

/* ============================================================
   **ცარიელი მდგომარეობის ილუსტრაციები** — საკუთარი SVG, მოძრაობა CSS-ით.

   ⚠️ **ბიბლიოთეკა, Lottie და GIF აქ არ არის**: თითო ნახატი ~1 KB-ია, ფერს
   თემიდან იღებს (`currentColor` — კონტური, `--empty-accent` — აქცენტი:
   მოდულის ფერი, მის გარეშე — ოქროსფერი) და მუქ თემაშიც სწორია. კლასები
   (`ea-…`) `index.css`-შია; მოძრაობა იქ `prefers-reduced-motion`-ის ქვეშ
   წერია, ამიტომ ნახატი **უძრავ მდგომარეობაშიც დასრულებულია** (მზე ამოსულია,
   ხაზები დაწერილია).

   ⚠️ კონტურის სისქე ეკრანის პიქსელებშია (`vector-effect`, `--ea-w`): ერთი და
   იგივე ნახატი გვერდზეც, ბარათშიც და ერთ სტრიქონშიც იკითხება.
   ============================================================ */

export type EmptyKind = 'list' | 'photo' | 'video' | 'search' | 'link' | 'file' | 'bell'

const FRAME = { viewBox: '0 0 120 88', fill: 'none', 'aria-hidden': true } as const

/** ფოტო — ცარიელი ჩარჩო, რომელშიც მთების უკნიდან მზე ამოდის */
function Photo() {
  const clip = useId()
  return (
    <svg {...FRAME}>
      <defs>
        <clipPath id={clip}>
          <rect x="26" y="16" width="68" height="52" rx="4" />
        </clipPath>
      </defs>
      <rect className="ea-s ea-paper" x="24" y="14" width="72" height="56" rx="6" />
      <g clipPath={`url(#${clip})`}>
        <circle className="ea-a ea-sun" cx="74" cy="34" r="8" />
        <path className="ea-s ea-soft" d="M22 72 46 44l14 14 12-10 26 24Z" />
      </g>
    </svg>
  )
}

/** ვიდეო — ეკრანი მოციმციმე დაკვრის ღილაკით */
function Video() {
  return (
    <svg {...FRAME}>
      <rect className="ea-s ea-paper" x="20" y="12" width="80" height="52" rx="6" />
      <circle className="ea-as ea-ring" cx="60" cy="38" r="13" />
      <g className="ea-pulse">
        <circle className="ea-a" cx="60" cy="38" r="13" />
        <path className="ea-paper" d="m56 31.5 11 6.5-11 6.5Z" />
      </g>
      <path className="ea-s ea-faint" d="M28 76h64" />
      <circle className="ea-a ea-scrub" cx="28" cy="76" r="3.5" />
    </svg>
  )
}

/** სია — ცარიელი თარო: ერთი წიგნი ირწევა, მტვერი ტივტივებს */
function List() {
  return (
    <svg {...FRAME}>
      <path className="ea-s" d="M20 42h80M20 74h80M28 42v6M92 42v6M28 74v6M92 74v6" />
      <g className="ea-rock">
        <rect className="ea-s ea-soft" x="32" y="19" width="9" height="23" rx="1.5" />
      </g>
      <rect className="ea-a" x="44" y="25" width="7" height="17" rx="1.5" />
      <circle className="ea-a ea-mote" cx="70" cy="66" r="1.8" />
      <circle className="ea-dot ea-mote ea-d1" cx="80" cy="62" r="1.4" />
      <circle className="ea-dot ea-mote ea-d2" cx="62" cy="64" r="1.2" />
    </svg>
  )
}

/** ძებნა / ფილტრი — ლუპა ცარიელ სტრიქონებზე დადის */
function Search() {
  return (
    <svg {...FRAME}>
      <path className="ea-row" d="M24 26h56M24 44h40M24 62h50" />
      <g className="ea-seek">
        <circle className="ea-s ea-paper" cx="56" cy="40" r="13" />
        <circle className="ea-a ea-glint" cx="56" cy="40" r="5" />
        <path className="ea-s ea-handle" d="m66 50 11 11" />
      </g>
    </svg>
  )
}

/** ბმული — ჯაჭვის ორი რგოლი, რომელიც ერთმანეთს ეძებს */
function LinkArt() {
  return (
    <svg {...FRAME}>
      <g transform="rotate(-35 60 44)">
        <g className="ea-pull-l">
          <rect className="ea-s" x="24" y="34" width="38" height="20" rx="10" />
        </g>
        <g className="ea-pull-r">
          <rect className="ea-as" x="58" y="34" width="38" height="20" rx="10" />
        </g>
      </g>
    </svg>
  )
}

/** ფაილი — ფურცელი, რომელზეც სტრიქონები იწერება */
function FileArt() {
  return (
    <svg {...FRAME}>
      <g className="ea-float">
        <path className="ea-s ea-paper" d="M42 10h24l16 16v48a4 4 0 0 1-4 4H42a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z" />
        <path className="ea-s" d="M66 10v16h16" />
        <path className="ea-as ea-write" d="M46 42h28" />
        <path className="ea-s ea-faint ea-write ea-d1" d="M46 53h28" />
        <path className="ea-s ea-faint ea-write ea-d2" d="M46 64h18" />
      </g>
    </svg>
  )
}

/** შეტყობინება — ზარი, რომელიც დროდადრო ირხევა */
function Bell() {
  return (
    <svg {...FRAME}>
      <g className="ea-swing">
        <path className="ea-s" d="M56 12h8" />
        <path className="ea-s ea-paper" d="M60 14c-12 0-19 9-19 21v11l-7 10h52l-7-10V35c0-12-7-21-19-21Z" />
        <circle className="ea-a" cx="60" cy="65" r="5.5" />
      </g>
      <path className="ea-as ea-wave" d="M27 28q-7 11 0 22M93 28q7 11 0 22" />
    </svg>
  )
}

const ART: Record<EmptyKind, () => ReactNode> = {
  list: List,
  photo: Photo,
  video: Video,
  search: Search,
  link: LinkArt,
  file: FileArt,
  bell: Bell,
}

export function EmptyArt({ kind }: { kind: EmptyKind }) {
  const Art = ART[kind]
  return <Art />
}

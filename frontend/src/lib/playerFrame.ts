import { safeGet, safeSet } from '@/lib/storage'

/* ============================================================
   **დამკვრელის ჩარჩოები — სუფთა გამოთვლები**.

   შენი სიტყვები: „ვიდეოს გატანა შეიძლებოდეს ისე, რომ პატარა ჩარჩო, რომელსაც
   ამოძრავებ, მთელ გვერდზე წაიღებ, სადაც გინდა; დეფაულტი — გვერდით, შუაში" ·
   სიმღერებზე: „ჩავკეცო პატარაზე, ჩატის დონეზე, როგორც მესენჯერს ჰქონდა —
   ამოძრავებდი, სადაც გინდა, და მერე გაშლიდი".

   აქ მხოლოდ რიცხვებია (ადგილი, ზომა, ეკრანის კიდე, შენახვა) — ხატავს
   `components/Player.tsx`. ⚠️ ადგილი **მოწყობილობისაა** (`localStorage`,
   `player.dock`-ის წესი): ლეპტოპზე და დიდ ეკრანზე სხვადასხვა ადგილი ბუნებრივია.
   ⚠️ მექანიზმი რუკისთვისაც გამოდგება (ჯერ გადადებულია): ჩარჩო არაფერს
   იცის იმაზე, რა ზის შიგნით.
   ============================================================ */

export interface Viewport {
  w: number
  h: number
}

/** მოტივტივე ჩარჩო: მარცხენა-ზედა კუთხე და სიგანე (სიმაღლე სიგანიდან — 16:9 + ზოლი) */
export interface FrameBox {
  x: number
  y: number
  w: number
}

/** ჩარჩოს ქვედა ზოლის სიმაღლე (px) — დაკვრა/პაუზა, წინა/შემდეგი, დაბრუნება, დახურვა */
const FRAME_BAR = 40
const FRAME_MIN_W = 240
const FRAME_MAX_W = 720
const FRAME_DEFAULT_W = 360
/** ეკრანის კიდიდან დაშორება — ჩარჩო და ბუშტი კიდეს არ სცდება */
export const EDGE = 12

export function viewport(): Viewport {
  return { w: window.innerWidth, h: window.innerHeight }
}

export function frameHeight(w: number): number {
  return Math.round((w * 9) / 16) + FRAME_BAR
}

/** ეკრანში ჩატევა: სიგანე ზღვრებში, ჩარჩო კიდიდან არ გადის */
export function clampFrame(box: FrameBox, vp: Viewport): FrameBox {
  const maxW = Math.max(FRAME_MIN_W, Math.min(FRAME_MAX_W, vp.w - EDGE * 2))
  const w = Math.round(Math.min(Math.max(box.w, FRAME_MIN_W), maxW))
  const h = frameHeight(w)
  return {
    x: Math.round(Math.min(Math.max(box.x, EDGE), Math.max(EDGE, vp.w - w - EDGE))),
    y: Math.round(Math.min(Math.max(box.y, EDGE), Math.max(EDGE, vp.h - h - EDGE))),
    w,
  }
}

/** ნაგულისხმევი — მარჯვნივ, ვერტიკალურად შუაში */
export function defaultFrame(vp: Viewport): FrameBox {
  const w = FRAME_DEFAULT_W
  return clampFrame({ x: vp.w - w - EDGE * 2, y: (vp.h - frameHeight(w)) / 2, w }, vp)
}

/**
 * ზომის სახელური ეკრანის **ცენტრისკენ** მყოფ კუთხეშია: მარჯვნივ მიკრულ
 * ჩარჩოს — მარცხნივ, თორემ კიდესთან მდგარი ჩარჩო ვეღარ გაიზრდებოდა.
 */
export function handleOnLeft(box: FrameBox, vp: Viewport): boolean {
  return box.x + box.w / 2 > vp.w / 2
}

/** კუთხით ზომის შეცვლა — მოპირდაპირე კიდე ადგილზე რჩება */
export function resizeFrame(start: FrameBox, dx: number, fromLeft: boolean, vp: Viewport): FrameBox {
  const maxW = Math.max(FRAME_MIN_W, Math.min(FRAME_MAX_W, vp.w - EDGE * 2))
  const w = Math.min(Math.max(start.w + (fromLeft ? -dx : dx), FRAME_MIN_W), maxW)
  return clampFrame({ x: fromLeft ? start.x + start.w - w : start.x, y: start.y, w }, vp)
}

const FRAME_KEY = 'player.frame'

/** შენახული ადგილი (ეკრანში ჩატეული) ან ნაგულისხმევი — დაზიანებული ჩანაწერი ნაგულისხმევზე ბრუნდება */
export function readFrame(vp: Viewport): FrameBox {
  const raw = parse(safeGet(FRAME_KEY))
  if (raw && [raw.x, raw.y, raw.w].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return clampFrame({ x: raw.x as number, y: raw.y as number, w: raw.w as number }, vp)
  }
  return defaultFrame(vp)
}

export function saveFrame(box: FrameBox): void {
  safeSet(FRAME_KEY, JSON.stringify(box))
}

/* ---------- სიმღერის ბუშტი ---------- */

export interface BubbleSpot {
  side: 'left' | 'right'
  y: number
}

/** ბუშტის დიამეტრი (px) */
export const BUBBLE = 56

/**
 * მარჯვენა ქვედა კუთხე კამათელს ეკუთვნის (`FloatingPick`) — მარჯვნივ
 * მიკრული ბუშტი მას ზემოთ რჩება, ჩარჩო კი კამათელს ზემოთ სწევს (`pickLift`).
 */
const PICK_ZONE = 96

/** ჰედერის ქვეშ (h-14) და ეკრანის ბოლომდე */
export function clampBubble(spot: BubbleSpot, vp: Viewport): BubbleSpot {
  const top = 56 + EDGE
  const bottom = vp.h - BUBBLE - EDGE - (spot.side === 'right' ? PICK_ZONE : 0)
  return { side: spot.side, y: Math.round(Math.min(Math.max(spot.y, top), Math.max(top, bottom))) }
}

/** გაშვებისას უახლოეს კიდეს ეკვრის (მესენჯერის ჩატ-ბუშტივით) */
export function snapBubble(x: number, y: number, vp: Viewport): BubbleSpot {
  return clampBubble({ side: x + BUBBLE / 2 < vp.w / 2 ? 'left' : 'right', y }, vp)
}

const BUBBLE_KEY = 'player.bubble'

export function readBubble(vp: Viewport): BubbleSpot {
  const raw = parse(safeGet(BUBBLE_KEY))
  if (raw && (raw.side === 'left' || raw.side === 'right') && typeof raw.y === 'number' && Number.isFinite(raw.y)) {
    return clampBubble({ side: raw.side, y: raw.y }, vp)
  }
  return clampBubble({ side: 'right', y: Math.round(vp.h * 0.55) }, vp)
}

export function saveBubble(spot: BubbleSpot): void {
  safeSet(BUBBLE_KEY, JSON.stringify(spot))
}

/* ---------- ფანჯარაში (inline) ---------- */

interface Rect {
  top: number
  left: number
  right: number
  bottom: number
}

/**
 * ფანჯრის ესკიზის **ხილული** ნაწილი (`clip-path: inset(...)`) — ფანჯარა
 * გადაიხვევა და ესკიზი მისი ზოლის ქვეშ შედის; ჩარჩო ფანჯრის კიდეს არ სცდება.
 * `null` — მთლიანად ჩანს.
 */
export function clipInset(rect: Rect, clip: Rect): string | null {
  const top = Math.max(0, clip.top - rect.top)
  const right = Math.max(0, rect.right - clip.right)
  const bottom = Math.max(0, rect.bottom - clip.bottom)
  const left = Math.max(0, clip.left - rect.left)
  return top || right || bottom || left ? `inset(${top}px ${right}px ${bottom}px ${left}px)` : null
}

/**
 * მოტივტივე ჩარჩო მარჯვენა ქვედა კუთხეს თუ ფარავს, კამათელი მის ზემოთ
 * ადის (`--player-lift`, px); სხვაგან — 0.
 */
export function pickLift(box: FrameBox, vp: Viewport): number {
  const overlaps = box.x + box.w > vp.w - PICK_ZONE && box.y + frameHeight(box.w) > vp.h - PICK_ZONE
  return overlaps ? Math.max(0, Math.round(vp.h - box.y + 8 - 24)) : 0
}

/**
 * მოდალის „გარე დაჭერა" დამკვრელზე — მოდალი არ იხურება (`ModalShell`).
 * ⚠️ დამკვრელი მოდალის თავზე ჩანს (ფანჯარაში ვიდეო, მოტივტივე ჩარჩო), Radix კი
 * მის გარეთ ყოველ დაჭერას „დახურვად" კითხულობდა.
 */
export function isPlayerTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[data-player]')
}

function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

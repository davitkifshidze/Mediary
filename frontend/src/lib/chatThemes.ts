import type { CSSProperties } from 'react'

/* ============================================================
   **ჩატის თემები (Tasks §10.6).**

   შენი სიტყვები: „ჩატის სხვადასხვა თემები".

   ⚠️ **ბაზაში გასაღები ზის და არა hex** (`conversations.theme`): პალიტრა
   აქ არის, ე.ი. მისი შეცვლა მიგრაციას არ ითხოვს. ეს `modules.color`-ის
   საპირისპირო შემთხვევაა — იქ ფერი მართლა მონაცემია (ადმინი ირჩევს),
   აქ კი გაფორმების ვარიანტია.

   ⚠️ **მუქი ვარიანტი სავალდებულოა და არა სასურველი.** ერთი ღია პალიტრა
   მუქ თემაზე მელნის ლაქაა.

   ⚠️ **არჩევანს CSS აკეთებს და არა JS.** ორივე ნაკრები ერთდროულად
   გადადის ცვლადებად, ხოლო `.dark`-ის სამი ხაზი `index.css`-ში არჩევს.
   `useTheme()` აქ გამოდგება **შეცდომით**: ის საკუთარ `useState`-ს კიდებს,
   ე.ი. მეორე გამოძახება მეორე მდგომარეობაა და გადართვაზე არ განახლდებოდა.

   ⚠️ **ფერი inline CSS-ცვლადებით მიდის** (`modAccent()`/`toolAccent()`-ის
   ზუსტი მექანიზმი): Tailwind სტრიქონიდან კლასს **ვერ** ააგებს, ე.ი.
   `` `bg-[${hex}]` `` არაფერს გამოიმუშავებდა.
   ============================================================ */

export const CHAT_THEMES = ['default', 'ocean', 'forest', 'sunset', 'rose', 'graphite'] as const
export type ChatTheme = (typeof CHAT_THEMES)[number]

interface ThemeColors {
  /** ჩემი ბუშტის ფონი */
  mine: string
  /** ჩემი ბუშტის ტექსტი */
  mineInk: string
  /** ძაფის ფონი */
  surface: string
}

/** ⚠️ ორი ნაკრები თითოზე — მუქზე ღია პალიტრა იკითხება ვერ */
const PALETTE: Record<ChatTheme, { light: ThemeColors; dark: ThemeColors }> = {
  default: {
    light: { mine: 'var(--primary)', mineInk: 'var(--primary-foreground)', surface: 'transparent' },
    dark: { mine: 'var(--primary)', mineInk: 'var(--primary-foreground)', surface: 'transparent' },
  },
  ocean: {
    light: { mine: '#2563eb', mineInk: '#ffffff', surface: '#eff6ff' },
    dark: { mine: '#3b82f6', mineInk: '#0b1220', surface: '#0d1526' },
  },
  forest: {
    light: { mine: '#15803d', mineInk: '#ffffff', surface: '#f0fdf4' },
    dark: { mine: '#22c55e', mineInk: '#04140a', surface: '#0c1711' },
  },
  sunset: {
    light: { mine: '#ea580c', mineInk: '#ffffff', surface: '#fff7ed' },
    dark: { mine: '#fb923c', mineInk: '#1a0d04', surface: '#1b1109' },
  },
  rose: {
    light: { mine: '#db2777', mineInk: '#ffffff', surface: '#fdf2f8' },
    dark: { mine: '#f472b6', mineInk: '#1a0710', surface: '#1c0f16' },
  },
  graphite: {
    light: { mine: '#334155', mineInk: '#ffffff', surface: '#f1f5f9' },
    dark: { mine: '#94a3b8', mineInk: '#0b1220', surface: '#111722' },
  },
}

/**
 * თემის ცვლადები ძაფის კონტეინერზე.
 *
 * ⚠️ **`null`/უცნობი გასაღები `default`-ია** და არა ცარიელი ობიექტი:
 * ძველი ან ხელით ჩაწერილი მნიშვნელობა ძაფს უფერულად არ უნდა დატოვებდეს.
 */
export function chatThemeStyle(theme: string | null | undefined): CSSProperties {
  const key = (theme && (CHAT_THEMES as readonly string[]).includes(theme) ? theme : 'default') as ChatTheme
  const light = PALETTE[key].light
  const dark = PALETTE[key].dark

  /* ⚠️ ორივე ნაკრები ერთდროულად მიდის; „რომელია ახლა“ საკითხს
     `index.css`-ის `.fb-chat` / `.dark .fb-chat` წყვეტს. */
  return {
    '--chat-mine-light': light.mine,
    '--chat-mine-ink-light': light.mineInk,
    '--chat-surface-light': light.surface,
    '--chat-mine-dark': dark.mine,
    '--chat-mine-ink-dark': dark.mineInk,
    '--chat-surface-dark': dark.surface,
  } as CSSProperties
}

/**
 * ბარათის ნიმუში ამრჩევში.
 *
 * ⚠️ იგივე წესი: ორივე ფერი ცვლადად მიდის, არჩევანს კი
 * `.fb-chat-swatch` და `.dark .fb-chat-swatch` აკეთებს — JS-ს აქ
 * თემის ცოდნა არ სჭირდება.
 */
export function chatThemeSwatch(theme: ChatTheme): CSSProperties {
  return {
    '--sw-light': PALETTE[theme].light.mine,
    '--sw-dark': PALETTE[theme].dark.mine,
  } as CSSProperties
}

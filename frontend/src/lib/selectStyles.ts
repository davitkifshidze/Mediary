import type { StylesConfig } from 'react-select'
import { LAYER_POPUP_Z } from '@/lib/layers'

export interface Option {
  value: string
  label: string
}

/**
 * react-select-ის მენიუ **portal-ით `<body>`-ში** (Tasks §1.1).
 *
 * ⚠️ ორი ბაგი ერთდროულად: `ModalShell`-ის შიგნით მენიუს
 * `overflow-y-auto` **კვეთდა** (ველი მოდალის ბოლოშია → სია არ ჩანდა), და
 * z-index-ითაც მოდალის ქვევით ხატულობდა. portal ორივეს ხსნის.
 *
 * ⚠️ **სამივე გამომყენებელმა ერთნაირად უნდა გაშალოს** (`GenreSelect`,
 * `TagSelect`, `MovieMultiSelect`) — თორემ ერთი მაინც სხვანაირად მოიქცევა.
 */
export const reactSelectPortal = {
  menuPortalTarget: typeof document === 'undefined' ? undefined : document.body,
  menuPosition: 'fixed',
} as const

/** react-select (Select2-ის მსგავსი) — თემაზე მორგებული CSS ცვლადებით.
 *  single/multi ორივესთვის: `IsMulti` პარამეტრით. */
export function reactSelectStyles<IsMulti extends boolean>(): StylesConfig<Option, IsMulti> {
  return {
    // react-select-ის შიდა ელემენტები default-ად `cursor: default`-ს იყენებს —
    // ყველა დასაჭერს ცალკე ვუწესებთ pointer-ს
    control: (base, state) => ({
      ...base,
      minHeight: 40,
      backgroundColor: 'var(--card)',
      borderColor: state.isFocused ? 'var(--ring)' : 'var(--border)',
      borderRadius: 5,
      boxShadow: state.isFocused ? '0 0 0 2px var(--ring)' : 'none',
      cursor: 'pointer',
      ':hover': { borderColor: 'var(--ring)' },
    }),
    dropdownIndicator: (base) => ({ ...base, cursor: 'pointer' }),
    clearIndicator: (base) => ({ ...base, cursor: 'pointer' }),
    valueContainer: (base) => ({ ...base, padding: '2px 8px', gap: 4 }),
    // Tasks 2.3 — გრძელი placeholder ვიწრო ველში იჭრებოდა; ახლა ერთ ხაზზე
    // ილექება და ჭარბი „…"-ით იკვეცება, ველი აღარ იზრდება
    placeholder: (base) => ({
      ...base,
      color: 'var(--muted-foreground)',
      fontSize: 13,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: '100%',
    }),
    input: (base) => ({ ...base, color: 'var(--foreground)' }),
    singleValue: (base) => ({ ...base, color: 'var(--foreground)' }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'var(--secondary)',
      borderRadius: 5,
      padding: '1px 2px',
    }),
    multiValueLabel: (base) => ({ ...base, color: 'var(--secondary-foreground)', fontSize: 12, fontWeight: 500 }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--muted-foreground)',
      borderRadius: 5,
      cursor: 'pointer',
      ':hover': { backgroundColor: 'var(--destructive)', color: '#fff' },
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: 5,
      overflow: 'hidden',
      zIndex: LAYER_POPUP_Z,
    }),
    /* portal-ის კონტეინერს **თავისი** z-index სჭირდება — `menu`-ს z-index
       portal-ის შიგნით სხვა stacking context-შია და მოდალს ვერ გადააჭარბებს.

       ⚠️ **`pointerEvents: 'auto'` აუცილებელია და არა კოსმეტიკა.** Radix-ის
       მოდალი გახსნისას `<body>`-ს `pointer-events: none`-ს აყენებს (მხოლოდ
       `DialogContent` რჩება „დაჭერადი"), მენიუ კი portal-ით სწორედ `<body>`-ში
       ჯდება და ამ თვისებას **მემკვიდრეობით** იღებს. შედეგი: სია იშლება,
       კლავიატურა მუშაობს, მაუსით კი **ვერაფერს აირჩევ** — ზუსტად ეს იყო
       „კონკრეტულ ჩანაწერებზე ჩამოშლი და ვერაფერს ირჩევ". */
    menuPortal: (base) => ({ ...base, zIndex: LAYER_POPUP_Z, pointerEvents: 'auto' }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? 'var(--muted)' : 'transparent',
      color: 'var(--foreground)',
      fontSize: 14,
      cursor: 'pointer',
      ':active': { backgroundColor: 'var(--muted)' },
    }),
  }
}

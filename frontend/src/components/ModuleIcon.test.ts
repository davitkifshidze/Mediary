import { describe, expect, it } from 'vitest'
import { ICON_GROUPS, ICON_NAMES, iconId } from './ModuleIcon'

/* ============================================================
   `iconId()` — შენახული სახელი → lucide-ის საკუთარი id (Tasks §1).

   ⚠️ ეს გარდაქმნა **ჩუმად** ცდება: არასწორი id უბრალოდ ვერ მოიძებნება
   და ხატულა `LayoutGrid`-ზე დაბრუნდება — ზუსტად ის სიმპტომი, რომლის
   გამოც მთელი §1 გაჩნდა. `tsc` აქ ვერაფერს ხედავს (ორივე მხარე `string`-ია).
   ============================================================ */

describe('iconId', () => {
  it('splits PascalCase and detaches a trailing digit', () => {
    expect(iconId('NotebookPen')).toBe('notebook-pen')
    expect(iconId('HardDriveDownload')).toBe('hard-drive-download')
    /* ⚠️ ციფრი ცალკე სეგმენტია: lucide-ში `check-circle-2`-ია და არა
       `check-circle2` — ერთი ტირე რომ დაგვავიწყდეს, ხატულა გაქრება */
    expect(iconId('CheckCircle2')).toBe('check-circle-2')
    expect(iconId('Gamepad2')).toBe('gamepad-2')
  })

  it('leaves a lucide id untouched', () => {
    /* გაფართოებული ამრჩევი პირდაპირ lucide-ის id-ს ინახავს, ე.ი. მეორედ
       გარდაქმნა მას არ უნდა შეეხოს */
    expect(iconId('notebook-pen')).toBe('notebook-pen')
    expect(iconId('eye')).toBe('eye')
  })

  it('maps our one alias back to lucide', () => {
    /* `Link` React-ის როუტერის სახელს ეჯახება, ამიტომ ჩვენთან `LinkIcon`-ია */
    expect(iconId('LinkIcon')).toBe('link')
  })
})

describe('ICON_GROUPS', () => {
  it('covers every static icon exactly once', () => {
    const grouped = ICON_GROUPS.flatMap((g) => g.names)

    expect([...grouped].sort()).toEqual([...ICON_NAMES].sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })
})

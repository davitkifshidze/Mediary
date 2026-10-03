import { beforeEach, describe, expect, it } from 'vitest'
import { PANEL_MIN_WIDTH, PANEL_WIDTH, clampPanelWidth, panelCeiling, panelWidthValue, readSavedWidth } from '@/lib/player'

/* ============================================================
   **დამკვრელის პანელის სიგანე — ზღვრები** (Tasks §20.2/§20.3).

   ⚠️ მოწმდება წმინდა არითმეტიკა: ჭერი პარამეტრებიდან (უცნობი → 560, სიიდან
   გარეთ → უახლოესი ზღვარი), სიგანე მინიმუმსა და ჭერს შორის იჭრება, შენახული
   სიგანე მხოლოდ მაშინ ითვლება, თუ რიცხვია და მინიმუმზე ნაკლები არაა,
   ხელით დაუყენებელზე კი ნაგულისხმევი `clamp()` რჩება.
   ============================================================ */

beforeEach(() => localStorage.clear())

describe('პანელის სიგანის ზღვრები', () => {
  it('ჭერი პარამეტრებიდან მოდის და სიიდან გარეთ უახლოეს ზღვარზე დგება', () => {
    expect(panelCeiling(640)).toBe(640)
    expect(panelCeiling(undefined)).toBe(560)
    expect(panelCeiling(Number.NaN)).toBe(560)
    expect(panelCeiling(100)).toBe(480)
    expect(panelCeiling(5000)).toBe(800)
  })

  it('სიგანე მინიმუმსა და ჭერს შორის იჭრება', () => {
    expect(clampPanelWidth(500, 560)).toBe(500)
    expect(clampPanelWidth(900, 560)).toBe(560)
    expect(clampPanelWidth(100, 560)).toBe(PANEL_MIN_WIDTH)
    expect(clampPanelWidth(512.6, 800)).toBe(513)
  })

  it('შენახული სიგანე მხოლოდ რიცხვია მინიმუმიდან; ნაგულისხმევზე clamp() რჩება', () => {
    expect(readSavedWidth()).toBeNull()
    localStorage.setItem('player.width', 'wide')
    expect(readSavedWidth()).toBeNull()
    localStorage.setItem('player.width', '200')
    expect(readSavedWidth()).toBeNull()
    localStorage.setItem('player.width', '620')
    expect(readSavedWidth()).toBe(620)

    expect(panelWidthValue(null, 560)).toBe(PANEL_WIDTH)
    expect(panelWidthValue(620, 560)).toBe('560px')
    expect(panelWidthValue(620, 800)).toBe('620px')
  })
})

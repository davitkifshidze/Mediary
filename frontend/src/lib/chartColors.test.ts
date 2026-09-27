import { describe, expect, it } from 'vitest'
import css from '@/index.css?raw'
import { CHART_SURFACE, MIN_CONTRAST, SERIES_SLOTS, contrast, readable, seriesColor, seriesVars } from '@/lib/chartColors'

/* ============================================================
   **გრაფიკის ფერი — ორივე თემაზე წაკითხვადი** (Tasks §28.4).

   ⚠️ `dataviz` სკილი ამ მანქანაზე არ არის, ამიტომ მისი ვალიდატორის
   საქმეს ეს ტესტი აკეთებს: WCAG 1.4.11-ის 3:1 **ყველა** შესაძლო ფერზე
   (16³ ბადე) და ორივე ზედაპირზე — და არა მხოლოდ დღევანდელ თერთმეტ
   მოდულზე, რადგან `modules.color` ადმინს ნებისმიერად შეუძლია შეცვალოს.
   ============================================================ */

const GRID = Array.from({ length: 16 }, (_, i) => (i * 17).toString(16).padStart(2, '0'))
const EVERY_COLOR = GRID.flatMap((r) => GRID.flatMap((g) => GRID.map((b) => `#${r}${g}${b}`)))

/** CSS-ის ერთი ბლოკის შიგთავსი სელექტორით (`:root { … }`) */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)

  return css.slice(start, css.indexOf('}', start))
}

describe('chart colours', () => {
  it('every colour reaches 3:1 on both surfaces', () => {
    for (const surface of [CHART_SURFACE.light, CHART_SURFACE.dark]) {
      for (const color of EVERY_COLOR) {
        expect(contrast(readable(color, surface), surface), `${color} on ${surface}`).toBeGreaterThanOrEqual(MIN_CONTRAST)
      }
    }
  })

  it('a colour that already reads is left alone', () => {
    // მოდულის ფერი თვითონ რჩება, სადაც ყოფნის — ცვლილება მხოლოდ საჭიროებაზე
    expect(readable('#6366f1', CHART_SURFACE.light)).toBe('#6366f1')
    expect(readable('#f59e0b', CHART_SURFACE.dark)).toBe('#f59e0b')

    // ყვითელი თეთრზე ვერ იკითხება → იმავე ტონის გამუქებული
    const amber = readable('#f59e0b', CHART_SURFACE.light)
    expect(amber).not.toBe('#f59e0b')
    expect(contrast(amber, CHART_SURFACE.light)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('the surfaces mirror the card colour in index.css', () => {
    // ⚠️ ფერი `--card`-ზე მოწმდება — ცვლადის შეცვლა ამ ტესტს აწითლებს და არა ჩუმად გრაფიკს
    expect(block(':root')).toContain(`--card: ${CHART_SURFACE.light};`)
    expect(block('.dark')).toContain(`--card: ${CHART_SURFACE.dark};`)
  })

  it('every series slot is picked by the theme in CSS', () => {
    const light = block('.fb-series')
    const dark = block('.dark .fb-series')

    for (let i = 0; i < SERIES_SLOTS; i++) {
      expect(light).toContain(`--series-${i}: var(--series-${i}-light);`)
      expect(dark).toContain(`--series-${i}: var(--series-${i}-dark);`)
    }
  })

  it('emits both variants per series and falls back for a missing colour', () => {
    const vars = seriesVars(['#6366f1', null, 'not-a-colour']) as Record<string, string>

    expect(vars['--series-0-light']).toBe('#6366f1')
    expect(Object.keys(vars)).toHaveLength(6)
    // ფერის გარეშე მოდული მაინც ფერადია და ორივე თემაზე იკითხება
    for (const i of [1, 2]) {
      expect(contrast(vars[`--series-${i}-light`], CHART_SURFACE.light)).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast(vars[`--series-${i}-dark`], CHART_SURFACE.dark)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
    expect(vars['--series-1-light']).not.toBe(vars['--series-2-light'])

    expect(seriesColor(3)).toBe('var(--series-3)')
  })

  it('never writes more slots than CSS has', () => {
    const vars = seriesVars(Array.from({ length: SERIES_SLOTS + 5 }, () => '#6366f1'))

    expect(Object.keys(vars)).toHaveLength(SERIES_SLOTS * 2)
  })
})

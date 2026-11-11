import { describe, expect, it } from 'vitest'
import source from './number-pick.tsx?raw'
import select from './select.tsx?raw'

/* ============================================================
   **რიცხვის ამრჩევის პუნქტები ერთ ღერძზე დგას.**

   ⚠️ სელექტის პუნქტს მარცხნივ 32px აქვს მონიშვნის ნიშნისთვის, მარჯვნივ — 8px:
   ვიწრო, რიცხვებიან სიაში („9 · 18 · … · ყველა · სხვა") ტექსტი მარჯვნივ გაწეული
   ჩანდა და მხოლოდ მონიშნულზე „სწორდებოდა". ამრჩევის პუნქტებს დაშორება ორივე
   მხარეს ერთი აქვთ და ტექსტი ცენტრშია; ნიშანი კიდეზეა და ტექსტის ადგილს არ იკავებს.
   ============================================================ */

describe('NumberPick options', () => {
  it('centres every option, the "other" one included', () => {
    expect(source).toContain("const ITEM = 'justify-center px-8'")
    // რიცხვები, „ყველა“ და „სხვა“ — ყველა ერთი კლასით
    expect(source.match(/<SelectItem\b[^>]*className=\{ITEM\}/g)).toHaveLength(2)
    expect(source.match(/<SelectItem\b/g)).toHaveLength(2)
  })

  it('keeps the check mark out of the text flow', () => {
    // ნიშანი `absolute`-ია — მონიშნული და მოუნიშნავი პუნქტის ტექსტი ერთ ადგილას დგას
    expect(select).toMatch(/<span className="absolute left-2 flex size-4 items-center justify-center">\s*<SelectPrimitive\.ItemIndicator>/)
  })
})

import type { MouseEvent } from 'react'

/* ============================================================
   **ჩანაწერზე დაჭერა ნებისმიერ ადგილას ხსნის** — სიის სტრიქონი, ბარათი,
   ბადის უჯრა, ვიდეოს ბარათი.

   ⚠️ გამონაკლისია ყველაფერი, რასაც თავისი დაჭერა აქვს (ღილაკი, ბმული, ველი,
   მენიუს პუნქტი, დამკვრელი, გადათრევის სახელური) და მონიშნული ტექსტი —
   სათაურის ასლის აღება ფანჯარას არ უნდა ხსნიდეს.
   ⚠️ `contains` — React-ის მოვლენა პორტალიდანაც ამოდის (მენიუ, ჩანაწერიდან
   გახსნილი ფანჯარა), DOM-ში კი ის ჩანაწერის გარეთაა: ასეთი დაჭერა არ ითვლება.
   გადათრევის შემდეგ click-ს dnd-kit თვითონ აჩერებს.
   ============================================================ */

const OWN_CLICK = 'button, a, input, textarea, select, label, [role="menuitem"], [data-player], [data-sortable-handle]'

export function openOnClick(onOpen: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (!event.currentTarget.contains(target) || target.closest(OWN_CLICK)) return
    if (window.getSelection()?.toString()) return
    onOpen()
  }
}

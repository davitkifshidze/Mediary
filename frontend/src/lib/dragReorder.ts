import { useCallback, useState, type DragEvent } from 'react'

/* ============================================================
   სიის გადალაგება drag & drop-ით (Tasks 15).

   ⚠️ **ბიბლიოთეკა განზრახ არ დაემატა.** ბრაუზერის HTML5 Drag and Drop
   ამ ამოცანას სრულად ფარავს (ვერტიკალური სია, ერთი დონე), dnd-kit-ი კი
   ~40 kB-ს დაამატებდა bundle-ს, რომელიც უკვე 1 MB-ია.

   ⚠️ native drag & drop **კლავიატურით არ მუშაობს**, ამიტომ გამომძახებელს
   `moveBy()`-ც ეძლევა — ისრებით/ღილაკებით გადაადგილებისთვის. ორივე ერთსა
   და იმავე `onReorder`-ს იძახებს, ე.ი. მთელი რიგი ერთად იგზავნება და
   `sort_order` თანმიმდევრული რჩება.
   ============================================================ */

/**
 * ⚠️ **id სტრიქონიც შეიძლება იყოს (ეტაპი 8).** სტატუსების სიაში „ყველა" და
 * „რჩეული" ცხრილის რიგი არაა, ე.ი. რიცხვითი id არ აქვთ — მათი id
 * `'all'`/`'favorite'`-ია, სტატუსისა კი მისი `key`.
 */
export type DragId = string | number

export interface DragReorder<T extends DragId = number> {
  /** ელემენტზე დასაკიდებელი პროპები (`<li {...handlers(id)}>`) */
  handlers: (id: T) => {
    draggable: true
    onDragStart: (e: DragEvent) => void
    onDragEnter: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDragEnd: () => void
    onDrop: (e: DragEvent) => void
  }
  /** რომელი ელემენტი ითრევა ახლა (გამჭვირვალობისთვის) */
  draggingId: T | null
  /** რომელზე ჩამოვარდება (ჩასმის ხაზისთვის) */
  overId: T | null
  /** კლავიატურის/ღილაკების ალტერნატივა: −1 = ზემოთ, +1 = ქვემოთ */
  moveBy: (id: T, delta: number) => void
}

export function useDragReorder<T extends DragId>(
  ids: T[],
  onReorder: (ids: T[]) => void,
): DragReorder<T> {
  const [draggingId, setDraggingId] = useState<T | null>(null)
  const [overId, setOverId] = useState<T | null>(null)

  /** `from`-ის ამოღება და `to`-ის პოზიციაზე ჩასმა */
  const apply = useCallback(
    (from: T, to: T) => {
      const next = [...ids]
      const fromIndex = next.indexOf(from)
      const toIndex = next.indexOf(to)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

      next.splice(toIndex, 0, next.splice(fromIndex, 1)[0])
      onReorder(next)
    },
    [ids, onReorder],
  )

  const handlers = useCallback(
    (id: T) => ({
      draggable: true as const,
      onDragStart: (e: DragEvent) => {
        setDraggingId(id)
        // Firefox-ს გადათრევა არ ეშვება payload-ის გარეშე
        e.dataTransfer.setData('text/plain', String(id))
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragEnter: (e: DragEvent) => {
        e.preventDefault()
        setOverId(id)
      },
      onDragOver: (e: DragEvent) => {
        // preventDefault-ის გარეშე `drop` საერთოდ არ ისვრება
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      },
      onDragEnd: () => {
        setDraggingId(null)
        setOverId(null)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        // ⚠️ `dataTransfer` ყველაფერს სტრიქონად ინახავს — id სიაშივე იძებნება;
        // `Number()` სტრიქონ-id-ს (`'favorite'`) NaN-ად აქცევდა
        const raw = e.dataTransfer.getData('text/plain')
        const from = ids.find((x) => String(x) === raw)
        setDraggingId(null)
        setOverId(null)
        if (from !== undefined) apply(from, id)
      },
    }),
    [apply, ids],
  )

  const moveBy = useCallback(
    (id: T, delta: number) => {
      const index = ids.indexOf(id)
      const target = index + delta
      if (index < 0 || target < 0 || target >= ids.length) return
      apply(id, ids[target])
    },
    [ids, apply],
  )

  return { handlers, draggingId, overId, moveBy }
}

/**
 * გადათრევის ვიზუალი ერთ ადგილას (Tasks §2.4) — გამჭვირვალე ნათრევი და
 * მონიშნული სამიზნე. რვა ლექსიკონის გვერდზე ხელით რომ დაწერილიყო, ერთი
 * მაინც სხვანაირი გამოვიდებოდა.
 *
 * ⚠️ `border`-ის კლასი აქ არის და არა გამომძახებელთან, თორემ Tailwind-ის
 * ბოლო კლასი მოიგებდა და მონიშვნა ხან ჩანდებოდა, ხან არა.
 */
export function dragRowClass<T extends DragId>(drag: DragReorder<T>, id: T): string {
  return [
    'transition-colors',
    // ⚠️ **„ხელის" კურსორი მთელ ზოლზეა და არა მხოლოდ სახელურზე** (Tasks §1.3):
    // `draggable` ისედაც `<li>`-ზე ჯდება, ე.ი. მთელი რიგი აიღება — კურსორი კი
    // მხოლოდ სახელურზე ეწერა და ინტერფეისი ტყუოდა („აქ ვერ აიღებ"-ს ამბობდა).
    // შიგნითა ღილაკებს თავისი `cursor-pointer` აქვთ და ისინი იგებენ.
    'cursor-grab active:cursor-grabbing',
    drag.draggingId === id ? 'opacity-40' : '',
    drag.overId === id && drag.draggingId !== id ? 'border-primary' : 'border-border',
  ]
    .filter(Boolean)
    .join(' ')
}

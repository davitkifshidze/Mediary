import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react'
import { useToast } from '@/components/ui/feedback'
import type { MenuAction } from '@/components/ui/record-menu'
import { errorMessage } from '@/lib/errors'
import { PAGE_ALL } from '@/lib/pageSize'
import { sortByIds } from '@/lib/reorder'

/* ============================================================
   **ხელით დალაგება სიაში** — ბუკმარკები, ჩანაწერები, სიმღერები.

   „ხელით" დალაგების ერთ-ერთი ვარიანტია (`MANUAL_SORT`). მასზე:
   · სია **ერთ გვერდად** იშლება (`manualPageSize` — ჭერი 500): გვერდებად
     დაჭრილ სიაში ჩანაწერს გვერდებს შორის ვერ გადაათრევ;
   · სტრიქონს, ბარათსა და ფილას სახელური უჩნდება (`sortable` + `sortId`);
   · მენიუში ემატება „თავში" და „ბოლოში".
   სხვა დალაგებაზე სახელური არ ჩანს — ყოველთვის ცხადია, რომელი რიგი მოქმედებს.

   ⚠️ **რიგი ოპტიმისტურია**: ჩაშვებისთანავე ჩანაწერი თავის ადგილასაა, სანამ
   სერვერი ახალ სიას დააბრუნებს. ლოკალური რიგი იმ სიას ეკუთვნის, რომელზეც
   დაიდო (`base`): სერვერის სია შეიცვალა (განახლება, ახალი ჩანაწერი, წაშლა) —
   ლოკალური აღარ მოქმედებს. ეფექტი აქ არ არის — მნიშვნელობა გამოითვლება.

   ⚠️ სერვერი მოწოდებულ ჩანაწერებს **მათსავე უჯრებში** ალაგებს — ფილტრით
   ნაჩვენები ნაწილის გადალაგება დამალულებს ადგილს არ უცვლის.
   ============================================================ */

/** დალაგების ვარიანტის მნიშვნელობა — API-შიც (`?sort=manual`) */
export const MANUAL_SORT = 'manual'

/** ხელით დალაგებისას სია ერთი გვერდია; სხვა დროს — არჩეული ზომა */
export function manualPageSize(sort: string, pageSize: number): number {
  return sort === MANUAL_SORT ? PAGE_ALL : pageSize
}

export function useManualOrder<T extends { id: number }>({
  sort,
  items,
  save,
  onSaved,
}: {
  /** მიმდინარე დალაგება */
  sort: string
  /** სერვერიდან მოსული სია */
  items: T[]
  /** `POST …/reorder` */
  save: (ids: number[]) => Promise<unknown>
  /** წარმატების შემდეგ — სიის ქეშის განახლება */
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const active = sort === MANUAL_SORT

  const base = items.map((item) => item.id).join(',')
  const [local, setLocal] = useState<{ ids: number[]; base: string } | null>(null)

  const mutation = useMutation({
    mutationFn: save,
    onSuccess: onSaved,
    onError: (e) => {
      // ძველ რიგზე დაბრუნება: სერვერზე არაფერი შეცვლილა
      setLocal(null)
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const shown = active && local && local.base === base ? sortByIds(items, local.ids, (item) => item.id) : items
  const ids = shown.map((item) => item.id)

  const reorder = (next: number[]) => {
    setLocal({ ids: next, base })
    mutation.mutate(next)
  }

  return {
    active,
    /** სია მოქმედი რიგით */
    items: shown,
    /** `RecordList`-ის `sortable` — მხოლოდ „ხელით" დალაგებაზე */
    sortable: active ? { ids, onReorder: reorder } : undefined,
    /** `RecordView`-ის `sortId` — სახელური მხოლოდ „ხელით" დალაგებაზე ჩანს */
    sortId: (item: T): number | undefined => (active ? item.id : undefined),
    /** მენიუს პუნქტები: „თავში" · „ბოლოში" */
    actions: (item: T): MenuAction[] => {
      if (!active) return []

      const rest = ids.filter((id) => id !== item.id)
      return [
        {
          key: 'to-top',
          label: t('order.toTop'),
          icon: ArrowUpToLine,
          separator: true,
          disabled: ids[0] === item.id,
          run: () => reorder([item.id, ...rest]),
        },
        {
          key: 'to-bottom',
          label: t('order.toBottom'),
          icon: ArrowDownToLine,
          disabled: ids[ids.length - 1] === item.id,
          run: () => reorder([...rest, item.id]),
        },
      ]
    },
  }
}

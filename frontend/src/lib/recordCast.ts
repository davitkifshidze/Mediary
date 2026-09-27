import type { ComponentType } from 'react'
import type { TFunction } from 'i18next'
import { ArrowLeft, ArrowRight, Eye, EyeOff, SquarePen, Trash2, UserRound } from 'lucide-react'
import type { CastMember } from '@/api/types'

/* ============================================================
   ჩანაწერის მსახიობები — მოქმედებები და რიგი (Tasks §16).

   შენი მოთხოვნა: „უშუალოდ ფილმში მსახიობზე მარჯვენა კლიკით კონტექსტური
   მენიუ ჰქონდეს; drag & drop-ით დალაგებაც შესაძლებელი იყოს; მსახიობის
   დამალვა ან წაშლაც".

   ⚠️ **`⋯` მენიუც და მარჯვენა კლიკიც ამ ერთი სიიდან იხატება**
   (`photoActions()`-ის წესი). ორი ასლი აუცილებლად გაშორდებოდა — ერთში
   „დამალვა" იქნებოდა, მეორეში არა, და მომხმარებელი სწორედ იმ ერთადერთს
   ეძებდა, სადაც პუნქტია.

   ⚠️ **„ერთით წინ/უკან" drag & drop-ის კლავიატურის გზაა** — native DnD
   კლავიატურით მიუწვდომელია (`lib/dragReorder.ts`), ხოლო `⋯` ღილაკი
   Tab-ით აღწევადია. პუნქტი, რომელიც ვერ იმუშავებს (პირველზე „წინ",
   დამალულზე — ორივე), **საერთოდ არ იხატება** და არა გამორთული.
   ============================================================ */

export type CastActionKey = 'open' | 'role' | 'earlier' | 'later' | 'hide' | 'show' | 'delete'

export interface CastAction {
  key: CastActionKey
  label: string
  icon: ComponentType<{ className?: string }>
  run: () => void
  /** წითლად, გამყოფის ქვემოთ */
  danger?: boolean
}

export interface CastActionsInput {
  t: TFunction
  /** მსახიობი „დამალულის" ჯგუფშია — მისი რიგი არ იცვლება */
  hidden: boolean
  onOpen: () => void
  onEditRole: () => void
  /** მითითების გარეშე (სიის დასაწყისი/დამალული) პუნქტი არ იხატება */
  onEarlier?: () => void
  /** მითითების გარეშე (სიის ბოლო/დამალული) პუნქტი არ იხატება */
  onLater?: () => void
  onToggleHidden: () => void
  onDelete: () => void
}

export function castActions({
  t,
  hidden,
  onOpen,
  onEditRole,
  onEarlier,
  onLater,
  onToggleHidden,
  onDelete,
}: CastActionsInput): CastAction[] {
  const list: CastAction[] = [
    { key: 'open', label: t('cast.openActor'), icon: UserRound, run: onOpen },
    { key: 'role', label: t('cast.editRole'), icon: SquarePen, run: onEditRole },
  ]

  if (!hidden && onEarlier) list.push({ key: 'earlier', label: t('cast.moveEarlier'), icon: ArrowLeft, run: onEarlier })
  if (!hidden && onLater) list.push({ key: 'later', label: t('cast.moveLater'), icon: ArrowRight, run: onLater })

  list.push(
    hidden
      ? { key: 'show', label: t('cast.unhide'), icon: Eye, run: onToggleHidden }
      : { key: 'hide', label: t('cast.hide'), icon: EyeOff, run: onToggleHidden },
  )

  /* ⚠️ **წაშლა ბოლოშია და წითელია** — ის ამ ჩანაწერიდან საბოლოოდ აქრობს
     ადამიანს (სინქრონიზაციაც ვეღარ დააბრუნებს), ე.ი. „დამალვასთან"
     შედარებით შეუქცევადია; დასტურს გამომძახებელი ითხოვს. */
  list.push({ key: 'delete', label: t('cast.detach'), icon: Trash2, run: onDelete, danger: true })

  return list
}

/** ხილული და დამალული — სერვერის რიგის (`billing_order`) შენარჩუნებით */
export function splitCast(cast: CastMember[]): { visible: CastMember[]; hidden: CastMember[] } {
  return {
    visible: cast.filter((c) => !c.is_hidden),
    hidden: cast.filter((c) => c.is_hidden),
  }
}

/**
 * რას ელის `PUT /media/cast/{type}/{id}/order`: ხილულების ახალი რიგი, მერე
 * დამალულები **თავიანთ** რიგში.
 *
 * ⚠️ სერვერი **სრულ** სიას ელის — დამალულის გამოტოვება 422-ია
 * (`cast_order_mismatch`), რადგან აკლებული id ჩუმი მოხსნა იქნებოდა.
 * ⚠️ დამალულები ბოლოში იმიტომ დგება, რომ გამოჩენისას ადამიანი ხილულების
 * შემდეგ დაჯდეს და არა მის ძველ ნომერზე — შენი ახალი დალაგების შუაში.
 */
export function castOrderPayload(visibleIds: number[], hidden: CastMember[]): number[] {
  return [...visibleIds, ...hidden.map((c) => c.id)]
}

/**
 * ოპტიმისტური განახლება: სრული მასივი ახალი რიგით, ბარათი რომ ჩაშვებისთანავე
 * თავის ადგილზე დადგეს. ⚠️ სიაში არმყოფი (მეორე ტაბმა ახლახან დაამატა) ბოლოში
 * რჩება და არ ქრება — სერვერის პასუხი მაინც ჩაანაცვლებს.
 */
export function reorderCast(cast: CastMember[], ids: number[]): CastMember[] {
  const byId = new Map(cast.map((c) => [c.id, c]))
  const ordered = ids.map((id) => byId.get(id)).filter((c): c is CastMember => c !== undefined)
  const rest = cast.filter((c) => !ids.includes(c.id))

  return [...ordered, ...rest]
}

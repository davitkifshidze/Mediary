import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import type { Visibility } from '@/api/publicProfile'
import { IconMark, type IconActionSize } from '@/components/ui/icon-action'

/* ============================================================
   ჩანაწერის ხილვადობის **ბეჯი** (Tasks §16.1 → §6.1).

   ⚠️ **გადამრთველი აქედან წაშლილია (2026-09-11, §6.1).** ხილვადობა ახლა
   ერთ ადგილას — პროფილზე — იმართება (`components/VisibilityManager.tsx`),
   რადგან ერთი ფაქტის ორ ადგილას მართვა ნიშნავდა, რომ „სად არის ეს
   პარამეტრი" ყოველ ჯერზე ხელახლა უნდა გამოგეცნო, ხოლო „რა მაქვს საჯარო"
   კითხვას პასუხი საერთოდ არ ჰქონდა.

   ⚠️ **ბეჯი განზრახ რჩება ჩანაწერზე** — ის მხოლოდ *აჩვენებს* მდგომარეობას.
   მისი მოხსნა ნიშნავდა, რომ ჩანაწერს რომ უყურებ, ვერ გაიგებ, საჯაროა თუ არა.

   ⚠️ ფაილს სახელი შენარჩუნებულია, რომ რვა იმპორტი უმიზნოდ არ გადაწერილიყო;
   ერთადერთი ექსპორტი `VisibilityBadge`-ია.
   ============================================================ */

/** მხოლოდ ნიშანი — საჯარო ჩანაწერზე; პირადზე არაფერი იხატება.

    ⚠️ Tasks §6.3 — ტექსტიანი ~20px პილული `Globe` აიქონად იქცა, მოქმედებების
    ზომით (`IconMark`) და თულთიპით. ⚠️ „საჯარო" სიტყვა თულთიპის პირველი
    სიტყვაა, რომ მნიშვნელობა არ დაიკარგოს. */
export function VisibilityBadge({
  value,
  size = 'sm',
}: {
  value: Visibility | null | undefined
  size?: IconActionSize
}) {
  const { t } = useTranslation()

  if (value !== 'public') return null

  return <IconMark icon={Globe} label={t('visibility.publicMark')} size={size} className="text-primary" />
}

import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import type { Visibility } from '@/api/publicProfile'

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

/** მხოლოდ ბეჯი — საჯარო ჩანაწერზე; პირადზე არაფერი იხატება */
export function VisibilityBadge({ value }: { value: Visibility | null | undefined }) {
  const { t } = useTranslation()

  if (value !== 'public') return null

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
      title={t('visibility.publicHint')}
    >
      <Globe className="size-3" />
      {t('visibility.public')}
    </span>
  )
}

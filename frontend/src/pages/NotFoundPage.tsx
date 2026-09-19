import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Compass } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { pageContainer } from '@/components/ui/page'

/* ============================================================
   „ასეთი გვერდი არ არის" (Tasks GAP-21).

   ⚠️ **აქამდე უცნობი მისამართი უხმოდ დეშბორდზე გადადიოდა.** გაზიარებული
   ძველი ბმული (`/gallery/uncategorized`), წაშლილი ჩანაწერის URL ან უბრალოდ
   შეცდომით აკრეფილი მისამართი მთავარ გვერდზე აგდებდა ახსნის გარეშე — ე.ი.
   მომხმარებელი ვერ ხვდებოდა, რომ მისამართი არასწორი იყო და არა აპი გატეხილი.
   `ErrorBoundary`-ს „ჩანქი ვერ ჩაიტვირთა" ჰქონდა, „ასეთი გვერდი არ არის" — არა.

   ⚠️ **`lazy()` განზრახ არაა** (განსხვავებით 37-ვე დანარჩენი გვერდისა):
   ეს ის ეკრანია, რომელიც **გატეხილ მდგომარეობაში** უნდა დაიხატოს, ე.ი.
   მისი ჩვენება ახალი ჩანქის ჩამოტვირთვას არ უნდა ითხოვდეს. ფასი ნულთან
   ახლოსაა — `EmptyState` და `Button` საწყის ჩანქშია ისედაც (`ErrorBoundary`
   მათ იყენებს).

   ⚠️ **ორი ექსპორტი და არა ერთი**: `NotFoundPage` მარშრუტისაა (`path="*"`),
   `NotFound` კი — ჩანაწერის გვერდებისა, სადაც 404 „ასეთი ჩანაწერი არ არის"-ს
   ნიშნავს და ღილაკიც სხვაა (სექციაში დაბრუნება). ერთი ტექსტი ორივეზე
   ტყუილი იქნებოდა.
   ============================================================ */

export function NotFound({
  title,
  hint,
  actions,
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={<Compass className="size-6" />}
      title={title ?? t('notFound.title')}
      hint={hint ?? t('notFound.hint')}
      actions={
        // ⚠️ `<Link>` + `buttonVariants()` — `Button`-ს `asChild` არ აქვს
        actions ?? (
          <Link to="/" className={buttonVariants()}>
            {t('notFound.home')}
          </Link>
        )
      }
    />
  )
}

export function NotFoundPage() {
  return (
    <div className={pageContainer('wide', 'py-10')}>
      <NotFound />
    </div>
  )
}

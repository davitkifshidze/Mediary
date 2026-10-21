import { useTranslation } from 'react-i18next'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

/* ============================================================
   **ჩავარდნილი მოთხოვნა ცარიელი ბიბლიოთეკა არ არის.**

   ⚠️ ექვსი გვერდი `useQuery`-დან მხოლოდ `data`-სა და `isLoading`-ს
   კითხულობდა, `error`-ს კი არა: სერვერის 500 ფილმზე „ასეთი ჩანაწერი არ
   არის"-ად იხატებოდა, მსახიობებზე — „მსახიობები ჯერ არ გყავს", სტატისტიკაზე —
   „ჯერ არაფერია დასათვლელი", გალერეაზე — „ფოტო ჯერ არ არის". ავარია მთელი
   დღე ცარიელ მდგომარეობად ჩანდა და „ნუთუ არაფერი არ უნდა გამოდიოდეს?"
   კითხვას ბადებდა.

   ⚠️ **404 აქ არ მოდის** — ის `NotFound`-ია (`isNotFound()`): ჩანაწერი მართლა
   არ არსებობს და ღილაკიც სხვაა (სექციაში დაბრუნება). აქ მხოლოდ ის შეცდომაა,
   რომლის გამეორებას აზრი აქვს — ამიტომ „თავიდან სცადე" `refetch`-ს ეძახის.

   `EmptyState`-ის იგივე ფორმაა — ერთი ვიზუალი ორივე მდგომარეობას, ოღონდ
   წითელი ჩარჩო და სამკუთხედი, რომ „ცარიელი" და „ჩავარდნილი" ერთმანეთში არ
   აირიოს. ტექსტი `errorMessage()`-ისაა — მანქანური კოდი ითარგმნება, ქსელის
   ვარდნა თავის წინადადებას იღებს.
   ============================================================ */

export function QueryErrorState({
  error,
  onRetry,
  retrying,
  className,
}: {
  error: unknown
  /** `refetch` — ღილაკი მხოლოდ მაშინ იხატება */
  onRetry?: () => void
  /** `isFetching` — გამეორების დროს ღილაკი გათიშულია და აიქონი ბრუნავს */
  retrying?: boolean
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={<TriangleAlert className="size-6 text-destructive" />}
      title={t('errors.loadFailed')}
      hint={errorMessage(error)}
      actions={
        onRetry && (
          <Button variant="outline" onClick={onRetry} disabled={retrying}>
            <RefreshCw className={cn('size-4', retrying && 'animate-spin')} />
            {t('actions.retry')}
          </Button>
        )
      }
      className={cn('border-destructive/40', className)}
    />
  )
}

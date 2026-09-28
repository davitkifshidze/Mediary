import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { credentialShortName } from '@/lib/credentials'
import { cn } from '@/lib/utils'

/* ============================================================
   **„შენი გასაღები არ გაქვს — ჩაწერე „მონაცემებში"" (Tasks §30.6).**

   §30-იდან გასაღები მხოლოდ მომხმარებლისაა, ე.ი. ეს ყოველდღიური
   მდგომარეობაა ყველასთვის, ვისაც ჯერ არ ჩაუწერია. ⚠️ **ერთი კომპონენტი
   ყველგან** — სინქრონი, თარგმანი, ვებიდან ძებნა, გალერეის ჩამოტვირთვა,
   სწრაფი შევსება: ტექსტიც, ფერიც და **ბმულიც** ერთნაირია, თორემ ერთ
   ადგილას „ჩაწერე" ეწერებოდა, მეორეში — „წყარო მიუწვდომელია".

   ⚠️ ქარვისფერია და არა წითელი: არაფერი გატეხილა და არაფერი დაკარგულა —
   ეს დაუმთავრებელი მორგებაა, და მისი ქმედება ერთ დაწკაპებაშია.
   ============================================================ */

export function CredentialMissingNotice({
  provider,
  children,
  className,
}: {
  provider: string
  /** საკუთარი ტექსტი (მაგ. „მხოლოდ TMDB-ის ტექსტი მოვა"); ნაგულისხმევად — ზოგადი */
  children?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400',
        className,
      )}
    >
      <KeyRound className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {children ?? t('errors.credential_missing_for', { provider: credentialShortName(provider) })}
      </span>
      <Link to="/credentials" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        {t('credentials.open')}
      </Link>
    </div>
  )
}

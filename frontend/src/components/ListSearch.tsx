import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Globe, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** ჯვარედინი ძებნა ორ სიმბოლოზე მოკლე სიტყვას არ იღებს — ღილაკიც მანამდე არ ჩანს */
const GLOBAL_MIN = 2

/** იმავე სიტყვით ჯვარედინი ძებნის მისამართი */
function elsewherePath(term: string): string {
  return `/search?q=${encodeURIComponent(term.trim())}`
}

/**
 * **სიის ძებნის ველი** — ეძებს მხოლოდ თავის მოდულში და ასეც აწერია.
 *
 * ⚠️ ველი ფილტრია: ჟანრებთან, გვერდებთან და ხედთან ერთად მუშაობს, ამიტომ მასში
 * სხვა მოდული არ ერევა. „სხვაგანაც" იმავე სიტყვით ჯვარედინ ძებნაზე გადადის —
 * ღილაკი ველის ბოლოშია და მხოლოდ მაშინ ჩანს, როცა სიტყვა საკმარისად გრძელია.
 */
export function ListSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** მოდულის საკუთარი წარწერა — „ძებნა ფილმებში…" */
  placeholder: string
  className?: string
}) {
  const { t } = useTranslation()
  const elsewhere = value.trim().length >= GLOBAL_MIN

  return (
    <div className={cn('relative min-w-0 flex-1 sm:flex-none', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn('w-full pl-9 sm:w-64', elsewhere && 'pr-28')}
      />
      {elsewhere && (
        <Link
          to={elsewherePath(value)}
          title={t('search.elsewhereHint')}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'xs' }),
            'absolute right-1.5 top-1/2 -translate-y-1/2',
          )}
        >
          <Globe className="size-3.5" />
          {t('search.elsewhere')}
        </Link>
      )}
    </div>
  )
}

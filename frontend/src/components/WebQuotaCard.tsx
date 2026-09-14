import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import { webSearchStatus } from '@/api/web'
import { useDateFormat } from '@/lib/dates'

/* ============================================================
   ვებძებნის კვოტა (Tasks §7.6.1 / §7.6.6).

   ⚠️ **SerpApi მოდული არ არის, წყაროა** — ამიტომ არც გვერდი აქვს და არც
   საიდბარის სექცია: ერთადერთი, რაც ინტერფეისში სჭირდება, **კვოტის ჩვენებაა**.

   ⚠️ **ეს ბარათი მხოლოდ ფასიან წყაროს ეხება.** უფასო კატალოგს (Wikimedia)
   კვოტა არ აქვს, ე.ი. აქ არც ჩანს — თორემ „დარჩა 238" ისე წაიკითხებოდა,
   თითქოს ვებძებნა საერთოდ ითვლებოდეს.

   ⚠️ **ორი რიცხვია და ორივე საჭირო:** ჩვენი მრიცხველი (რამდენი გამოძახება
   გავუშვით) და SerpApi-ის ნამდვილი მდგომარეობა. ნამდვილი ჯობია, მაგრამ ჩვენი
   მაშინაც მუშაობს, როცა ანგარიში არ პასუხობს.

   ⚠️ **ამ ბარათის გახსნა კვოტას არ ხარჯავს** — `GET /account` უფასოა.

   ⚠️ **ლიმიტი ანგარიშისაა და არა მომხმარებლის** — სურათი, ვიდეო და წიგნი
   ერთი ბიუჯეტიდან ხარჯავს, ე.ი. აქ ნაჩვენები რიცხვი საერთოა.
   ============================================================ */

export function WebQuotaCard() {
  const { t } = useTranslation()
  const { date } = useDateFormat()

  const { data, isLoading } = useQuery({
    queryKey: ['web', 'status'],
    queryFn: webSearchStatus,
    staleTime: 60_000,
  })

  // გასაღების გარეშე ბლოკი საერთოდ არ ჩანს — იგივე წესი, რაც RAWG-ს აქვს
  if (isLoading || !data?.configured) return null

  const remaining = data.remaining
  const limit = data.account?.searches_per_month ?? data.limit
  const used = data.account?.this_month_usage ?? data.used
  const percent = limit ? Math.min(100, Math.round(((used ?? 0) / limit) * 100)) : 0

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Globe className="size-5 text-muted-foreground" />
        {t('web.quotaTitle')}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t('web.quotaHint')}</p>

      <div className="h-2 overflow-hidden rounded-md bg-muted">
        <div
          className={percent >= 90 ? 'h-full bg-destructive' : 'h-full bg-primary'}
          style={{ width: `${percent}%` }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">{t('web.quotaUsed')}</dt>
          <dd className="font-medium">
            {used ?? 0}
            {limit ? ` / ${limit}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('web.quotaRemaining')}</dt>
          <dd className="font-medium">{remaining ?? '—'}</dd>
        </div>
        <div>
          {/* ⚠️ ჩვენი მრიცხველი ცალკე ჩანს: სხვაობა ნიშნავს, რომ იმავე
              გასაღებს სხვაგანაც იყენებენ (ან ჩვენი აღრიცხვა ჩამორჩა) */}
          <dt className="text-xs text-muted-foreground">{t('web.quotaOurs')}</dt>
          <dd className="font-medium">{data.used}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('web.quotaRenews')}</dt>
          <dd className="font-medium">
            {data.account?.renews_at ? date(data.account.renews_at) : '—'}
          </dd>
        </div>
      </dl>

      {data.account?.plan && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('web.quotaPlan', { plan: data.account.plan })}
        </p>
      )}
    </section>
  )
}

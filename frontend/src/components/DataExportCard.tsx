import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Download, Import, PackageOpen } from 'lucide-react'
import { downloadExport, fetchExportModules, type ExportFormat } from '@/api/export'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   „ჩემი მონაცემები" (FEAT-06) — თითო მოდული ერთ ფაილად.

   ⚠️ **ეს ბლოკი `/profile`-ზეა და არა `/settings`-ზე** — იმავე მიზეზით,
   რითაც საცავის ბარათი იქ დგას (ეტაპი 5): „რა მაქვს და როგორ წავიღო"
   ანგარიშის ფაქტია, პარამეტრი კი „რამდენი შეიძლება".

   ⚠️ **საცავის ბარათის ქვემოთაა და ეს რიგი შინაარსობრივია:** ზემოთ
   ატვირთული **ფაილების** არქივია, აქ — **ჩანაწერების** სია. ორივე
   „ჩემი მონაცემებია" და ერთმანეთს ავსებს (CSV-ის `poster_path` სწორედ
   იმ არქივის ფაილს უთითებს).

   ⚠️ **ფორმატი ერთი გადამრთველია მთელ ბლოკზე და არა თითო მოდულზე.**
   ათი მოდული × ორი ღილაკი ოცი ღილაკია — არჩევანი ერთია („როგორ"),
   ღილაკი კი კითხვას პასუხობს („რომელი").
   ============================================================ */

export function DataExportCard() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()

  const [format, setFormat] = useState<ExportFormat>('csv')
  const [busy, setBusy] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['export', 'modules'],
    queryFn: fetchExportModules,
    staleTime: 60_000,
  })

  const modules = data?.data ?? []

  const run = async (key: string) => {
    setBusy(key)
    try {
      await downloadExport(key, format)
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <PackageOpen className="size-5 text-muted-foreground" />
          {t('exportData.title')}
          <InfoHint info={t('exportData.hint')} />
        </h2>

        {/* ერთი არჩევანი მთელ ბლოკზე — „როგორ", და არა „რომელი" */}
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(data?.formats ?? ['json', 'csv']).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={
                format === f
                  ? 'rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground'
              }
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : modules.length === 0 ? (
        <EmptyState icon={<PackageOpen className="size-6" />} title={t('exportData.empty')} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {modules.map((m) => (
            <li
              key={m.key}
              className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
              style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
                <ModuleIcon name={m.icon} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {i18n.language === 'ka' ? m.name_ka : m.name_en}
                </span>
                {/* ⚠️ რიცხვი იმავე query-დან მოდის, რომლითაც ფაილი აიგება —
                    ე.ი. „342 ჩანაწერი" და ფაილის სიგრძე ვერ დაშორდება */}
                <span className="block text-xs text-muted-foreground">
                  {t('exportData.records', { count: m.count })} · {t('exportData.fields', { count: m.fields })}
                </span>
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => run(m.key)}
              >
                <Download className="size-4" />
                {busy === m.key ? t('common.loading') : format.toUpperCase()}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* ===== საპირისპირო მიმართულება (FEAT-07) =====
          ⚠️ **ეს ბმული აქ იმიტომაა, რომ იმპორტი ვერ მოიძებნა.** გვერდი
          `/import` და გვერდითა მენიუს რიგი თავიდანვე არსებობდა, მაგრამ
          ექსპორტი **`/profile`-ზეა**, ე.ი. „როგორ წავიღო და როგორ
          შემოვიტანო" ერთი კითხვის ორი ნახევარი ორ სხვადასხვა ადგილას იდგა
          — და მეორე ნახევარს თხუთმეტრიგიან ხელსაწყოების სიაში ეძებდი.
          ⚠️ **ბმულია და არა ფორმა**: იმპორტი სამნაბიჯიანია (ფაილი →
          გეგმა → რიგი) და ბარათში ვერ ჩაჯდებოდა; ორი ადგილი კი, სადაც
          ფაილს ირჩევ, ორ სხვადასხვა ქცევად იკითხებოდა. */}
      <Link
        to="/import"
        className="mt-4 flex items-center gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/40"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted [&>svg]:size-5 [&>svg]:text-muted-foreground">
          <Import />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{t('exportData.importLink')}</span>
          <span className="block truncate text-xs text-muted-foreground">{t('exportData.importHint')}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </section>
  )
}

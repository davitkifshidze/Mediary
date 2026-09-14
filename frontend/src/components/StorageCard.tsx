import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import {
  cancelRequest,
  cleanStorageOrphans,
  deleteStorageFile,
  deleteStorageFiles,
  downloadStorageFiles,
  fetchMyRequests,
  fetchStorageFiles,
  fetchStorageOrphans,
  fetchStorageUsage,
  recalculateStorage,
  requestStorageIncrease,
  type StorageScope,
  type UploadedFile,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { grantedQuota, requestedQuota } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { formatBytes } from '@/lib/utils'
import { StorageBar } from '@/components/StorageBar'
import { StorageLibrary, type BulkScope } from '@/components/StorageLibrary'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   „ჩემი საცავი" — **ერთი ბლოკი** (ეტაპი 5, 2026-09-13).

   შენი სიტყვები: „პროფილში რომაა ატვირთული ფაილები და საცავი — ერთი ან
   მეორეზე გადასვლა რატომ, ორივე იყოს გამოტანილი სრულად".

   ⚠️ **ადრე ერთი ფაქტი ორ გვერდად იყო გაჭრილი**: `/profile`-ზე ატვირთვების
   ბიბლიოთეკა, `/settings`-ზე ლიმიტი, გაზრდის მოთხოვნა და ობოლი ფაილები —
   და ორივე გვერდზე ერთმანეთზე მიმავალი ბმული იდო. სწორედ ის ბმულები იყო
   იმის აღიარება, რომ გაყოფა არასწორია.

   ახლა აქ ოთხივე ნაბიჯი ერთ ბარათშია: **ჯამი → ატვირთვები → ლიმიტის
   გაზრდა → ობოლი ფაილები**.

   ⚠️ **`/settings`-ს რჩება მხოლოდ `StorageAllocations`** — მოდულებზე
   ლიმიტების გაწერა მართლა პარამეტრია („რამდენი შეიძლება"), დანარჩენი კი
   ანგარიშის ფაქტია („რამდენი მაქვს და რა ავტვირთე").

   ⚠️ **ვებძებნის კვოტა ცალკე ბარათია** (`WebQuotaCard`) და არა ამის შიგნით:
   ის SerpApi-ის თვიური **ძებნების** ბიუჯეტია და არა დისკი — ერთ ბლოკში ორი
   სხვადასხვა რესურსი ერთ რიცხვად წაიკითხებოდა.
   ============================================================ */

const MB = 1024 * 1024

export function StorageCard() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { all } = useModules()

  const usageQ = useQuery({ queryKey: ['storage'], queryFn: fetchStorageUsage })

  // წაშლა/გადათვლა ერთსა და იმავეს ცვლის — სამივე ხედი ერთად უნდა განახლდეს
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['storage-files'] })
    // ჰედერის ინდიკატორი `/auth/me`-დან იკვებება
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  const recalc = useMutation({
    mutationFn: recalculateStorage,
    onSuccess: (usage) => {
      qc.setQueryData(['storage'], usage)
      refreshAll()
      toast({ title: t('storage.recalcDone'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const usage = usageQ.data
  // მოდულის სახელი key-იდან; `account` და `chat` მოდულები არ არიან (§16.4)
  const label = (key: string) =>
    key === 'account' || key === 'chat'
      ? t(`storage.${key}`)
      : (() => {
          const m = all.find((mod) => mod.key === key)
          return m ? moduleName(m, i18n.language) : key
        })()

  const rows = Object.entries(usage?.modules ?? {})
    .filter(([, bytes]) => bytes > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 font-display text-lg font-semibold tracking-tight">{t('storage.title')}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{t('storage.hint')}</p>

      {usageQ.isLoading || !usage ? (
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      ) : (
        <>
          <StorageBar usage={usage} />

          {rows.length > 0 ? (
            <ul className="mt-4 space-y-2 border-t border-border pt-4">
              {rows.map(([key, bytes]) => (
                <li key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{label(key)}</span>
                  <span className="shrink-0 tabular-nums">{formatBytes(bytes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              {t('storage.empty')}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{t('storage.recalcHint')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => recalc.mutate()}
              disabled={recalc.isPending}
            >
              <RotateCcw className="size-4" />
              {recalc.isPending ? t('actions.saving') : t('storage.recalc')}
            </Button>
          </div>

          {/* ⚠️ **ბიბლიოთეკა გაშლილია და არა ბმული** — „რა ავტვირთე" იმავე
              რიცხვის მეორე ნახევარია, რასაც ზოლი აჩვენებს */}
          <UploadedFiles />

          <QuotaRequest quota={usage.quota} />

          <OrphanFiles />
        </>
      )}
    </section>
  )
}

/**
 * ატვირთული ფაილების ბიბლიოთეკა — **საცავის ბარათის შიგნით**.
 *
 * ⚠️ **მასობრივ მოქმედებას სკოუპი ცხადად აქვს** (`მონიშნულები` vs `ყველა`),
 * ე.ი. ცარიელი მონიშვნა ვერასდროს ნიშნავს „ყველაფერს" — იგივე წესი, რაც
 * `/purge`-ს აქვს. ორივე დასტურს ითხოვს, რადგან წაშლა შეუქცევადია.
 *
 * ⚠️ **პრივატ დისკის რიგს ბოქლომი აქვს და ჩამოტვირთვის ღილაკი არა** — ფლაგი
 * backend-ისაა (`StorageFolder::isPrivate()`), SPA-ში მისი ასლი ადრე თუ
 * გვიან გაშორდებოდა და პრივატ ფაილს საჯარო URL-ზე გამოიტანდა.
 */
function UploadedFiles() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [downloading, setDownloading] = useState(false)

  const filesQ = useQuery({ queryKey: ['storage-files'], queryFn: () => fetchStorageFiles() })

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['storage-files'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const removeOne = useMutation({
    mutationFn: (path: string) => deleteStorageFile(path),
    onSuccess: () => {
      refreshAll()
      toast({ title: t('storage.fileDeleted'), variant: 'success' })
    },
    onError: fail,
  })

  const removeMany = useMutation({
    mutationFn: (scope: StorageScope) => deleteStorageFiles(scope),
    onSuccess: (res) => {
      refreshAll()
      toast({
        title: t('storage.filesDeleted', { count: res.deleted, size: formatBytes(res.freed) }),
        variant: 'success',
      })
    },
    onError: fail,
  })

  const askDeleteOne = async (file: UploadedFile) => {
    const ok = await confirm({
      title: t('storage.fileDeleteTitle'),
      description: t('storage.fileDeleteHint', { name: file.name ?? file.path }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) removeOne.mutate(file.path)
  }

  const askDeleteMany = async (scope: BulkScope, count: number) => {
    const ok = await confirm({
      title: t('storage.filesDeleteTitle'),
      description:
        scope === 'all'
          ? t('storage.filesDeleteAllHint', { count })
          : t('storage.filesDeleteSelectedHint', { count }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) removeMany.mutate(scope === 'all' ? { all: true } : { paths: scope.paths })
  }

  const download = async (scope: BulkScope) => {
    setDownloading(true)
    try {
      await downloadStorageFiles(scope === 'all' ? { all: true } : { paths: scope.paths })
    } catch (e) {
      fail(e)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">{t('storage.filesTitle')}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.filesHint')}</p>

      {filesQ.isLoading ? (
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      ) : (
        <StorageLibrary
          files={filesQ.data?.files ?? []}
          total={filesQ.data?.total}
          bytes={filesQ.data?.bytes}
          moduleTotals={filesQ.data?.modules}
          onDelete={askDeleteOne}
          onBulkDelete={askDeleteMany}
          onBulkDownload={(scope) => download(scope)}
          deletingPath={removeOne.isPending ? removeOne.variables : null}
          busy={removeMany.isPending || downloading}
        />
      )}
    </div>
  )
}

/**
 * ლიმიტის გაზრდის მოთხოვნა (Tasks 17.4).
 *
 * ცალკე ცხრილი არ გაჩენილა — იგივე `approval_requests`-ია, რაც მოდულებზე,
 * ე.ი. ადმინი მას `/requests`-ზე და `/users/{id}`-ზე იმავე ღილაკებით ხედავს.
 * ერთდროულად **ერთი ღია მოთხოვნაა** დაშვებული (backend-იც ამას იცავს).
 */
function QuotaRequest({ quota }: { quota: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const { data: mine = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })
  const storageRequests = mine.filter((r) => r.type === 'storage_increase')
  const pending = storageRequests.find((r) => r.status === 'pending')
  const last = storageRequests[0]

  // ნაგულისხმევი წინადადება — მიმდინარე ლიმიტი + 1 GB (ცარიელ ველზე ფიქრი არ სჭირდება)
  const [mb, setMb] = useState('')
  const [message, setMessage] = useState('')
  const suggested = Math.round(quota / MB) + 1024

  const done = () => {
    qc.invalidateQueries({ queryKey: ['my-requests'] })
    qc.invalidateQueries({ queryKey: ['pending-count'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const send = useMutation({
    mutationFn: () => requestStorageIncrease(Math.round(Number(mb) || suggested) * MB, message || undefined),
    onSuccess: () => {
      setMessage('')
      setMb('')
      done()
      toast({ title: t('storage.requestSent'), variant: 'success' })
    },
    onError: fail,
  })

  const cancel = useMutation({ mutationFn: cancelRequest, onSuccess: done, onError: fail })

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">{t('storage.requestTitle')}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.requestHint')}</p>

      {pending ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
          <span>{t('storage.requestPending', { requested: formatBytes(requestedQuota(pending)) })}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => cancel.mutate(pending.id)}
            disabled={cancel.isPending}
          >
            {t('modules.cancelRequest')}
          </Button>
        </div>
      ) : (
        <>
          {/* ბოლო პასუხი — რომ „გავაგზავნე და არაფერი მოხდა" შეგრძნება არ დარჩეს */}
          {last && (
            <p className="mb-2 text-xs text-muted-foreground">
              {t(`requests.status.${last.status}`)}
              {last.status === 'approved' &&
                grantedQuota(last) != null &&
                ` · ${formatBytes(grantedQuota(last)!)}`}
              {last.review_note && ` — ${last.review_note}`}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="quota-request">{t('storage.requestAmount')}</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="quota-request"
                  type="number"
                  min={10}
                  step={10}
                  className="w-32"
                  placeholder={String(suggested)}
                  value={mb}
                  onChange={(e) => setMb(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">MB</span>
              </div>
            </div>
            <Input
              className="min-w-52 flex-1"
              placeholder={t('storage.requestMessage')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => send.mutate()}
              disabled={send.isPending || Math.round(Number(mb) || suggested) * MB <= quota}
            >
              {send.isPending ? t('actions.saving') : t('storage.requestSend')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * ობოლი ფაილები (17.5) — დისკზე არიან, ბაზაში კი არავინ იხსენიებს.
 *
 * ⚠️ **გლობალური ოპერაციაა და არა per-user:** ატვირთვები საერთო
 * საქაღალდეებში ჯდება, ე.ი. არ-მოხსენიებულ ფაილს მფლობელი აღარ აქვს.
 * ამიტომ ბლოკი მხოლოდ `super_admin`-ს ჩანს (backend-ზეც იგივე ზღუდეა) —
 * **გვერდის შეცვლა უფლებას ვერ შეცვლის** (ეტაპი 5).
 */
function OrphanFiles() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { user } = useAuth()

  const isAdmin = !!user?.is_super_admin
  const orphansQ = useQuery({
    queryKey: ['storage-orphans'],
    queryFn: fetchStorageOrphans,
    enabled: isAdmin,
  })

  const clean = useMutation({
    mutationFn: cleanStorageOrphans,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['storage-orphans'] })
      toast({
        title: t('storage.orphansCleaned', {
          count: result.files,
          size: formatBytes(result.bytes),
        }),
        variant: 'success',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!isAdmin) return null

  const orphans = orphansQ.data

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">{t('storage.orphansTitle')}</h3>
      {/* §6.3 — ტექსტი ხსნის, **რა არის** და **რატომ გამოჩნდა**: ადრე მხოლოდ
          „დისკზე არიან, ბაზაში კი არავინ იხსენიებს" ეწერა, რაც არ პასუხობდა
          კითხვას „საიდან მოვიდა და უსაფრთხოა თუ არა წაშლა". */}
      <p className="mb-1.5 text-xs text-muted-foreground">{t('storage.orphansHint')}</p>
      <p className="mb-1.5 text-xs text-muted-foreground">{t('storage.orphansWhy')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.orphansSafe')}</p>

      {orphansQ.isLoading ? (
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      ) : !orphans?.total ? (
        <p className="text-sm text-muted-foreground">{t('storage.orphansEmpty')}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {t('storage.orphansFound', {
              count: orphans.total,
              size: formatBytes(orphans.bytes),
            })}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={clean.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: t('storage.orphansTitle'),
                description: t('storage.orphansConfirm', {
                  count: orphans.total,
                  size: formatBytes(orphans.bytes),
                }),
                confirmText: t('confirm.delete'),
                variant: 'destructive',
              })
              if (ok) clean.mutate()
            }}
          >
            <Trash2 className="size-4" />
            {clean.isPending ? t('actions.saving') : t('storage.orphansClean')}
          </Button>
        </div>
      )}
    </div>
  )
}

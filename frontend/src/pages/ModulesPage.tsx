import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Clock, Send, X } from 'lucide-react'
import {
  cancelRequest,
  fetchMyRequests,
  requestModule,
  setModuleEnabled,
  type ModuleInfo,
} from '@/api/account'
import { moduleDescription, moduleName, useModules } from '@/lib/modules'
import { errorMessage } from '@/lib/errors'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/**
 * მოდულების გვერდი (I3) — რა მაქვს ჩართული და რის ჩართვას ვთხოვ ადმინს.
 * რეგისტრაცია ღიაა, მოდულები კი მოთხოვნით ირთვება (შეთანხმებული ქცევა).
 */
export function ModulesPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { all, loading } = useModules()
  const [openFor, setOpenFor] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const { data: requests = [] } = useQuery({ queryKey: ['my-requests'], queryFn: fetchMyRequests })

  const ask = useMutation({
    mutationFn: ({ key, msg }: { key: string; msg?: string }) => requestModule(key, msg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      qc.invalidateQueries({ queryKey: ['modules'] })
      setOpenFor(null)
      setMessage('')
      toast({ title: t('modules.requestSent'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const cancel = useMutation({
    mutationFn: cancelRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      qc.invalidateQueries({ queryKey: ['modules'] })
    },
  })

  // K13 — თვითონ ჩართვა/გამორთვა (უფლება რჩება, ადმინს ხელახლა არ ეკითხები)
  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => setModuleEnabled(key, enabled),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['modules'] })
      toast({ title: t(v.enabled ? 'modules.turnedOn' : 'modules.turnedOff'), variant: 'info' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const pendingFor = (m: ModuleInfo) =>
    requests.find((r) => r.type === 'module_access' && r.module?.id === m.id && r.status === 'pending')

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{t('modules.title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t('modules.subtitle')}</p>

      {loading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      <div className="space-y-3">
        {all.map((m) => {
          const pending = pendingFor(m)
          return (
            <div key={m.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
                  <ModuleIcon name={m.icon} className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{moduleName(m, i18n.language)}</span>
                    {m.is_sensitive && (
                      <span className="rounded-[5px] border border-destructive/40 px-1.5 py-0.5 text-[11px] text-destructive">
                        18+
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {moduleDescription(m, i18n.language)}
                  </p>
                </div>

                <div className="shrink-0">
                  {/* უფლება მაქვს → შემიძლია თვითონ ჩავრთო/გამოვრთო (K13) */}
                  {m.granted ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Switch
                        checked={!!m.enabled}
                        disabled={toggle.isPending}
                        onCheckedChange={(v) => toggle.mutate({ key: m.key, enabled: v })}
                      />
                      <span className={m.enabled ? 'text-foreground' : 'text-muted-foreground'}>
                        {t(m.enabled ? 'modules.enabled' : 'modules.disabledByMe')}
                      </span>
                    </label>
                  ) : pending ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {t('modules.pending')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancel.mutate(pending.id)}
                        title={t('modules.cancelRequest')}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setOpenFor(m.id)}>
                      <Send className="size-4" />
                      {t('modules.request')}
                    </Button>
                  )}
                </div>
              </div>

              {openFor === m.id && (
                <div className="mt-3 border-t border-border pt-3">
                  <Textarea
                    rows={2}
                    placeholder={t('modules.messagePlaceholder')}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpenFor(null)}>
                      {t('actions.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={ask.isPending}
                      onClick={() => ask.mutate({ key: m.key, msg: message || undefined })}
                    >
                      <Send className="size-4" />
                      {t('modules.send')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ---------- ჩემი მოთხოვნების ისტორია ---------- */}
      {requests.length > 0 && (
        <section className="mt-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
            {t('modules.myRequests')}
          </h2>
          <ul className="space-y-2 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-border pb-2 last:border-b-0">
                <span className="font-medium">
                  {r.type === 'module_access'
                    ? t('modules.requestModuleLabel', {
                        name:
                          (i18n.language === 'ka' ? r.module?.name_ka : r.module?.name_en) ?? '—',
                      })
                    : t('modules.requestGenreLabel', {
                        name: (i18n.language === 'ka' ? r.genre?.name_ka : r.genre?.name_en) ?? '—',
                      })}
                </span>
                <span
                  className={
                    r.status === 'approved'
                      ? 'text-gold'
                      : r.status === 'rejected'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }
                >
                  {t(`requests.status.${r.status}`)}
                </span>
                {r.review_note && (
                  <span className="text-xs text-muted-foreground">— {r.review_note}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

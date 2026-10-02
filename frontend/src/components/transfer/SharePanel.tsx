import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Ban,
  Copy,
  ExternalLink,
  Eye,
  Link2,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  SquarePen,
  Trash2,
  UserPlus,
} from 'lucide-react'
import {
  deleteShareLink,
  fetchShareLinks,
  regenerateShareLink,
  SHARE_DOMAINS,
  updateShareLink,
  type ShareLink,
} from '@/api/shareLinks'
import { copyText } from '@/lib/clipboard'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { modAccent, moduleName, useModules } from '@/lib/modules'
import { shareTokenOf } from '@/lib/shareLinks'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { cn } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ShareLinkDialog } from '@/components/share/ShareLinkDialog'
import { ShareQr } from '@/components/share/ShareQr'

/* ============================================================
   **გაზიარების ბმულების სია** — „ექსპორტ & იმპორტის" მესამე ჩანართი
   (Tasks §40.5).

   ⚠️ **აქ ცხოვრობს და არა ცალკე გვერდზე**: ბიბლიოთეკის გატანა ფაილით თუ
   ბმულით ერთი კითხვაა — §31-ის მიზეზი, რის გამოც ექსპორტი და იმპორტი ერთ
   სექციად გაერთიანდა.

   ⚠️ **„ახალი ბმული" ძველს კლავს** — ეს დადასტურებას ითხოვს: ვისაც ძველი
   ბმული აქვს, ის ამ წამიდან „ასეთი ბმული არ არსებობს"-ს ნახავს.
   ============================================================ */

export function SharePanel() {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<ShareLink | null>(null)
  const [creating, setCreating] = useState(false)
  const [qrFor, setQrFor] = useState<ShareLink | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['share-links'], queryFn: fetchShareLinks })

  const links = data?.data ?? []
  const enabled = data?.meta.enabled ?? true

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Link2 className="size-5 text-muted-foreground" />
          {t('share.listTitle')}
          <InfoHint info={t('share.listHint')} />
        </h2>
        <div className="flex-1" />
        <Button type="button" disabled={!enabled} onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          {t('share.new')}
        </Button>
      </div>

      {!enabled && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {t('share.disabled')}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : links.length === 0 ? (
        <EmptyState
          icon={<Link2 className="size-6" />}
          title={t('share.empty')}
          hint={t('share.emptyHint')}
          actions={
            enabled && (
              <Button type="button" onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                {t('share.new')}
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {links.map((link) => (
            <ShareLinkCard
              key={link.id}
              link={link}
              onEdit={() => setEditing(link)}
              onQr={() => setQrFor(link)}
            />
          ))}
        </ul>
      )}

      {creating && <ShareLinkDialog onClose={() => setCreating(false)} />}
      {editing && <ShareLinkDialog link={editing} onClose={() => setEditing(null)} />}

      {qrFor?.url && (
        <ModalShell title={qrFor.name || t('share.unnamed')} onClose={() => setQrFor(null)}>
          <div className="grid place-items-center gap-3">
            <ShareQr value={qrFor.url} size={220} />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">{qrFor.url}</p>
          </div>
          <ModalFooter>
            <Button type="button" onClick={() => setQrFor(null)}>
              {t('actions.close')}
            </Button>
          </ModalFooter>
        </ModalShell>
      )}
    </div>
  )
}

/** მდგომარეობის ტონი — სტატუსების პალიტრიდან (`STATUS_BADGE`), მესამე პალიტრა არ იქმნება */
const STATE_TONE: Record<ShareLink['state'], string> = {
  active: STATUS_BADGE.watched,
  expired: STATUS_BADGE.towatch,
  revoked: STATUS_BADGE.dropped,
}

function ShareLinkCard({ link, onEdit, onQr }: { link: ShareLink; onEdit: () => void; onQr: () => void }) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  // ⚠️ `all` და არა `enabled`: გათიშული მოდულის სექციაც სახელითა და ფერით უნდა დაიხატოს
  const { all } = useModules()
  const { date, relative } = useDateFormat()

  const refresh = () => qc.invalidateQueries({ queryKey: ['share-links'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const regenerate = useMutation({
    mutationFn: () => regenerateShareLink(link.id),
    onSuccess: () => {
      refresh()
      toast({ title: t('share.regenerated'), variant: 'success' })
    },
    onError: fail,
  })

  const revoke = useMutation({
    mutationFn: (revoked: boolean) => updateShareLink(link.id, { revoked }),
    onSuccess: refresh,
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => deleteShareLink(link.id),
    onSuccess: () => {
      refresh()
      toast({ title: t('share.deleted'), variant: 'success' })
    },
    onError: fail,
  })

  const token = shareTokenOf(link.url)
  const active = link.state === 'active'

  const copy = async () => {
    if (!link.url) return
    const ok = await copyText(link.url)
    toast({ title: ok ? t('share.copied') : t('share.copyFailed'), variant: ok ? 'success' : 'error' })
  }

  const askRegenerate = async () => {
    const ok = await confirm({
      title: t('share.regenerateTitle'),
      description: t('share.regenerateHint'),
      confirmText: t('share.regenerate'),
      variant: 'destructive',
    })
    if (ok) regenerate.mutate()
  }

  const askRevoke = async () => {
    const ok = await confirm({
      title: t('share.revokeTitle'),
      description: t('share.revokeHint'),
      confirmText: t('share.revoke'),
      variant: 'destructive',
    })
    if (ok) revoke.mutate(true)
  }

  const askDelete = async () => {
    const ok = await confirm({
      title: t('share.deleteTitle'),
      description: t('share.deleteHint', { name: link.name || t('share.unnamed') }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) remove.mutate()
  }

  const sections = SHARE_DOMAINS.filter((d) => d in link.domains)

  return (
    <li
      className={cn('flex flex-col gap-3 rounded-xl border border-border bg-card p-4', !active && 'opacity-75')}
      style={modAccent('var(--tool-transfer)')}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
          <Link2 />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{link.name || t('share.unnamed')}</span>
            <Badge className={STATE_TONE[link.state]}>{t(`share.state.${link.state}`)}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('share.createdAt', { date: date(link.created_at) })}
            {' · '}
            {link.expires_at ? t('share.expiresAt', { date: date(link.expires_at) }) : t('share.noExpiry')}
          </p>
        </div>
      </div>

      {/* სექციები რაოდენობებით — გათიშული მოდული ცხადად აღინიშნება */}
      <div className="flex flex-wrap gap-2">
        {sections.map((domain) => {
          const m = all.find((x) => x.key === domain)
          const off = link.unavailable.includes(domain)

          return (
            <span
              key={domain}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs',
                off && 'text-muted-foreground line-through',
              )}
              style={modAccent(m?.color)}
              title={off ? t('share.sectionUnavailable') : undefined}
            >
              <ModuleIcon name={m?.icon ?? 'Film'} className="size-3.5 text-[var(--mod)]" />
              {m ? moduleName(m, i18n.language) : domain}
              {!off && <span className="tabular-nums text-muted-foreground">{link.counts[domain] ?? 0}</span>}
            </span>
          )
        })}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Eye className="size-3.5" />
          {t('share.views', { count: link.views })}
        </span>
        <span className="inline-flex items-center gap-1">
          <UserPlus className="size-3.5" />
          {t('share.imports', { count: link.imports })}
        </span>
        {link.last_opened_at && <span>{t('share.lastOpened', { when: relative(link.last_opened_at) })}</span>}
      </p>

      {/* §40.8 — ვინ დაიმატა ამ ბმულიდან (ახლები ზემოთ; ბევრზე — პირველი ხუთი და „კიდევ N") */}
      {link.importers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('share.importedBy', {
            names: link.importers
              .slice(0, 5)
              .map((i) => (i.username ? `@${i.username} (${i.added})` : `${i.display_name} (${i.added})`))
              .join(', '),
          })}
          {link.importers.length > 5 && ` ${t('share.importedMore', { count: link.importers.length - 5 })}`}
        </p>
      )}

      {!link.readable && (
        <p className="text-xs text-destructive">{t('share.unreadable')}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {link.readable && (
          <Button type="button" size="sm" variant="outline" onClick={copy} disabled={!active}>
            <Copy className="size-4" />
            {t('share.copy')}
          </Button>
        )}
        {token && active && (
          <a
            href={`/share/${token}`}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <ExternalLink className="size-4" />
            {t('share.open')}
          </a>
        )}
        <Button type="button" size="sm" variant="edit" onClick={onEdit}>
          <SquarePen className="size-4" />
          {t('actions.edit')}
        </Button>
        {!link.readable && (
          <Button type="button" size="sm" variant="outline" onClick={askRegenerate} disabled={regenerate.isPending}>
            <RefreshCw className="size-4" />
            {t('share.regenerate')}
          </Button>
        )}

        <div className="flex-1" />

        <ActionMenu label={t('actions.more')}>
          {link.readable && active && (
            <ActionMenuClose className={actionItemClass()} onClick={onQr}>
              <QrCode className="size-4" />
              {t('share.qr')}
            </ActionMenuClose>
          )}
          {link.readable && (
            <ActionMenuClose className={actionItemClass()} onClick={askRegenerate}>
              <RefreshCw className="size-4" />
              {t('share.regenerate')}
            </ActionMenuClose>
          )}
          {link.state === 'revoked' ? (
            <ActionMenuClose className={actionItemClass()} onClick={() => revoke.mutate(false)}>
              <RotateCcw className="size-4" />
              {t('share.unrevoke')}
            </ActionMenuClose>
          ) : (
            <ActionMenuClose className={actionItemClass('destructive')} onClick={askRevoke}>
              <Ban className="size-4" />
              {t('share.revoke')}
            </ActionMenuClose>
          )}
          <ActionMenuClose className={actionItemClass('destructive')} onClick={askDelete}>
            <Trash2 className="size-4" />
            {t('actions.delete')}
          </ActionMenuClose>
        </ActionMenu>
      </div>
    </li>
  )
}

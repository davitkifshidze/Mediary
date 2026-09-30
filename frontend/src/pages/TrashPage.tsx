import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveRestore,
  BellRing,
  Blocks,
  DatabaseBackup,
  Eye,
  Folder,
  FormInput,
  HardDrive,
  ImageIcon,
  ListMusic,
  Lock,
  MessageSquare,
  MessageSquareText,
  Paperclip,
  SquarePlay,
  StickyNote,
  Tags,
  Trash2,
  Undo2,
  UserRound,
  CircleDashed,
  CircleUserRound,
  Replace,
  ScrollText,
} from 'lucide-react'
import {
  deleteFromTrash,
  emptyTrash,
  fetchTrash,
  restoreFromTrash,
  type TrashGroup,
  type TrashItem,
} from '@/api/trash'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { LOCKED_PHOTO_PLACEHOLDER } from '@/lib/lockedPhoto'
import { MODULE_ACCENT_FALLBACK, modAccent, moduleName, useModules } from '@/lib/modules'
import { toolAccent } from '@/lib/toolSections'
import { formatBytes } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PrivateImage } from '@/components/PrivateFile'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'

/* ============================================================
   ურნა (FEAT-11 → Tasks §29).

   შენი სიტყვები: „იქ ყველა წაშლილი ჩავარდეს, ნებისმიერი რამ: ფოტო, ბმული,
   ფილმი, სერიალი, გალერეიდან თუ საიდანაც იქნება — და 30 დღე აღდგენის
   შესაძლებლობა იყოს".

   ⚠️ **ჯგუფი ურნის სახეა** (`kind`) — ჩანაწერები მოდულებად, ფაილები
   თავ-თავიანთ ჯგუფად (გალერეის ფოტო, ვიდეო-ბმული, მოდულის ფაილი, ველის
   ფაილი, ჩატის ფაილი, ბაზის ასლი), ჩატის წერილები — ერთ ჯგუფად, სკოუპით
   („მხოლოდ ჩემთან" / „ორივესთან"). ფოტოს ესკიზი აქვს.

   ⚠️ **ურნა ადგილს იკავებს** (29.4) — გვერდი თავში ამბობს, რამდენს, და
   „ადგილის გათავისუფლება" = საბოლოო წაშლა.

   ⚠️ **ეს `/purge`-ის შემცვლელი არ არის.** `/purge` **სხვისი** ბიბლიოთეკიდან
   შლის მასობრივად (`super_admin`), ეს კი **ჩემი** წაშლილების სიაა.

   ⚠️ **დაცლას აკრეფილი `DELETE` სჭირდება, ერთი ელემენტის წაშლას — არა.**
   ============================================================ */

const CONFIRM_WORD = 'DELETE'

/**
 * არაჩანაწერული სახის ხატულა. ⚠️ ჩანაწერს მოდულის ხატულა აქვს (`modules.icon`),
 * ფაილს — საკუთარი: „ფილმის ფაილი" ფილმის ხატულით ჩანაწერს დაემსგავსებოდა.
 */
function kindIcon(kind: string): ReactNode {
  if (kind === 'gallery_image' || kind === 'record_photo') return <ImageIcon />
  if (kind === 'avatar') return <CircleUserRound />
  if (kind === 'gallery_video' || kind === 'game_video') return <SquarePlay />
  if (kind === 'database_backup') return <DatabaseBackup />
  if (kind === 'chat_file') return <MessageSquare />
  if (kind === 'chat_message') return <MessageSquareText />
  if (kind === 'audit_log') return <ScrollText />
  // §37.7 — პირადი მოდული, ჩანაწერებთან ერთად
  if (kind === 'custom_module') return <Blocks />
  if (kind === 'field_file') return <FormInput />
  if (kind.endsWith('_note')) return <StickyNote />
  if (kind === 'playlist') return <ListMusic />
  if (kind === 'note_reminder') return <BellRing />
  if (kind === 'media_watch') return <Eye />
  if (kind === 'gallery_album') return <Folder />
  if (kind === 'cast_link') return <UserRound />
  if (kind === 'status') return <CircleDashed />
  if (/_(genre|type|category)$/.test(kind)) return <Tags />
  return <Paperclip />
}

/** ჯგუფის ფერი — მოდულისა; ფსევდო-მოდულზე ინსტრუმენტისა (ჩატი, ასლები) */
function groupAccent(group: TrashGroup): CSSProperties {
  if (group.module === 'chat') return toolAccent('chat') ?? MODULE_ACCENT_FALLBACK
  if (group.module === 'backup') return toolAccent('backups') ?? MODULE_ACCENT_FALLBACK
  if (group.module === 'audit') return toolAccent('audit') ?? MODULE_ACCENT_FALLBACK
  return modAccent(group.color) ?? MODULE_ACCENT_FALLBACK
}

export function TrashPage() {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [word, setWord] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: fetchTrash,
  })

  const groups = data?.data ?? []
  const total = groups.reduce((sum, g) => sum + g.total, 0)

  /**
   * ⚠️ **ყველა query უქმდება და არა მხოლოდ `['trash']`.** აღდგენილი
   * ელემენტი თავის სექციაშიც უნდა გამოჩნდეს, დეშბორდის რიცხვიც შეიცვალა
   * და საცავის ჯამიც — წერტილოვანი invalidate ერთ-ერთს აუცილებლად
   * გამორჩებოდა და გვერდი „არაფერი შეიცვალა"-ს აჩვენებდა.
   */
  const refresh = () => queryClient.invalidateQueries()

  const restore = useMutation({
    mutationFn: ({
      group,
      item,
      records = false,
      replace = false,
    }: {
      group: TrashGroup
      item: TrashItem
      records?: boolean
      replace?: boolean
    }) => restoreFromTrash(group.kind, item.id, { records, replace }),
    onSuccess: (res, { item }) => {
      toast({
        title:
          res.records > 0
            ? t('trash.restoredWithRecords', { count: res.records })
            : res.with_parent && item.parent
              ? t('trash.restoredWithParent', { name: item.parent.title })
              : t('trash.restored'),
        variant: 'success',
      })
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: ({ group, item }: { group: TrashGroup; item: TrashItem }) => deleteFromTrash(group.kind, item.id),
    onSuccess: () => {
      toast({ title: t('trash.deleted'), variant: 'success' })
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const clear = useMutation({
    mutationFn: () => emptyTrash(CONFIRM_WORD),
    onSuccess: (res) => {
      toast({ title: t('trash.emptied', { count: res.deleted }), variant: 'success' })
      setWord('')
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const removeOne = async (group: TrashGroup, item: TrashItem) => {
    const ok = await confirm({
      title: t('trash.deleteTitle'),
      /* ⚠️ ჩატის წერილი საბოლოოდ არ იშლება (§4.6 — ბაზაში რჩება) — ურნიდან
         მხოლოდ აღდგენის შესაძლებლობა ქრება, და ტექსტი ზუსტად ამას ამბობს */
      description:
        group.category === 'record'
          ? t('trash.deleteHint', { name: item.title })
          : group.category === 'message'
            ? t('trash.deleteMessageHint', { name: item.title })
            : group.kind === 'audit_log'
              ? t('trash.deleteAuditHint', { count: item.count ?? 0 })
              : group.kind === 'custom_module'
                ? t('trash.deleteModuleHint', { name: item.title, count: item.count ?? 0, size: formatBytes(item.size) })
                : t('trash.deleteFileHint', { name: item.title, size: formatBytes(item.size) }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })

    if (ok) remove.mutate({ group, item })
  }

  const { dateTime } = useDateFormat()
  const { all: allModules } = useModules()

  /* ⚠️ მრავალმოდულიან ჯგუფში (სტატუსი, ნახვა, ველის ფაილი) ქვესათაური
     მოდულის სახელია — თორემ „სტატუსები"-ში ორი „ნანახი" ერთმანეთისგან
     ვერ გაირჩეოდა. სახელი `useModules()`-იდან, ენის მიხედვით. */
  const itemModule = (group: TrashGroup, item: TrashItem) => {
    if (!item.module || group.module) return null
    const found = allModules.find((m) => m.key === item.module)
    return found ? moduleName(found, i18n.language) : null
  }

  /* ⚠️ აუდიტის გასუფთავების სათაურს კლიენტი აწყობს — ის ენაზეა დამოკიდებული,
     სერვერი კი მხოლოდ რიცხვს იძლევა (`count`) */
  const itemTitle = (group: TrashGroup, item: TrashItem) =>
    group.kind === 'audit_log' ? t('trash.auditTitle', { count: item.count ?? 0 }) : item.title

  const groupName = (group: TrashGroup) =>
    group.category === 'record'
      ? ((i18n.language === 'ka' ? group.name_ka : group.name_en) ?? group.kind)
      : t(`trash.kinds.${group.kind}`)

  return (
    <PageContainer>
      <PageHeader
        tool="trash"
        title={t('trash.title')}
        subtitle={total > 0 ? t('trash.count', { count: total }) : undefined}
        hint={<InfoHint info={t('trash.hint', { days: data?.keep_days ?? 30, max: data?.max_days ?? 365 })} />}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<ArchiveRestore className="size-6" />}
          title={t('trash.empty')}
          hint={t('trash.emptyHint')}
        />
      ) : (
        <>
          {/* ⚠️ ცოცხალი ფაქტი და არა ინსტრუქცია — ამიტომ ტექსტია და არა `i` */}
          <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm">
            <HardDrive className="size-4 text-muted-foreground" />
            <span className="font-medium tabular-nums">{t('trash.bytes', { size: formatBytes(data?.bytes ?? 0) })}</span>
            <span className="text-muted-foreground">{t('trash.bytesHint')}</span>
          </p>

          <div className="grid gap-4">
            {groups.map((group) => (
              <section
                key={group.kind}
                className="rounded-xl border border-border bg-card p-5"
                style={groupAccent(group)}
              >
                <header className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]">
                    {group.category === 'record' ? <ModuleIcon name={group.icon} /> : kindIcon(group.kind)}
                  </span>
                  <h2 className="font-display text-lg font-semibold">{groupName(group)}</h2>
                  <span className="text-sm text-muted-foreground">
                    {t('trash.count', { count: group.total })}
                    {group.bytes > 0 && ` · ${formatBytes(group.bytes)}`}
                  </span>
                  {group.kind === 'database_backup' && <InfoHint info={t('trash.backupHint')} />}
                </header>

                <ul className="grid gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background p-3"
                    >
                      <Thumb item={item} fallback={group.category === 'record' ? <ModuleIcon name={group.icon} /> : kindIcon(group.kind)} />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{itemTitle(group, item)}</span>
                        {(item.subtitle ?? itemModule(group, item)) && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.subtitle ?? itemModule(group, item)}
                          </span>
                        )}
                        {item.scope && (
                          <span className="block text-xs text-muted-foreground">{t(`trash.scope.${item.scope}`)}</span>
                        )}
                        {item.when && (
                          <span className="block text-xs text-muted-foreground">
                            {t(`trash.when.${group.kind}`, { date: dateTime(item.when) })}
                          </span>
                        )}
                        {item.count !== null && item.count > 0 && group.kind !== 'audit_log' && (
                          <span className="block text-xs text-muted-foreground">
                            {group.kind === 'gallery_album'
                              ? t('trash.albumPhotos', { count: item.count })
                              : group.kind === 'custom_module'
                                ? t('trash.moduleRecords', { count: item.count })
                                : t('trash.recordsMoved', { count: item.count })}
                          </span>
                        )}
                        <Expiry item={item} />
                        {item.parent?.trashed && (
                          <span className="block text-xs text-[var(--icon-info)]">
                            {t('trash.parentTrashed', { name: item.parent.title })}
                          </span>
                        )}
                        {item.blocked && (
                          <span className="block text-xs text-destructive">{t(`trash.blocked.${item.blocked}`)}</span>
                        )}
                      </span>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={restore.isPending || !item.restorable}
                        onClick={() => restore.mutate({ group, item })}
                      >
                        <Undo2 className="size-4" />
                        {t('trash.restore')}
                      </Button>

                      {/* ⚠️ კლასიფიკატორი: „მხოლოდ რიგი" ნაგულისხმევია (Q21), ჩანაწერების
                          დაბრუნება — ცალკე, ცხადი არჩევანი */}
                      {/* ⚠️ ეტაპი 4 — დაკავებულ სვეტში აღდგენა ცხადი „ჩანაცვლებაა":
                          ახლანდელი ფოტო თვითონ გადავა ურნაში და არაფერი დაიკარგება */}
                      {item.replaceable && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={restore.isPending}
                          title={t('trash.replaceHint')}
                          onClick={() => restore.mutate({ group, item, replace: true })}
                        >
                          <Replace className="size-4" />
                          {t('trash.replace')}
                        </Button>
                      )}

                      {item.offers_records && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={restore.isPending || !item.restorable}
                          onClick={() => restore.mutate({ group, item, records: true })}
                        >
                          <Undo2 className="size-4" />
                          {t('trash.withRecords', { count: item.count ?? 0 })}
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        disabled={remove.isPending}
                        onClick={() => removeOne(group, item)}
                      >
                        <Trash2 className="size-4" />
                        {t('trash.deleteNow')}
                      </Button>
                    </li>
                  ))}
                </ul>

                {/* ⚠️ სერვერი თითო ჯგუფზე 50 რიგს აბრუნებს — თუ მეტია,
                    ეს ითქმება, თორემ „სულ 120" და თხუთმეტი ხილული რიგი
                    ერთმანეთს ეწინააღმდეგება. */}
                {group.total > group.items.length && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('trash.more', { count: group.total - group.items.length })}
                  </p>
                )}
              </section>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <div className="min-w-48">
              <Label htmlFor="trash-confirm">{t('trash.confirmLabel', { word: CONFIRM_WORD })}</Label>
              <Input
                id="trash-confirm"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
              />
            </div>
            <Button
              variant="destructive"
              disabled={word.trim() !== CONFIRM_WORD || clear.isPending}
              onClick={() => clear.mutate()}
            >
              <Trash2 className="size-4" />
              {t('trash.emptyAction')}
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  )
}

/**
 * ესკიზი — ფოტო, პოსტერი ან სახის ხატულა.
 *
 * ⚠️ **ჩაკეტილი ალბომის ფოტო ბუნდოვანი ფილაა** (29.5): სერვერი ესკიზს
 * საერთოდ არ აგზავნის, ე.ი. აქ დასაბუნდოვნებელი არაფერია — ერთი სტატიკური
 * აქტივი (`LOCKED_PHOTO_PLACEHOLDER`) და ბოქლომი. პირადი დისკის ფაილი
 * ბლობად იკითხება ურნის საკუთარი მარშრუტით.
 */
function Thumb({ item, fallback }: { item: TrashItem; fallback: ReactNode }) {
  const box =
    'relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--mod-soft)] [&>svg]:size-5 [&>svg]:text-[var(--mod)]'

  if (item.locked) {
    return (
      <span className={box}>
        <img src={LOCKED_PHOTO_PLACEHOLDER} alt="" className="absolute inset-0 size-full object-cover" />
        <Lock className="relative size-4 text-white drop-shadow" />
      </span>
    )
  }

  if (!item.preview) return <span className={box}>{fallback}</span>

  return (
    <span className={box}>
      {item.preview.private ? (
        <PrivateImage url={item.preview.src} alt="" className="size-full object-cover" />
      ) : (
        <img src={storageUrl(item.preview.src) ?? ''} alt="" loading="lazy" className="size-full object-cover" />
      )}
    </span>
  )
}

/**
 * „როდის წაიშლება" — თარიღიც, დარჩენილი დღეებიც და ზომა.
 *
 * ⚠️ **დღეების რიცხვი სერვერიდან მოდის** (`expires_in_days`): ვადა
 * `TrashDomain::KEEP_DAYS`-შია და მისი ასლი კლიენტში პირველივე შეცვლაზე
 * დაშორდებოდა — გვერდი „7 დღე რჩება"-ს დაწერდა, სერვერი კი 30-ზე შლიდა.
 */
function Expiry({ item }: { item: TrashItem }) {
  const { t } = useTranslation()
  const { date } = useDateFormat()

  return (
    <span className="block text-xs text-muted-foreground">
      {item.trashed_at ? date(item.trashed_at) : '—'}
      {' · '}
      {item.expires_in_days > 0
        ? t('trash.expiresIn', { count: item.expires_in_days })
        : t('trash.expiresToday')}
      {item.size > 0 && ` · ${formatBytes(item.size)}`}
    </span>
  )
}

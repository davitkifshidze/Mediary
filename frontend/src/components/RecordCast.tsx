import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, EyeOff, UserPlus } from 'lucide-react'
import { detachCastMember, reorderRecordCast, updateRecordCast } from '@/api/cast'
import type { CastMember } from '@/api/types'
import { CastMemberDialog } from '@/components/CastMemberDialog'
import { CastRoleDialog } from '@/components/CastRoleDialog'
import { PosterImage } from '@/components/PosterImage'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { AutoHeight } from '@/components/ui/auto-height'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { castName } from '@/lib/display'
import { dragRowClass, useDragReorder } from '@/lib/dragReorder'
import { errorMessage } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { castActions, castOrderPayload, reorderCast, splitCast, type CastAction } from '@/lib/recordCast'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'

/* ============================================================
   ჩანაწერის მსახიობები — ფილმი, სერიალი, ანიმე (Tasks §16).

   შენი მოთხოვნა: „უშუალოდ ფილმში მსახიობზე მარჯვენა კლიკით კონტექსტური
   მენიუ ჰქონდეს; drag & drop-ით დალაგებაც შესაძლებელი იყოს; მსახიობის
   დამალვა ან წაშლაც".

   ⚠️ **სამივე მოქმედება სერვერის წესზე დგას და არა ამ ფაილზე.** აქამდე
   სინქრონიზაცია TMDB-ის სიას თავიდან წერდა — წაშლილი უკან ბრუნდებოდა,
   შენი დალაგება და როლი კი ქრებოდა. ახლა ეს `CastSync::fromSource()`-ის
   საქმეა: ადამიანის შეხებულ რიგს წყარო აღარ ეხება.

   ⚠️ **დალაგება მხოლოდ ხილულებზეა**; დამალულები ბოლოში, დაკეცილ ჯგუფში
   დგას და სერვერს სიის ბოლოს მიდის (`castOrderPayload`) — სერვერი სრულ
   სიას ელის.

   ⚠️ **კონტექსტური მენიუს მოქმედება `setTimeout`-ით ეშვება** (`MovieCard`-ის
   წესი): დიალოგი (დასტური, როლი) მენიუს სრულ დახურვამდე რომ გაიხსნას,
   მენიუ ფოკუსს თავის ტრიგერს დაუბრუნებდა და დიალოგს წაართმევდა.
   ============================================================ */

/** ბადე — იგივე სვეტები, რაც ჩანაწერის გვერდს ჰქონდა */
const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'

export function RecordCast({
  type,
  recordId,
  cast,
  detailKey,
}: {
  type: MediaType
  recordId: number
  /** ჩანაწერის სრული სია (დამალულების ჩათვლით), სერვერის რიგით */
  cast: CastMember[]
  /** ჩანაწერის გვერდის ქეშის გასაღები — ოპტიმისტური დალაგება მასში იწერება */
  detailKey: QueryKey
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const nav = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()

  const [adding, setAdding] = useState(false)
  const [roleOf, setRoleOf] = useState<CastMember | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const { visible, hidden } = useMemo(() => splitCast(cast), [cast])
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible])

  /**
   * ქეში. ⚠️ წაშლა მსახიობის გვერდსა და ჩანაწერის გალერეასაც ეხება
   * (წაშლილი არსად ჩანს), დამალვა და დალაგება — მხოლოდ ამ გვერდს.
   */
  const refresh = (everywhere = false) => {
    qc.invalidateQueries({ queryKey: detailKey })
    if (everywhere) {
      qc.invalidateQueries({ queryKey: ['actor'] })
      qc.invalidateQueries({ queryKey: ['gallery', type, recordId] })
    }
  }

  const withCast = (next: (list: CastMember[]) => CastMember[]) =>
    qc.setQueryData<{ cast: CastMember[] }>(detailKey, (old) => (old ? { ...old, cast: next(old.cast) } : old))

  const reorder = useMutation({
    mutationFn: (ids: number[]) => reorderRecordCast(type, recordId, ids),
    /* ოპტიმისტურად — ბარათი ჩაშვებისთანავე თავის ადგილზე დგება. ⚠️ ჯერ
       მიმდინარე ჩამოტვირთვა ჩერდება, თორემ ძველი რიგით დაბრუნებული პასუხი
       ახალ დალაგებას ზედ დააწერდა და ბარათი წამით უკან „გადახტებოდა". */
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: detailKey })
      withCast((list) => reorderCast(list, ids))
    },
    onSuccess: (next) => withCast(() => next),
    onError: (e) => {
      toast({ title: errorMessage(e), variant: 'error' })
      refresh()
    },
  })

  const drag = useDragReorder(visibleIds, (ids) => reorder.mutate(castOrderPayload(ids, hidden)))

  const toggleHidden = useMutation({
    mutationFn: (c: CastMember) => updateRecordCast(type, recordId, c.id, { is_hidden: !c.is_hidden }),
    // ოპტიმისტურად — ბარათი მაშინვე გადადის „დამალულში" (ან უკან)
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: detailKey })
      withCast((list) => list.map((x) => (x.id === c.id ? { ...x, is_hidden: !c.is_hidden } : x)))
    },
    onSuccess: (_data, c) => {
      refresh()
      toast({
        title: t(c.is_hidden ? 'cast.shown' : 'cast.hiddenToast', { name: castName(c, lang) }),
        variant: 'success',
      })
    },
    onError: (e) => {
      toast({ title: errorMessage(e), variant: 'error' })
      refresh()
    },
  })

  const detach = useMutation({
    mutationFn: (castId: number) => detachCastMember(type, recordId, castId),
    onSuccess: () => {
      refresh(true)
      toast({ title: t('cast.detached'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /**
   * ⚠️ **წაშლა ლექსიკონს არ ეხება.** მსახიობი გლობალურ ლექსიკონში რჩება
   * (მას სხვისი ფილმებიც ეყრდნობა), აქ მხოლოდ ბმული ქრება — და სერვერი
   * TMDB-ის მსახიობს ისე ინიშნავს, რომ სინქრონიზაციამ ვეღარ დააბრუნოს.
   * დასტური ამ გარჩევას ცხადს ხდის; „დამალვა" მის შექცევად ალტერნატივად რჩება.
   */
  const askDetach = async (c: CastMember) => {
    const ok = await confirm({
      title: t('cast.detachTitle'),
      description: t('cast.detachHint', { name: castName(c, lang) }),
      confirmText: t('cast.detach'),
      cancelText: t('confirm.cancel'),
      variant: 'destructive',
    })
    if (ok) detach.mutate(c.id)
  }

  const actionsFor = (c: CastMember, index: number): CastAction[] =>
    castActions({
      t,
      hidden: !!c.is_hidden,
      onOpen: () => nav(`/actors/${c.id}`),
      onEditRole: () => setRoleOf(c),
      onEarlier: !c.is_hidden && index > 0 ? () => drag.moveBy(c.id, -1) : undefined,
      onLater: !c.is_hidden && index < visible.length - 1 ? () => drag.moveBy(c.id, 1) : undefined,
      onToggleHidden: () => toggleHidden.mutate(c),
      onDelete: () => askDetach(c),
    })

  const card = (c: CastMember, index: number) => {
    const actions = actionsFor(c, index)
    const movable = !c.is_hidden

    return (
      <ContextMenu key={c.id}>
        <ContextMenuTrigger asChild>
          <div
            {...(movable ? drag.handlers(c.id) : {})}
            className={cn(
              'group/cast relative rounded-md border p-2 text-center',
              movable ? dragRowClass(drag, c.id, 'border-transparent hover:border-border') : 'border-transparent',
            )}
          >
            {/* ⚠️ `draggable={false}` ბმულსა და ფოტოზე — ორივე თავისით გადაითრევა
                და ბარათის drag & drop-ს ჩაანაცვლებდა (ბრაუზერი URL-ს „წაიღებდა") */}
            <Link to={`/actors/${c.id}`} draggable={false} className="block cursor-pointer">
              <PosterImage
                src={c.photo}
                alt={castName(c, lang)}
                draggable={false}
                className="mx-auto size-20 rounded-full ring-1 ring-border transition-transform duration-300 group-hover/cast:scale-105"
              />
              <div className="mt-2 truncate text-xs font-medium group-hover/cast:text-gold">{castName(c, lang)}</div>
              {c.character && <div className="truncate text-xs text-muted-foreground">{c.character}</div>}
            </Link>

            {/* ⚠️ `⋯` კლავიატურისა და სენსორული ეკრანის გზაა — მარჯვენა კლიკი
                მალსახმობია და არა ერთადერთი კარი */}
            <div className="absolute right-0.5 top-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cast:opacity-100">
              <ActionMenu label={t('actions.more')}>
                {actions.map((action) => (
                  <ActionMenuClose key={action.key} asChild>
                    <button
                      type="button"
                      onClick={action.run}
                      className={actionItemClass(action.danger ? 'destructive' : undefined)}
                    >
                      <action.icon className="size-4" />
                      {action.label}
                    </button>
                  </ActionMenuClose>
                ))}
              </ActionMenu>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          {actions.map((action) => (
            <Fragment key={action.key}>
              {action.danger && <ContextMenuSeparator />}
              <ContextMenuItem
                onSelect={() => setTimeout(action.run, 0)}
                className={action.danger ? 'text-destructive focus:bg-destructive/10 focus:text-destructive' : undefined}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-lg font-semibold">
          <span>
            {t('detail.cast')}
            {visible.length > 0 && <span className="text-muted-foreground"> · {visible.length}</span>}
          </span>
          {visible.length > 1 && <InfoHint info={t('cast.arrangeHint')} />}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <UserPlus className="size-4" />
          {t('cast.add')}
        </Button>
      </div>

      {cast.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('cast.empty')}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('cast.allHidden')}</p>
      ) : (
        <div className={GRID}>{visible.map((c, i) => card(c, i))}</div>
      )}

      {/* დამალულები — სიის ბოლოს, დაკეცილად. ⚠️ ისინი ჩანაწერზე რჩება
          (ძებნა, მსახიობის გვერდი, გალერეა); მხოლოდ ამ სიიდან იმალება. */}
      {hidden.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              aria-expanded={showHidden}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown className={cn('size-4 transition-transform', !showHidden && '-rotate-90')} />
              <EyeOff className="size-4" />
              {t('cast.hiddenGroup', { count: hidden.length })}
            </button>
            <InfoHint info={t('cast.hiddenGroupHint')} />
          </div>
          <AutoHeight>
            {showHidden && <div className={cn(GRID, 'pt-3 opacity-70')}>{hidden.map((c, i) => card(c, i))}</div>}
          </AutoHeight>
        </div>
      )}

      {adding && (
        <CastMemberDialog
          type={type}
          recordId={recordId}
          onClose={() => setAdding(false)}
          onAdded={() => refresh(true)}
        />
      )}

      {roleOf && (
        <CastRoleDialog
          type={type}
          recordId={recordId}
          member={roleOf}
          onClose={() => setRoleOf(null)}
          onSaved={() => refresh()}
        />
      )}
    </section>
  )
}

import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownloadCloud, Globe, Images, Maximize2, Trash2, User, Video } from 'lucide-react'
import {
  deleteGalleryImage,
  fetchActorGalleryImages,
  fetchGalleryGroups,
  fetchGalleryPhotos,
  type GalleryGroup,
  type GalleryGroupBy,
  type GalleryParentKind,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { MEDIA_NAV_KEY, type MediaType } from '@/lib/media'
import type { PhotoAction } from '@/lib/photoActions'
import { sectionGalleryGroups, sortGalleryGroups } from '@/lib/galleryGroups'
import { useContentLang } from '@/lib/settings'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { PhotoStack } from '@/components/ui/photo-stack'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { GroupPhotos } from '@/components/gallery/GroupPhotos'
import { EMPTY_GROUP_FILTERS, GroupFilters, type GroupFilterState } from '@/components/gallery/GroupFilters'
import { WebImageDialog } from '@/components/WebImageDialog'
import { WebVideoDialog } from '@/components/WebVideoDialog'

/* ============================================================
   ჯგუფების ჭრილი — **ერთი კომპონენტი ოთხივესთვის** (§8.5).

   `record` · `actor` · `source` (რომელი დომენიდან) · `provider` (რომელმა
   წყარომ მოიტანა). ოთხივე ერთსა და იმავე endpoint-ს ეკითხება და ერთსა და
   იმავე დასტად იხატება — განსხვავება მხოლოდ ფილტრებსა და მოქმედებებშია.

   ⚠️ **ჩამოტვირთვა ჯგუფშივეა** (§8.5): „მასობრივი ჩამოტვირთვის" ბლოკი
   იმიტომ იყო ცუდი, რომ სკოუპს ხელახლა ალაგებინებდა იქ, სადაც ის უკვე
   ცნობილია — ჯგუფის ბარათზე კონტექსტი უკვე არსებობს.

   ⚠️ **ვებძებნა მხოლოდ იქ, სადაც მიბმის მისამართია** — „წყაროს" და
   „მომწოდებლის" ჯგუფი დომენია და არა ერთეული, ე.ი. ფოტოს მიბმა არსად აქვს.

   ## ეტაპი 2
   ⚠️ **დომენის ტაბი აქ არ არის — ის `RecordsCut`-შია.** ამ კომპონენტს
   `type`/`from` **პროპად** მოსდის, რომ იგივე სია მსახიობების ცალკე ჭრილმაც
   გამოიყენოს (იქ ტაბი არ არის) და ორი ასლი არ გაჩნდეს.

   ⚠️ **დალაგება და სექციებად დაყოფა ფრონტზეა** (`lib/galleryGroups.ts`):
   ორივე ეკრანზე დაწერილ სახელს ეყრდნობა (`contentLang`), რომელსაც სერვერი
   ვერ იცნობს.

   ## 2026-09-13-ის ნაკრები, ეტაპი 2
   ⚠️ **ბარათის მოქმედებები ერთი სიაა** (`groupActions()`): ქვედა ზოლის
   ღილაკებიც და **მარჯვენა კლიკის მენიუც** აქედან იხატება. ორი ასლი
   აუცილებლად გაშორდებოდა — ერთში „წაშლა" იქნებოდა, მეორეში არა.
   ============================================================ */

/** ერთ წრეზე რამდენი ფოტო წაიშალოს — ჯგუფი 1000-ზე დიდიც შეიძლება იყოს */
const DELETE_CHUNK = 200

/** ⚠️ უსასრულო ციკლის დამცავი: თუ წაშლა ჩუმად ვერ ხერხდება, ვჩერდებით */
const DELETE_MAX_ROUNDS = 50

export function GroupsCut({
  by,
  type,
  from,
  domains,
  onDownloadRecord,
  onDownloadActor,
}: {
  by: Extract<GalleryGroupBy, 'record' | 'actor' | 'source' | 'provider'>
  /** ჩანაწერების ჭრილის დომენის ტაბი */
  type?: GalleryParentKind
  /** მსახიობების ჭრილის დომენის ტაბი — ვინც ამ დომენში თამაშობს */
  from?: MediaType
  /** რომელი დომენების ჟანრი/სტატუსი ივარგებს ფილტრში */
  domains?: GalleryParentKind[]
  /** ჩანაწერზე ჩამოტვირთვა — დიალოგს გვერდი ხსნის (სკოუპი უკვე ცნობილია) */
  onDownloadRecord?: (group: GalleryGroup) => void
  /** მსახიობზე ჩამოტვირთვა პარამეტრებით */
  onDownloadActor?: (group: GalleryGroup) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()

  const [filters, setFilters] = useState<GroupFilterState>(EMPTY_GROUP_FILTERS)
  const [gender, setGender] = useState<'all' | 'female' | 'male'>('all')
  const [open, setOpen] = useState<GalleryGroup | null>(null)
  const [webOn, setWebOn] = useState<GalleryGroup | null>(null)
  const [videoOn, setVideoOn] = useState<GalleryGroup | null>(null)

  /* ⚠️ სერვერს მხოლოდ ის მიაქვს, რაც **სიას ჭრის**; დალაგება და სექციები
     ქვემოთ, უკვე ჩამოტვირთულ სიაზე კეთდება — ე.ი. მათი შეცვლა ახალ
     მოთხოვნას არ იწვევს. */
  const query = {
    type: by === 'record' ? type : undefined,
    from: by === 'actor' ? from : undefined,
    q: filters.q.trim() || undefined,
    gender: by === 'actor' && gender !== 'all' ? gender : undefined,
    have: by === 'record' ? filters.have : undefined,
    genre: by === 'record' && filters.genre ? filters.genre : undefined,
    status: by === 'record' && filters.status ? filters.status : undefined,
    favorite: by === 'record' && filters.favorite ? true : undefined,
    year_min: by === 'record' && filters.yearMin ? Number(filters.yearMin) : undefined,
    year_max: by === 'record' && filters.yearMax ? Number(filters.yearMax) : undefined,
    previews: 5,
  } as const

  const groupsQ = useQuery({
    queryKey: ['gallery-groups', by, query],
    queryFn: () => fetchGalleryGroups(by, query),
  })

  /** მსახიობზე ჩამოტვირთვა პირდაპირ ერთი გამოძახებაა (ნაგულისხმევი პარამეტრებით) */
  const quickActor = useMutation({
    mutationFn: (id: number) => fetchActorGalleryImages(id),
    onSuccess: (result) => {
      ;['gallery-photos', 'gallery-groups', 'gallery-summary'].forEach((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({
        title: result.added ? t('gallery.fetchedCount', { count: result.added }) : t('gallery.actorNothingNew'),
        variant: result.added ? 'success' : 'info',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const titleOf = (group: GalleryGroup) => {
    if (group.from) return t(MEDIA_NAV_KEY[group.from])
    if (group.provider) return t(`photos.source.${group.provider}`, group.provider)
    return (lang === 'ka' ? group.title_ka || group.title : group.title || group.title_ka) || `#${group.id}`
  }

  /** ჯგუფის შიგნით შესვლა — ორი მისამართი, ერთი ფორმა */
  const filtersFor = (group: GalleryGroup) => {
    if (group.from) return { from: group.from }
    if (group.provider) return { provider: group.provider }
    return { owner: `${group.kind === 'actor' ? 'actor' : group.kind}:${group.id}` }
  }

  const keyFor = (group: GalleryGroup) =>
    group.from ? `from:${group.from}` : group.provider ? `provider:${group.provider}` : `${group.kind}:${group.id}`

  /**
   * ჯგუფის **ყველა** ფოტოს წაშლა (ეტაპი 2).
   *
   * ⚠️ **ერთიანი endpoint არ არსებობს** — `DELETE /gallery/images/{id}` თითოზეა,
   * ე.ი. სია გვერდ-გვერდ იკითხება და თითოეული იშლება. ყოველ წრეზე **პირველივე
   * გვერდი** მოგვაქვს ხელახლა, რადგან წინა წრემ ის უკვე წაშალა.
   *
   * ⚠️ **დადასტურება დათვლილია** (`group.photos`) — „წყაროს"/„მომწოდებლის"
   * ჭრილში ჯგუფი მთელი დომენია და რიცხვის დანახვის გარეშე ეს მოქმედება
   * ბრმა იქნებოდა.
   */
  const removeGroup = useMutation({
    mutationFn: async (group: GalleryGroup) => {
      let removed = 0

      for (let round = 0; round < DELETE_MAX_ROUNDS; round++) {
        const page = await fetchGalleryPhotos({ ...filtersFor(group), per_page: DELETE_CHUNK })
        if (!page.data.length) break

        for (const image of page.data) {
          await deleteGalleryImage(image.id)
          removed++
        }
      }

      return removed
    },
    onSuccess: (removed) => {
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'storage', 'me'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({ title: t('gallery.groupDeleted', { count: removed }), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /**
   * ბარათის მოქმედებები — **ერთი სია ღილაკებისთვისაც და მენიუსთვისაც**.
   *
   * ⚠️ **პუნქტი, რომელიც ვერ იმუშავებს, საერთოდ არ იხატება**: „წყაროს" და
   * „მომწოდებლის" ჯგუფი დომენია და არა ერთეული, ე.ი. არც მისი გვერდი
   * არსებობს და არც ფოტოს მიბმის მისამართი (ვებძებნა).
   */
  const groupActions = (group: GalleryGroup): PhotoAction[] => {
    const isActor = group.kind === 'actor'
    const isRecord = !group.from && !group.provider && !isActor

    const list: PhotoAction[] = [
      { key: 'open', label: t('gallery.openGroup'), icon: Maximize2, run: () => setOpen(group) },
    ]

    if (group.has_tmdb) {
      list.push({
        key: 'fetch',
        label: t('gallery.fetch'),
        icon: DownloadCloud,
        quick: true,
        run: () =>
          isActor
            ? onDownloadActor
              ? onDownloadActor(group)
              : quickActor.mutate(group.id)
            : onDownloadRecord?.(group),
      })
    }

    if (isActor) {
      list.push({
        key: 'actorPage',
        label: t('gallery.actorPage'),
        icon: User,
        run: () => navigate(`/actors/${group.id}`),
      })
    }

    if (isRecord) {
      list.push({
        key: 'record',
        label: t('gallery.openRecord'),
        icon: Images,
        /* ⚠️ სათაური **state-ით** მიჰყვება — არა-მედია მშობელს დეტალის
           endpoint არ აქვს (იხ. ჯგუფის შიგნითა ზოლი ქვემოთ) */
        run: () =>
          navigate(`/gallery/records/${group.kind}/${group.id}`, { state: { title: titleOf(group) } }),
      })
    }

    if (isActor || isRecord) {
      list.push(
        { key: 'web', label: t('web.searchPhotos'), icon: Globe, run: () => setWebOn(group) },
        { key: 'webVideo', label: t('web.searchVideos'), icon: Video, run: () => setVideoOn(group) },
      )
    }

    if (group.photos > 0) {
      list.push({
        key: 'delete',
        label: t('gallery.deleteGroup', { count: group.photos }),
        icon: Trash2,
        danger: true,
        run: async () => {
          const ok = await confirm({
            title: t('gallery.deleteGroupTitle'),
            description: t('gallery.deleteGroupHint', {
              count: group.photos,
              name: titleOf(group),
            }),
            confirmText: t('confirm.delete'),
            variant: 'destructive',
          })
          if (ok) removeGroup.mutate(group)
        },
      })
    }

    return list
  }

  const groups = useMemo(
    () => sortGalleryGroups(groupsQ.data?.groups ?? [], filters.sort, titleOf, lang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupsQ.data, filters.sort, lang],
  )

  const sections = useMemo(
    () => sectionGalleryGroups(groups, by === 'record' ? filters.section : 'none', lang, t('gallery.unknownSection')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, filters.section, by, lang],
  )

  /**
   * ვებძებნის ორი დიალოგი (ეტაპი 3, **ცოცხალი ხარვეზის შესწორება**).
   *
   * ⚠️ **ორივე შტოში უნდა დაიხატოს.** ისინი ადრე მხოლოდ ჯგუფების **სიის**
   * დაბრუნებაში იდო, ღილაკები კი — გახსნილი ჯგუფის შტოში, რომელიც `if (open)`-ით
   * **ადრე ბრუნდება**. ე.ი. მსახიობის (ან ჩანაწერის) ჯგუფში შესვლისას
   * „ფოტოები ვებიდან"/„ვიდეოს ძებნა" `state`-ს ცვლიდა და **არაფერი ხდებოდა** —
   * ზუსტად ის, რაზეც მითითება იყო: „არ იხსნება, არაფერი".
   */
  const dialogs = (
    <>
      {webOn && (
        <WebImageDialog
          target={webOn.kind === 'actor' ? 'cast_member' : (webOn.kind as 'movie')}
          id={webOn.id}
          initialQuery={titleOf(webOn)}
          title={t('web.searchPhotosFor', { name: titleOf(webOn) })}
          context={{ base: titleOf(webOn), attachesTo: titleOf(webOn) }}
          onClose={() => setWebOn(null)}
          onImported={() => {
            ;['gallery-photos', 'gallery-groups', 'gallery-summary'].forEach((key) =>
              qc.invalidateQueries({ queryKey: [key] }),
            )
          }}
        />
      )}

      {videoOn && (
        <WebVideoDialog
          target={videoOn.kind === 'actor' ? 'cast_member' : (videoOn.kind as 'movie')}
          id={videoOn.id}
          initialQuery={titleOf(videoOn)}
          title={t('web.searchVideosFor', { name: titleOf(videoOn) })}
          onClose={() => setVideoOn(null)}
        />
      )}
    </>
  )

  if (open) {
    const isActor = open.kind === 'actor'
    const isRecord = !open.from && !open.provider && !isActor

    const inner = (
      <GroupPhotos
        title={titleOf(open)}
        subtitle={t('gallery.photos', { count: open.photos })}
        filters={filtersFor(open)}
        cacheKey={keyFor(open)}
        onBack={() => setOpen(null)}
        showOwner={!!open.from || !!open.provider}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {isActor && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/actors/${open.id}`)}>
                <User className="size-4" />
                {t('gallery.actorPage')}
              </Button>
            )}
            {/* ⚠️ სათაური **state-ით** მიჰყვება: არა-მედია მშობელს (სიმღერა ·
                წიგნი · თამაში) დეტალის endpoint არ აქვს, ე.ი. ის გვერდი მის
                სახელს სხვაგვარად ვერ გაიგებდა და ვებძებნა ცარიელი ველით
                გაიხსნებოდა. */}
            {isRecord && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/gallery/records/${open.kind}/${open.id}`, {
                    state: { title: titleOf(open) },
                  })
                }
              >
                <Images className="size-4" />
                {t('gallery.openRecord')}
              </Button>
            )}
            {open.has_tmdb && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isActor ? onDownloadActor?.(open) : onDownloadRecord?.(open))}
              >
                <DownloadCloud className="size-4" />
                {t('gallery.fetchMore')}
              </Button>
            )}
            {(isActor || isRecord) && (
              <>
                <Button variant="outline" size="sm" onClick={() => setWebOn(open)}>
                  <Globe className="size-4" />
                  {t('web.searchPhotos')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setVideoOn(open)}>
                  <Video className="size-4" />
                  {t('web.searchVideos')}
                </Button>
              </>
            )}
          </div>
        }
      />
    )

    return (
      <>
        {inner}
        {dialogs}
      </>
    )
  }

  const card = (group: GalleryGroup) => {
    const actions = groupActions(group)
    const quick = actions.filter((action) => action.quick)
    /** მიმდინარე წაშლა/ჩამოტვირთვა — ორმაგი დაჭერა ორ გაშვებას ნიშნავდა */
    const busy =
      (quickActor.isPending && quickActor.variables === group.id) ||
      (removeGroup.isPending && removeGroup.variables === group)

    return (
      <li key={keyFor(group)}>
        <PhotoStack
          title={titleOf(group)}
          subtitle={by === 'record' && lang === 'ka' && group.title && group.title_ka ? group.title : undefined}
          label={`${t('gallery.photos', { count: group.photos })} · ${formatBytes(group.bytes)}`}
          count={group.photos}
          images={groupsQ.data?.previews[keyFor(group)] ?? []}
          aspect={by === 'actor' ? 'portrait' : 'wide'}
          onClick={() => setOpen(group)}
          actions={
            quick.length ? (
              <>
                {quick.map((action) => (
                  <Button
                    key={action.key}
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={action.run}
                  >
                    <action.icon className="size-3.5" />
                    {action.label}
                  </Button>
                ))}
              </>
            ) : undefined
          }
          menu={actions.map((action) => (
            <Fragment key={action.key}>
              {action.danger && <ContextMenuSeparator />}
              <ContextMenuItem
                onSelect={action.run}
                disabled={busy}
                className={action.danger ? 'text-destructive focus:bg-destructive/10' : undefined}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        />
      </li>
    )
  }

  const grid = (items: GalleryGroup[]) => (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map(card)}</ul>
  )

  return (
    <>
      <section>
        {/* ⚠️ „წყაროს"/„მომწოდებლის" ჭრილში ჯგუფი **დომენია** — იქ არც ძებნას
            აქვს აზრი და არც ჟანრს, ამიტომ ფილტრის ზოლი მხოლოდ ორ ჭრილშია */}
        {(by === 'record' || by === 'actor') && (
          <GroupFilters
            value={filters}
            onChange={setFilters}
            domains={by === 'record' ? (domains ?? (type ? [type] : [])) : []}
            showHave={by === 'record'}
            /* მსახიობს არც წელი აქვს და არც ჟანრი — ის ორი პუნქტი აქ
               ჩუმად არაფერს გააკეთებდა */
            sorts={by === 'actor' ? ['photos', 'photos_asc', 'title', 'bytes'] : undefined}
            showSections={by === 'record'}
            extra={
              by === 'actor' ? (
                /* §3.2 — „ქალი/კაცი" ჭრილი; სქესი TMDB-დან მოდის და ძველ ჩანაწერებზე ცარიელია */
                <ChipRow>
                  {(['all', 'female', 'male'] as const).map((key) => (
                    <Chip key={key} active={gender === key} onClick={() => setGender(key)}>
                      {key === 'all' ? t('filter.all') : t(`gallery.cast.${key}`)}
                    </Chip>
                  ))}
                </ChipRow>
              ) : undefined
            }
          />
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {by === 'source' && <p className="text-xs text-muted-foreground">{t('gallery.bySourceHint')}</p>}
          {by === 'provider' && <p className="text-xs text-muted-foreground">{t('gallery.byProviderHint')}</p>}
          <span className="ml-auto text-xs text-muted-foreground">
            {t('gallery.groupCount', { count: groups.length })}
          </span>
        </div>

        {groupsQ.isLoading ? (
          <GalleryStackSkeleton />
        ) : !groups.length ? (
          <EmptyState
            icon={<Images className="size-6" />}
            title={filters.have === 'without' ? t('gallery.allHavePhotos') : t('gallery.noPhotosYet')}
            hint={filters.q ? t('gallery.emptyFiltered') : t('gallery.emptyHint')}
          />
        ) : sections.length ? (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.key || 'unknown'}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {section.label}
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {section.groups.length}
                  </span>
                </h3>
                {grid(section.groups)}
              </div>
            ))}
          </div>
        ) : (
          grid(groups)
        )}
      </section>

      {dialogs}
    </>
  )
}

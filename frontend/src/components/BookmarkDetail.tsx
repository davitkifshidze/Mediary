import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Globe, Plus, SquarePen, Trash2 } from 'lucide-react'
import {
  deleteBookmarkFile,
  fetchBookmarkFiles,
  markBookmarkVisited,
  setBookmarkLinks,
  setBookmarkStatus,
  toggleBookmarkFavorite,
  uploadBookmarkFiles,
  type Bookmark,
} from '@/api/bookmarks'
import { useRecordOpen } from '@/lib/audit'
import { storageUrl } from '@/lib/api'
import { BOOKMARK_WEB_TERMS, useBookmarkRefresh } from '@/lib/bookmarks'
import { copyText } from '@/lib/clipboard'
import { useDateFormat } from '@/lib/dates'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { useStatuses } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { BookmarkLinkCards, BookmarkLinkDialog } from '@/components/BookmarkLinks'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { ModuleIcon } from '@/components/ModuleIcon'
import { RecordGallery } from '@/components/RecordGallery'
import { StatusBadge } from '@/components/StatusBadge'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Badge } from '@/components/ui/badge'
import { Markdown } from '@/components/ui/markdown'
import { Button, buttonVariants } from '@/components/ui/button'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { ModalShell } from '@/components/ui/modal-shell'
import { favoriteAction, MENU_ICONS, RecordContextMenu, statusActions, type MenuAction } from '@/components/ui/record-menu'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ბუკმარკის დეტალის ფანჯარა**.

   შენი სიტყვები: „ბუკმარკს რომ დააჭერ, პირდაპირ კი არ ილინკებოდეს —
   იხსნებოდეს მოდალი: ინფო, რა არის დამატებული; შიგნით ჰქონდეს გალინკვის
   ღილაკი. ასევე შეიძლებოდეს ბუკმარკზე დაამატო გალერეა, ან, თუ შოპინგია ან
   რამე ისეთი, კონკრეტული ლინკის დამატებაც იყოს დამატებით".

   რიგი ყველა დეტალის ფანჯრის საერთოა (`DetailHero`): თავში მთავარი ფოტო, სტატუსი, კატეგორია და
   ცნობები (დამატების თარიღი, გახსნები და ბოლო გახსნა, შესვლები) და
   მოქმედებები — „ბმულის გახსნა" (იგივე `visited` მთვლელით), „კოპირება",
   „რედაქტირება", „წაშლა"; მერე აღწერა და ტეგები, ბმულები ბარათებად და
   გალერეა — ორი საცავი ერთ ხედად: ჩემი ატვირთული (`bookmark_files`)
   და ვებიდან ჩამოტვირთული (`gallery_images`, გალერეის მოდული).
   ============================================================ */

export function BookmarkDetail({
  bookmark,
  focus,
  onClose,
  onEdit,
  onDelete,
}: {
  bookmark: Bookmark
  /** `gallery` — ფანჯარა გალერეის სექციაზე იხსნება (მენიუს „გალერეა", რიგის „ფაილები") */
  focus?: 'gallery'
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()
  // გახსნა ჟურნალში (ადრე „შევედი N-ჯერ" ბეჯი)
  useRecordOpen('bookmark', bookmark.id)
  const lang = useContentLang(i18n.language)
  // ვებძებნის ჩიპები შინაარსის ენაზე და არა ინტერფეისისაზე
  const fixedT = i18n.getFixedT(lang)
  const { date: formatDate, dateTime } = useDateFormat()
  const { toast } = useToast()
  const refresh = useBookmarkRefresh()
  const { data: statuses = [] } = useStatuses('bookmark')
  /** ბმულის ფანჯარა: `'new'` — დამატება, რიცხვი — სიაში ამ ადგილის რედაქტირება */
  const [linkEdit, setLinkEdit] = useState<number | 'new' | null>(null)
  const gallery = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // ⚠️ jsdom-ს `scrollIntoView` არ აქვს — გამოძახება პირობითია
    if (focus === 'gallery') gallery.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [focus])

  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })
  const favorite = useMutation({ mutationFn: () => toggleBookmarkFavorite(bookmark.id), onSuccess: refresh, onError: fail })
  const status = useMutation({
    mutationFn: (key: string) => setBookmarkStatus(bookmark.id, key),
    onSuccess: refresh,
    onError: fail,
  })
  /* ბარათის მენიუს „მოხსნა" — სია მთლიანად იგზავნება (სერვერზე `links` ერთი სვეტია) */
  const removeLink = useMutation({
    mutationFn: (index: number) => setBookmarkLinks(bookmark.id, (bookmark.links ?? []).filter((_, i) => i !== index)),
    onSuccess: () => {
      refresh()
      toast({ title: t('bookmarks.linkRemoved'), variant: 'success' })
    },
    onError: fail,
  })
  /* „გახსნის" მთვლელის ჩავარდნა ჩუმად არ იკარგება (სიის იგივე წესი) */
  const visited = useMutation({ mutationFn: () => markBookmarkVisited(bookmark.id), onSuccess: refresh, onError: fail })

  const openLink = () => {
    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    visited.mutate()
  }

  const copy = async () => {
    const ok = await copyText(bookmark.url)
    toast({ title: t(ok ? 'bookmarks.linkCopied' : 'bookmarks.copyFailed'), variant: ok ? 'success' : 'error' })
  }

  /* მარჯვენა კლიკი თავზე: ბმული · სტატუსი ▸ · რჩეული · ბმულის დამატება · — · რედაქტირება · წაშლა */
  const heroActions: MenuAction[] = [
    { key: 'link', label: t('actions.openLink'), icon: MENU_ICONS.link, run: openLink },
    statusActions(t('bookmarks.status'), statuses, bookmark.status, lang, (key) => status.mutate(key)),
    favoriteAction(bookmark.is_favorite, () => favorite.mutate(), t),
    { key: 'add-link', label: t('bookmarks.addLink'), icon: Plus, run: () => setLinkEdit('new') },
    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: onEdit },
    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: onDelete },
  ]

  const image = storageUrl(bookmark.image)

  return (
    <ModalShell title={bookmark.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6" data-testid="bookmark-detail">
        {/* ---------- თავი: მთავარი ფოტო, სტატუსი, კატეგორია, ცნობები, მოქმედებები ---------- */}
        <RecordContextMenu actions={heroActions}>
          <DetailHero
            image={image}
            alt={bookmark.title}
            shape="wide"
            fallback={
              bookmark.favicon_url ? (
                <img src={bookmark.favicon_url} alt="" referrerPolicy="no-referrer" className="size-10" />
              ) : (
                <Globe className="size-8 text-muted-foreground" />
              )
            }
            badges={
              <>
                <StatusBadge status={bookmark.status} size="row" />
                {/* ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
                <VisibilityBadge value={bookmark.visibility} />
                <FavoriteButton active={bookmark.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
              </>
            }
          >
            {bookmark.category && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                  <ModuleIcon name={bookmark.category.icon} className="size-3" />
                  {dictionaryName(bookmark.category, lang)}
                </span>
              </div>
            )}
            <DetailFacts>
              {bookmark.domain && (
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  {bookmark.favicon_url ? (
                    <img src={bookmark.favicon_url} alt="" referrerPolicy="no-referrer" className="size-4" />
                  ) : (
                    <Globe className="size-4" />
                  )}
                  {bookmark.domain}
                </span>
              )}
              {bookmark.created_at && <span>{t('bookmarks.addedOn', { date: formatDate(bookmark.created_at) })}</span>}
              {/* „გახსნა" — ბმულზე გასვლა (`visit_count`); „შევედი" ზემოთაა — ფანჯრის გახსნა */}
              <span>{t('bookmarks.visits', { count: bookmark.visit_count })}</span>
              {bookmark.visited_at && (
                <span>{t('bookmarks.lastOpened', { date: dateTime(bookmark.visited_at) })}</span>
              )}
            </DetailFacts>

            {/* ბმული **ფანჯრის შიგნითაა** და იმავე მთვლელს ზრდის */}
            <div className="flex flex-wrap items-center gap-2 pt-1" data-testid="bookmark-actions">
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => visited.mutate()}
                className={cn(buttonVariants({ size: 'sm' }))}
                data-testid="bookmark-open-link"
              >
                <ExternalLink className="size-3.5" />
                {t('actions.openLink')}
              </a>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
                <Copy className="size-3.5" />
                {t('actions.copy')}
              </Button>
              <Button type="button" variant="edit" size="sm" onClick={onEdit}>
                <SquarePen className="size-3.5" />
                {t('actions.edit')}
              </Button>
              <Button type="button" variant="destructiveOutline" size="sm" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                {t('actions.delete')}
              </Button>
            </div>
          </DetailHero>
        </RecordContextMenu>

        {bookmark.description && (
          <Markdown text={bookmark.description} className="text-sm text-muted-foreground" />
        )}

        {bookmark.tags.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {bookmark.tags.map((tag) => (
              <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                #{tag}
              </span>
            ))}
          </p>
        )}

        {/* ---------- დამატებითი ბმულები ბარათებად ---------- */}
        <DetailSection
          title={t('bookmarks.linksTitle')}
          hint={t('bookmarks.linksHint')}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setLinkEdit('new')}>
              <Plus className="size-3.5" />
              {t('bookmarks.addLink')}
            </Button>
          }
        >
          <BookmarkLinkCards links={bookmark.links ?? []} onEdit={setLinkEdit} onRemove={(index) => removeLink.mutate(index)} />
        </DetailSection>

        {/* ---------- გალერეა: ორი საცავი ერთ ხედად ---------- */}
        <div ref={gallery} data-testid="bookmark-gallery">
          <DetailSection title={t('bookmarks.galleryTitle')} hint={t('bookmarks.galleryHint')}>
            <div className="space-y-6">
              <Photos bookmark={bookmark} />
              <RecordGallery
                type="bookmark"
                id={bookmark.id}
                bare
                query={[bookmark.title, bookmark.domain].filter(Boolean).join(' ')}
                terms={BOOKMARK_WEB_TERMS.map((key) => fixedT(`bookmarks.webChips.${key}`))}
              />
            </div>
          </DetailSection>
        </div>
      </div>

      {linkEdit !== null && (
        <BookmarkLinkDialog bookmark={bookmark} edit={linkEdit === 'new' ? undefined : linkEdit} onClose={() => setLinkEdit(null)} />
      )}
    </ModalShell>
  )
}

/* ---------- ჩემი ფოტოები (`bookmark_files`) ---------- */

function Photos({ bookmark }: { bookmark: Bookmark }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const refresh = useBookmarkRefresh()
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['bookmark-files', bookmark.id],
    queryFn: () => fetchBookmarkFiles(bookmark.id),
  })

  // ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['bookmark-files', bookmark.id] })
    void qc.invalidateQueries({ queryKey: ['storage'] })
    void qc.invalidateQueries({ queryKey: ['me'] })
    refresh()
  }

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadBookmarkFiles(bookmark.id, picked),
    onSuccess: done,
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deleteBookmarkFile, onSuccess: done, onError: fail })

  return (
    <DetailPhotos
      /* ორი საცავი ერთ ხედად: ეს ბლოკი „ატვირთულია", ქვემოთ — „ვებიდან" */
      title={
        <span className="inline-flex items-center gap-2">
          {t('bookmarks.photosTitle')}
          <Badge className="bg-secondary text-secondary-foreground">{t('gallery.uploadedBadge')}</Badge>
        </span>
      }
      hint={t('bookmarks.photosHint')}
      items={files.map((file) => ({ id: file.id, src: file.path, title: file.original_name }))}
      loading={isLoading}
      uploading={upload.isPending}
      onUpload={(picked) => upload.mutate(picked)}
      onDelete={(id) => remove.mutate(id)}
      uploadLabel={t('bookmarks.addPhotos')}
      emptyTitle={t('bookmarks.photosEmpty')}
      deleteTitle={t('bookmarks.photoDeleteTitle')}
    />
  )
}

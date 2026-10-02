import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Image as ImageIcon, Loader2, Map as MapIcon, MapPin, Upload } from 'lucide-react'
import {
  PLACE_FILE_KINDS,
  deletePlaceFile,
  fetchPlaceFiles,
  uploadPlaceFiles,
  type Place,
  type PlaceFile,
  type PlaceFileKind,
  togglePlaceFavorite,
} from '@/api/places'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { useDateFormat } from '@/lib/dates'
import { formatBytes } from '@/lib/utils'
import { FileViewer, type ViewableFile } from '@/components/FileViewer'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { RatingStars } from '@/components/ui/star-rating'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitBadge } from '@/components/RecordVisits'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { DetailFacts, DetailHero, DetailPhotos } from '@/components/DetailHero'
import { ModuleIcon } from '@/components/ModuleIcon'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'

/**
 * **ადგილის ბარათი (FEAT-26).**
 *
 * ⚠️ **რუკა თვითონ არ იხატება** და ეს ტასქის საკუთარი სიტყვაა
 * („მოგვიანებით"): Leaflet ~40 kB-ია და ცალკე გადაწყვეტილებას იმსახურებს.
 * კოორდინატი ინახება და გარე რუკის ბმულად ჩანს — ე.ი. ფაქტი არ იკარგება
 * და ბიბლიოთეკა არ ემატება.
 *
 * ⚠️ **ვებიდან მოტანილი ფოტო აქ არ ჩანს** — ის `gallery_images`-შია და
 * გალერეის სექციაში იხატება. აქ მხოლოდ ჩემი ატვირთვებია (`place_files`),
 * ზუსტად ის განაწილება, რაც ვიდეოსა და სამაგიდო თამაშს აქვს.
 */
const KIND_ICON: Record<PlaceFileKind, typeof MapPin> = {
  image: ImageIcon,
  doc: FileText,
}

export function PlaceDetail({ place, onClose }: { place: Place; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { date: formatDate } = useDateFormat()
  const qc = useQueryClient()
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const favorite = useMutation({
    mutationFn: () => togglePlaceFavorite(place.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['places'] }),
  })
  const { toast } = useToast()
  const confirm = useConfirm()

  const [viewing, setViewing] = useState<ViewableFile | null>(null)
  const inputs = useRef<Partial<Record<PlaceFileKind, HTMLInputElement | null>>>({})

  const filesQ = useQuery({
    queryKey: ['place-files', place.id],
    queryFn: () => fetchPlaceFiles(place.id),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['place-files', place.id] })
    qc.invalidateQueries({ queryKey: ['places'] })
  }

  const upload = useMutation({
    mutationFn: ({ kind, files }: { kind: PlaceFileKind; files: File[] }) =>
      uploadPlaceFiles(place.id, kind, files),
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: deletePlaceFile,
    onSuccess: () => {
      invalidate()
      setViewing(null)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const files = filesQ.data ?? []
  const images = files.filter((f) => f.kind === 'image')

  const section = (kind: PlaceFileKind) => {
    const rows = files.filter((f) => f.kind === kind)
    const Icon = KIND_ICON[kind]

    return (
      <section key={kind}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="size-4 text-muted-foreground" />
            {t(`places.fileKinds.${kind}`)}
            {kind === 'image' && <InfoHint info={t('places.photosHint')} />}
          </h3>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputs.current[kind]?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t('actions.upload')}
          </Button>

          <input
            ref={(el) => {
              inputs.current[kind] = el
            }}
            type="file"
            multiple
            className="hidden"
            accept={kind === 'image' ? 'image/*' : undefined}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              if (picked.length) upload.mutate({ kind, files: picked })
              e.target.value = ''
            }}
          />
        </div>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {t('places.noFiles')}
          </p>
        ) : (
          <ul className="space-y-1">
            {rows.map((f: PlaceFile) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  onClick={() =>
                    setViewing({
                      id: f.id,
                      url: storageUrl(f.path) ?? f.url,
                      name: f.original_name,
                      mime: f.mime,
                      size: f.size,
                    })
                  }
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{f.original_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <ModalShell title={place.name} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* ---------- თავი: ფოტო, სტატუსი, ქულა, მისამართი (§26.4) ---------- */}
        <DetailHero
          image={storageUrl(place.photo)}
          alt={place.name}
          shape="wide"
          fallback={<MapPin className="size-8 text-muted-foreground" />}
          badges={
            <>
              <EnumStatusBadge domain="place" status={place.status} />
              {/* Tasks §9 — ვარსკვლავები და „4.6 / 10" დეტალის თავში */}
              <RatingStars value={place.rating} />
              {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={place.visibility} />
              {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი */}
              <VisitBadge type="place" id={place.id} />
              <FavoriteButton size="xs" active={place.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
            </>
          }
        >
          {place.category && (
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                <ModuleIcon name={place.category.icon} className="size-3" />
                {dictionaryName(place.category, lang)}
              </span>
            </div>
          )}
          <DetailFacts>
            {(place.address || place.city || place.country) && (
              <span className="inline-flex items-start gap-1.5">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {place.address ?? [place.city, place.country].filter(Boolean).join(', ')}
              </span>
            )}
            {place.visited_at && <span>{t('places.visitedOn', { date: formatDate(place.visited_at) })}</span>}
          </DetailFacts>
        </DetailHero>

        {/* ---------- ფოტოები — ზემოთ და დიდად (§26.4) ---------- */}
        <DetailPhotos
          title={t('places.fileKinds.image')}
          hint={t('places.photosHint')}
          items={images.map((f) => ({ id: f.id, src: f.path, title: f.original_name }))}
          loading={filesQ.isLoading}
          uploading={upload.isPending}
          onUpload={(picked) => upload.mutate({ kind: 'image', files: picked })}
          onDelete={(id) => remove.mutate(id)}
          uploadLabel={t('places.addPhotos')}
          emptyTitle={t('places.photosEmpty')}
          deleteTitle={t('places.photoDeleteTitle')}
        />

        {place.description && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{place.description}</p>
        )}

        {/* ⚠️ `<a>` და არა `Button asChild` — `ui/button.tsx`-ს `asChild` არ აქვს.
            რუკა გარე სერვისია: ბიბლიოთეკა არ ემატება, ფაქტი კი არ იკარგება. */}
        {place.map_url && (
          <a
            href={place.map_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <MapIcon className="size-4" />
            {t('places.openMap')}
            <span className="text-xs tabular-nums text-muted-foreground">
              {place.lat}, {place.lng}
            </span>
          </a>
        )}

        {/* დოკუმენტები — ფოტოები ზემოთაა (§26.4) */}
        {filesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
        ) : (
          <div className="space-y-5">{PLACE_FILE_KINDS.filter((kind) => kind !== 'image').map(section)}</div>
        )}
      </div>

      {viewing && (
        <FileViewer
          file={viewing}
          onClose={() => setViewing(null)}
          onDelete={async () => {
            if (
              await confirm({
                title: t('actions.delete'),
                description: t('places.deleteFileHint', { name: viewing.name }),
                variant: 'destructive',
              })
            ) {
              remove.mutate(viewing.id)
            }
          }}
        />
      )}
    </ModalShell>
  )
}

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
} from '@/api/places'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { useDateFormat } from '@/lib/dates'
import { formatBytes } from '@/lib/utils'
import { FileViewer, type ViewableFile } from '@/components/FileViewer'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'

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
  const { t } = useTranslation()
  const { date: formatDate } = useDateFormat()
  const qc = useQueryClient()
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-secondary">{t(`places.statuses.${place.status}`)}</Badge>
            {place.rating && <Badge className="bg-secondary">★ {place.rating}</Badge>}
            {place.visited_at && (
              <span className="text-sm text-muted-foreground">
                {t('places.visitedOn', { date: formatDate(place.visited_at) })}
              </span>
            )}
          </div>
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={place.visibility} />
        </div>

        {(place.address || place.city || place.country) && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <span>{place.address ?? [place.city, place.country].filter(Boolean).join(', ')}</span>
          </p>
        )}

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

        {filesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
        ) : (
          <div className="space-y-5">{PLACE_FILE_KINDS.map(section)}</div>
        )}

        {!filesQ.isLoading && files.length === 0 && (
          <EmptyState
            icon={<ImageIcon className="size-6" />}
            title={t('places.noFilesTitle')}
            hint={t('places.photosHint')}
          />
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

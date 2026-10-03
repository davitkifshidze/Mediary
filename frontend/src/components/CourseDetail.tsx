import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, ExternalLink, FileText, GraduationCap, Image as ImageIcon, Loader2, Upload } from 'lucide-react'
import {
  COURSE_FILE_KINDS,
  deleteCourseFile,
  fetchCourseFiles,
  uploadCourseFiles,
  type Course,
  type CourseFile,
  type CourseFileKind,
  toggleCourseFavorite,
} from '@/api/courses'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { FileViewer, type ViewableFile } from '@/components/FileViewer'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Badge } from '@/components/ui/badge'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitBadge } from '@/components/RecordVisits'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { ModuleIcon } from '@/components/ModuleIcon'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { hostLabel, platformFromHost, platformLook } from '@/lib/platforms'
import { cn } from '@/lib/utils'

/**
 * **კურსის ბარათი (FEAT-25).**
 *
 * ⚠️ **სერტიფიკატი ცალკე ბლოკია და არა „კიდევ ერთი დოკუმენტი".** ის არის
 * ის, რისთვისაც კურსი მთავრდება — ერთ გროვაში ჩაყრილი კონსპექტებიდან
 * მისი გამორჩევა შეუძლებელი იქნებოდა.
 *
 * ⚠️ **ფაილი `FileViewer`-ით იხსნება** — ერთი მნახველი მთელ აპზე; ცალკე
 * `<a target="_blank">` ვერც PDF-ს აჩვენებდა ისე, როგორც უნდა, და ვერც
 * წაშლას შესთავაზებდა იმავე ფანჯარაში.
 */
const KIND_ICON: Record<CourseFileKind, typeof Award> = {
  certificate: Award,
  image: ImageIcon,
  doc: FileText,
}

export function CourseDetail({ course, onClose }: { course: Course; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const favorite = useMutation({
    mutationFn: () => toggleCourseFavorite(course.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['courses'] }),
  })
  const { toast } = useToast()
  const confirm = useConfirm()

  const [viewing, setViewing] = useState<ViewableFile | null>(null)
  const inputs = useRef<Partial<Record<CourseFileKind, HTMLInputElement | null>>>({})

  const filesQ = useQuery({
    queryKey: ['course-files', course.id],
    queryFn: () => fetchCourseFiles(course.id),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['course-files', course.id] })
    qc.invalidateQueries({ queryKey: ['courses'] })
  }

  const upload = useMutation({
    mutationFn: ({ kind, files }: { kind: CourseFileKind; files: File[] }) =>
      uploadCourseFiles(course.id, kind, files),
    onSuccess: invalidate,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: deleteCourseFile,
    onSuccess: () => {
      invalidate()
      setViewing(null)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const files = filesQ.data ?? []
  const images = files.filter((f) => f.kind === 'image')

  const section = (kind: CourseFileKind) => {
    const rows = files.filter((f) => f.kind === kind)
    const Icon = KIND_ICON[kind]

    /* Tasks §29.2 — ხელნაწერი `<section>` → საერთო `DetailSection` + `EmptyState`
       (ზუსტად ის, რაც წიგნის ფანჯარას აქვს) */
    return (
      <DetailSection
        key={kind}
        icon={<Icon className="size-4 text-muted-foreground" />}
        title={t(`courses.fileKinds.${kind}`)}
        hint={kind === 'certificate' ? t('courses.certificateHint') : undefined}
        action={
          <>
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
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState className="py-6" icon={<Icon className="size-5" />} title={t('courses.noFiles')} />
        ) : (
          <ul className="space-y-1">
            {rows.map((f: CourseFile) => (
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
      </DetailSection>
    )
  }

  return (
    <ModalShell title={course.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* ---------- თავი: ფოტო, სტატუსი, კატეგორია, პლატფორმა (§26.4) ---------- */}
        <DetailHero
          image={storageUrl(course.image)}
          alt={course.title}
          shape="wide"
          fallback={<GraduationCap className="size-8 text-muted-foreground" />}
          badges={
            <>
              <EnumStatusBadge domain="course" status={course.status} />
              {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={course.visibility} />
              {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი */}
              <VisitBadge type="course" id={course.id} />
              <FavoriteButton size="xs" active={course.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
            </>
          }
        >
          {course.category && (
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                <ModuleIcon name={course.category.icon} className="size-3" />
                {dictionaryName(course.category, lang)}
              </span>
            </div>
          )}
          {course.platform && (
            <DetailFacts>
              {/* §29.3 — პლატფორმა ბრენდის სახელით, აიქონითა და ფერით (§19.1-ის რუკა); უცნობი ჰოსტი ჰოსტივე */}
              <PlatformBadge host={course.platform} />
            </DetailFacts>
          )}
        </DetailHero>

        {/* ---------- ფოტოები — ზემოთ და დიდად (§26.4) ---------- */}
        <DetailPhotos
          title={t('courses.fileKinds.image')}
          items={images.map((f) => ({ id: f.id, src: f.path, title: f.original_name }))}
          loading={filesQ.isLoading}
          uploading={upload.isPending}
          onUpload={(picked) => upload.mutate({ kind: 'image', files: picked })}
          onDelete={(id) => remove.mutate(id)}
          uploadLabel={t('courses.addPhotos')}
          emptyTitle={t('courses.photosEmpty')}
          deleteTitle={t('courses.photoDeleteTitle')}
        />

        {course.description && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{course.description}</p>
        )}

        {/* §29.2 — ბმული ღილაკის ფორმით (`buttonVariants outline`), არა ხელით ნახატი `<a>`;
            `<a>` რჩება, რადგან `ui/button.tsx`-ს `asChild` არ აქვს */}
        {course.url && (
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-fit')}
          >
            <ExternalLink className="size-3.5" />
            {t('courses.open')}
          </a>
        )}

        {/* სერტიფიკატი და დოკუმენტები — ფოტოები ზემოთაა (§26.4) */}
        {filesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
        ) : (
          <div className="space-y-5">{COURSE_FILE_KINDS.filter((kind) => kind !== 'image').map(section)}</div>
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
                description: t('courses.deleteFileHint', { name: viewing.name }),
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

/** პლატფორმის ბეჯი — ცნობილზე ბრენდი (`lib/platforms`), უცნობზე ჰოსტი */
function PlatformBadge({ host }: { host: string }) {
  const { t } = useTranslation()
  const platform = platformFromHost(host)
  const look = platform ? platformLook(platform) : null
  const Icon = look?.icon

  return (
    <Badge className="bg-secondary" style={look ? { color: look.color } : undefined}>
      {Icon && <Icon className="size-3.5" />}
      {hostLabel(host, t)}
    </Badge>
  )
}

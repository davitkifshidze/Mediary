import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, ExternalLink, FileText, Image as ImageIcon, Loader2, Upload } from 'lucide-react'
import {
  COURSE_FILE_KINDS,
  deleteCourseFile,
  fetchCourseFiles,
  uploadCourseFiles,
  type Course,
  type CourseFile,
  type CourseFileKind,
} from '@/api/courses'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
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
  const { t } = useTranslation()
  const qc = useQueryClient()
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

  const section = (kind: CourseFileKind) => {
    const rows = files.filter((f) => f.kind === kind)
    const Icon = KIND_ICON[kind]

    return (
      <section key={kind}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="size-4 text-muted-foreground" />
            {t(`courses.fileKinds.${kind}`)}
            {kind === 'certificate' && <InfoHint info={t('courses.certificateHint')} />}
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
            {t('courses.noFiles')}
          </p>
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
      </section>
    )
  }

  return (
    <ModalShell title={course.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-secondary">{t(`courses.statuses.${course.status}`)}</Badge>
            {course.platform && <Badge className="bg-secondary">{course.platform}</Badge>}
            {course.instructor && (
              <span className="text-sm text-muted-foreground">{course.instructor}</span>
            )}
          </div>
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={course.visibility} />
        </div>

        {course.percent != null && (
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('courses.progress')}</span>
              <span className="tabular-nums">
                {course.lessons_done} / {course.lessons_total} · {course.percent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-secondary">
              <div className="h-full rounded-md bg-primary" style={{ width: `${course.percent}%` }} />
            </div>
          </div>
        )}

        {course.description && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{course.description}</p>
        )}

        {/* ⚠️ `<a>` და არა `Button asChild` — `ui/button.tsx`-ს `asChild` არ აქვს */}
        {course.url && (
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-4" />
            {t('courses.open')}
          </a>
        )}

        {filesQ.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
        ) : (
          <div className="space-y-5">{COURSE_FILE_KINDS.map(section)}</div>
        )}

        {!filesQ.isLoading && files.length === 0 && (
          <EmptyState
            icon={<Award className="size-6" />}
            title={t('courses.noFilesTitle')}
            hint={t('courses.certificateHint')}
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

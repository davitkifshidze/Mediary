import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Loader2 } from 'lucide-react'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { fetchVideoTypes } from '@/api/videos'
import { videoTypeName } from '@/lib/display'
import { useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { useStatuses } from '@/lib/statuses'
import { StatusLabel } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **ფლეილისტი → ვიდეოები: ტიპი და სტატუსი ერთხელ**.

   ვიდეოს ორივე სავალდებულოა, არჩეული კი შეიძლება ათეულობით იყოს — ამიტომ
   ერთი პატარა ფანჯარა ყველაზე. ბოლო არჩევანი კურსების მოდულის
   პარამეტრებშია (`module_user.settings.playlist_import`) და შემდეგ ჯერზე
   წინასწარ ივსება; ⚠️ წაშლილი ტიპი/სტატუსი ცარიელად ჩანს და ხელახლა აირჩევა.
   ============================================================ */

export interface PlaylistImportChoice {
  type_id: number
  status: string
}

const SETTING = 'playlist_import'

export function PlaylistImportDialog({
  title,
  summary,
  busy,
  confirmLabel,
  children,
  onClose,
  onConfirm,
}: {
  title: string
  /** „N ვიდეო · ~ხანგრძლივობა" */
  summary: string
  busy: boolean
  confirmLabel: string
  /** დამატებითი ინფო დადასტურებამდე (მაგ. ჩამოტვირთვის ზომა და კვოტა) */
  children?: ReactNode
  onClose: () => void
  onConfirm: (choice: PlaylistImportChoice) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { all } = useModules()
  const saved = all.find((m) => m.key === 'course')?.user_settings?.[SETTING] as Partial<PlaylistImportChoice> | undefined

  const typesQ = useQuery({ queryKey: ['video-types'], queryFn: fetchVideoTypes })
  const { data: statuses = [] } = useStatuses('video')
  const types = typesQ.data ?? []

  const [typeId, setTypeId] = useState(saved?.type_id ? String(saved.type_id) : '')
  const [status, setStatus] = useState(saved?.status ?? '')
  // შენახული არჩევანი შეიძლება აღარ არსებობდეს — მაშინ ველი ცარიელია
  const pickedType = types.some((type) => String(type.id) === typeId) ? typeId : ''
  const pickedStatus = statuses.some((s) => s.key === status) ? status : ''
  const ready = !!pickedType && !!pickedStatus && !busy

  const confirm = () => {
    const choice = { type_id: Number(pickedType), status: pickedStatus }
    qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
      list?.map((m) => (m.key === 'course' ? { ...m, user_settings: { ...m.user_settings, [SETTING]: choice } } : m)),
    )
    void updateModuleSettings('course', { [SETTING]: choice }).catch(() => {
      // დამახსოვრების ჩავარდნა დამატებას არ აჩერებს
    })
    onConfirm(choice)
  }

  return (
    <ModalShell title={title} hint={t('courses.playlist.importHint')} onClose={onClose}>
      <p className="text-sm font-medium" data-testid="playlist-import-summary">
        {summary}
      </p>
      {children}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pl-type">{t('fields.name.video.type_id')}</Label>
          <Select value={pickedType} onValueChange={setTypeId}>
            <SelectTrigger id="pl-type">
              <SelectValue placeholder={t('validation.choose')} />
            </SelectTrigger>
            <SelectContent>
              {types.map((type) => (
                <SelectItem key={type.id} value={String(type.id)}>
                  {videoTypeName(type, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="pl-status">{t('form.status')}</Label>
          <Select value={pickedStatus} onValueChange={setStatus}>
            <SelectTrigger id="pl-status">
              <SelectValue placeholder={t('validation.choose')} />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.key}>
                  <StatusLabel status={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="button" onClick={confirm} disabled={!ready} data-testid="playlist-import-confirm">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
          {confirmLabel}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

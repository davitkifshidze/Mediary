import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PosterUploader } from '@/components/PosterUploader'
import { usePrivateFileUrl } from '@/components/PrivateFile'
import { FieldLabel } from '@/components/ui/field-label'

/* ============================================================
   **პიროვნებისა და ალბომის მთავარი ფოტო — ფორმაში.**

   ცალკე ატვირთვა, შეცვლა და წაშლა იმავე ჩარჩოთი, რაც ყველა ფორმას აქვს
   (`PosterUploader`: „შეცვლა" და „წაშლა" ქვედა ზოლში, შუაში — დიდად ნახვა).

   ⚠️ **ატვირთული ფოტო ჩვეულებრივი ფოტოა** — პიროვნების (ან ალბომის) ფოტოებში
   ემატება და მთავრად ინიშნება (`cover_media_id`); ცალკე „პორტრეტის" ფაილი არ
   არსებობს, ამიტომ ბადის „მთავრად დაყენება" და ეს ჩარჩო ერთსა და იმავეს ცვლის.
   „წაშლა" მხოლოდ მთავრობას ხსნის — ფოტო თავის ადგილზე რჩება.

   ⚠️ არსებული მთავარი ფოტო პირად დისკზეა: ჩარჩო მას API-ით კითხულობს (blob).
   ============================================================ */

/** ფორმის მდგომარეობა: ახალი ფაილი, მოხსნა, ან „არ შეცვლილა" */
export interface CoverDraft {
  /** ასატვირთი ფაილი (შენახვისას აიტვირთება და მთავრად დაინიშნება) */
  file: File | null
  /** არსებული მთავარი ფოტო მოიხსნას */
  cleared: boolean
}

export const EMPTY_COVER: CoverDraft = { file: null, cleared: false }

export function PersonalCoverField({
  current,
  draft,
  onChange,
  variant,
}: {
  /** არსებული მთავარი ფოტოს მისამართი (პირადი დისკი), ან `null` */
  current: string | null | undefined
  draft: CoverDraft
  onChange: (next: CoverDraft) => void
  /** პიროვნება — პორტრეტი, ალბომი — ფართო კადრი */
  variant: 'poster' | 'wide'
}) {
  const { t } = useTranslation()
  const stored = usePrivateFileUrl(draft.file || draft.cleared ? null : current)
  const picked = useMemo(() => (draft.file ? URL.createObjectURL(draft.file) : null), [draft.file])

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked)
  }, [picked])

  return (
    <PosterUploader
      preview={picked ?? stored.url}
      onSelect={(file) => onChange({ file, cleared: false })}
      onClear={() => onChange({ file: null, cleared: true })}
      variant={variant}
      hint={t('personal.cover.hint')}
      fill
    />
  )
}

/** ჩარჩოს ლეიბლი — `FormSection`-ის `mediaLabel` */
export function PersonalCoverLabel() {
  const { t } = useTranslation()

  return <FieldLabel>{t('personal.cover.label')}</FieldLabel>
}

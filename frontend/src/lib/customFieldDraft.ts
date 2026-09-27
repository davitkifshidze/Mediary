import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { saveCustomFieldValues, uploadCustomFieldFile, type CustomFieldValues } from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { usePendingUploads, type PendingUpload } from '@/lib/pendingUploads'

/* ============================================================
   **დამატებითი ველები ახალ ჩანაწერზე — შენახვამდე** (Tasks §26.5, Q16).

   აქამდე ახალ ჩანაწერზე `CustomFieldsCard` მხოლოდ „ჯერ შეინახე"-ს
   წერდა: მნიშვნელობას `record_id` სჭირდება, ანუ ჩანაწერი ორჯერ უნდა
   გაგეხსნა. ახლა ველები მაშინვე ივსება, მნიშვნელობები და ფაილები კი
   ბრაუზერშია, სანამ ჩანაწერი არ შეიქმნება.

   ⚠️ **§23.4-ის მექანიზმია და არა ახალი** (`usePendingUploads`): ჯერ
   ჩანაწერი, მერე მნიშვნელობები (ერთი `PUT`), მერე ფაილები — **სათითაოდ**,
   რომ ერთმა ცუდმა ფაილმა დანარჩენი არ ჩააგდოს. ფაილის „სახეობა" აქ
   ველის გასაღებია.

   ⚠️ **ჩავარდნა ჩანაწერს არ აუქმებს**: ბარათი მონახაზის რეჟიმში რჩება
   (ჩავარდნილი ფაილი მიზეზით ჩანს), ფორმა შექმნილის რედაქტირებად
   გადადის და შემდეგი „შენახვა" მხოლოდ დარჩენილს ცდის.

   ⚠️ **მხოლოდ ახალ ჩანაწერზე**: არსებულზე ბარათი ისევ თვითონ ინახავს
   თავს და ფაილი მაშინვე ადის — იქ `record_id` უკვე არსებობს.
   ============================================================ */

const isEmpty = (value: unknown) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0)

export function useCustomFieldDraft(module: string) {
  const { t } = useTranslation()
  const [values, setValues] = useState<CustomFieldValues>({})
  /** ფაილები; `kind` = ველის გასაღები */
  const files = usePendingUploads<string>()
  /** მნიშვნელობების შენახვის ჩავარდნის მიზეზი (უკვე თარგმნილი) */
  const [error, setError] = useState<string | null>(null)
  /** ყველაფერი ავიდა — ბარათი ჩვეულებრივ რეჟიმს უბრუნდება */
  const [done, setDone] = useState(false)

  const set = useCallback((key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }))
  }, [])

  /**
   * ჩანაწერის შექმნის შემდეგ. ბრუნდება ჩავარდნილი ფაილები; `ok: false`
   * და ცარიელი სია ნიშნავს, რომ მნიშვნელობები ვერ შეინახა (`error`).
   * `message` თოსტისთვისაა — ფორმამ ტექსტი თვითონ აღარ უნდა ააწყოს.
   *
   * ⚠️ `done`-ის შემდეგ აღარ უნდა დაუძახო: ბარათი უკვე ჩვეულებრივ
   * რეჟიმშია და იქ შეცვლილ მნიშვნელობას ძველი მონახაზი გადაწერდა.
   */
  const flush = useCallback(
    async (recordId: number): Promise<{ ok: boolean; failed: PendingUpload<string>[]; message: string }> => {
      const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => !isEmpty(value)))

      if (Object.keys(filled).length > 0) {
        try {
          await saveCustomFieldValues(module, recordId, filled)
          setError(null)
        } catch (e) {
          const reason = errorMessage(e)
          setError(reason)

          return { ok: false, failed: [], message: t('customFields.flushFailed', { names: reason }) }
        }
      }

      const failed = await files.run((key, file) => uploadCustomFieldFile(module, recordId, key, [file]))
      const ok = failed.length === 0
      if (ok) setDone(true)

      return {
        ok,
        failed,
        message: ok ? '' : t('customFields.flushFailed', { names: failed.map((f) => f.file.name).join(', ') }),
      }
    },
    [files, module, t, values],
  )

  return { values, set, files, error, done, flush }
}

export type CustomFieldDraft = ReturnType<typeof useCustomFieldDraft>

/**
 * **ფორმის მხარე — ერთ ადგილას** (Tasks §26.5): მონახაზი, „შექმნილი"
 * ჩანაწერი და შენახვის შემდეგი ნაბიჯი.
 *
 * ⚠️ `current` — რომელ ჩანაწერს ეხება შემდეგი „შენახვა". ჩავარდნის შემდეგ
 * ფანჯარა ღია რჩება და ჩანაწერი **უკვე შექმნილია**: `current` მაშინ
 * შექმნილს აბრუნებს, ე.ი. მეორე „შენახვა" მას ანახლებს და **დუბლს აღარ
 * ქმნის** (§23.4-ის წესი, რომელიც ჩანაწერების ფორმამ დაადგინა).
 *
 * ⚠️ `draft` მხოლოდ ახალ ჩანაწერზე ბრუნდება — არსებულზე ბარათი თვითონ
 * ინახავს თავს და მონახაზი არ სჭირდება.
 */
export function useRecordExtras<T extends { id: number }>(module: string, record: T | null) {
  const draft = useCustomFieldDraft(module)
  const [created, setCreated] = useState<T | null>(null)

  /** ჩანაწერის შენახვის შემდეგ; `ok: false` = ფანჯარა ღია უნდა დარჩეს */
  const afterSave = async (saved: T): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (record || draft.done) return { ok: true }

    const result = await draft.flush(saved.id)
    if (result.ok) return { ok: true }

    setCreated(saved)

    return { ok: false, message: result.message }
  }

  return { draft: record ? undefined : draft, current: record ?? created, afterSave }
}

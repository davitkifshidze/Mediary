import { useCallback, useEffect, useRef, useState } from 'react'
import type { UploadKindLimit } from '@/api/account'
import { errorMessage } from '@/lib/errors'

/* ============================================================
   **შენახვამდე არჩეული ფაილები** (Tasks §23.4).

   შენი სიტყვები: „დამატებისას სურათზე, დოკუმენტზე და ვიდეოზე წერია „ჯერ
   შეინახე და მერე დაამატე“ — თუ შეიძლება, დამატებისთანავე ზუსტად ის
   გაკეთდეს, რაც რედაქტირებისას კეთდება".

   ⚠️ **ფაილი ბრაუზერშია, სანამ ჩანაწერი არ არსებობს** — `note_entry_files`-ს
   `note_entry_id` სჭირდება, ე.ი. ატვირთვა შენახვის **შემდეგ** ხდება:
   ჯერ ჩანაწერი (`POST /notes`), მერე ფაილები — **სათითაოდ**, პროგრესით.
   სათითაოდ იმიტომ, რომ ერთ `files[]`-იან მოთხოვნაზე ერთი ცუდი ფაილი (413
   კვოტა, 422 ფორმატი) ყველას ჩააგდებდა და „რომელი ვერ აიტვირთა" პასუხი
   ვერ ექნებოდა.

   ⚠️ **ჩავარდნა ჩანაწერს არ აუქმებს** — ჩავარდნილი ფაილი სიაში რჩება
   მიზეზით, ფანჯარა ღიაა და ხელახლა ცდა შეიძლება.

   ⚠️ **მოდულზე მიბმული არ არის** (Q16): `CustomFieldsCard`-ის ფაილი ახალ
   ჩანაწერზე §26-ში იმავე მექანიზმით კეთდება, ამიტომ აქ მხოლოდ „ფაილი +
   სახეობა + მდგომარეობა"-ა და ატვირთვის ფუნქციას გამომძახებელი აწვდის.
   ============================================================ */

export type PendingStatus = 'pending' | 'uploading' | 'error'

export interface PendingUpload<K extends string = string> {
  key: number
  kind: K
  file: File
  status: PendingStatus
  /** ჩავარდნის მიზეზი (უკვე თარგმნილი) */
  error?: string
  /** სურათის წინასწარი ხედი (`blob:`); სხვა ფაილს — `null` */
  preview: string | null
}

let nextKey = 1

/**
 * **ბრაუზერის შემოწმება** — სერვერის იგივე ლიმიტით (`GET /uploads/limits`).
 *
 * ⚠️ ეს მოხერხებაა და არა წესი: backend-ი ფორმატს **შიგთავსით** ამოწმებს
 * (`mimes:`), აქ კი გაფართოებით — მაგრამ 100 MB-ზე დიდ ვიდეოზე შენახვამდე
 * ითქმის, რომ არ გამოდგება, და არა ჩანაწერის შექმნის შემდეგ.
 */
export function uploadProblem(
  file: File,
  kind: string,
  limit: UploadKindLimit | undefined,
): 'too_large' | 'wrong_type' | null {
  if (!limit) return null
  if (file.size > limit.max_bytes) return 'too_large'

  /* ⚠️ §34.4 — სია **ყოველთვის ნამდვილია** (სურათსაც აქვს), ხოლო
     `extensions` ფსევდონიმებსაც შეიცავს (`jpeg`, `prc`…) — `.jpeg` ფაილი
     `jpg`-ის ჩართვით უნდა გადიოდეს, ისევე როგორც სერვერზე. */
  const allowed = limit.extensions?.length ? limit.extensions : limit.mimes

  if (allowed.length) {
    const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : ''
    if (!allowed.includes(ext)) return 'wrong_type'
  } else if (kind === 'image' && file.type && !file.type.startsWith('image/')) {
    return 'wrong_type'
  }

  return null
}

/**
 * **`accept`** — ფაილის ფანჯარა მხოლოდ გამოსადეგს აჩვენებს (§23.4: აქამდე
 * დოკუმენტებს `accept` საერთოდ არ ჰქონდა).
 */
export function acceptFor(kind: string, limit: UploadKindLimit | undefined): string | undefined {
  const allowed = limit ? (limit.extensions?.length ? limit.extensions : limit.mimes) : []
  if (allowed.length) return allowed.map((ext) => `.${ext}`).join(',')
  if (kind === 'image') return 'image/*'
  if (kind === 'video') return 'video/*'

  return undefined
}

export function usePendingUploads<K extends string>() {
  const [items, setItems] = useState<PendingUpload<K>[]>([])

  /* ⚠️ `blob:` მისამართები ხელით უნდა გათავისუფლდეს — თორემ ყოველი არჩეული
     სურათი გვერდის სიცოცხლის ბოლომდე მეხსიერებაში რჩება. */
  const live = useRef(new Set<string>())
  useEffect(() => {
    const urls = live.current

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const release = (item: PendingUpload<K>) => {
    if (item.preview) {
      URL.revokeObjectURL(item.preview)
      live.current.delete(item.preview)
    }
  }

  const add = useCallback((kind: K, files: File[]) => {
    const fresh = files.map((file) => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      if (preview) live.current.add(preview)

      return { key: nextKey++, kind, file, status: 'pending' as PendingStatus, preview }
    })

    setItems((cur) => [...cur, ...fresh])
  }, [])

  const remove = useCallback((key: number) => {
    setItems((cur) => {
      const item = cur.find((i) => i.key === key)
      if (item) release(item)

      return cur.filter((i) => i.key !== key)
    })
  }, [])

  /**
   * **სათითაოდ ატვირთვა.** წარმატებული სიიდან ქრება, ჩავარდნილი რჩება
   * მიზეზით; ბრუნდება ჩავარდნილების სია (ცარიელი = ყველა ავიდა).
   */
  const run = useCallback(
    async (
      upload: (kind: K, file: File) => Promise<unknown>,
      onProgress?: (done: number, total: number) => void,
    ): Promise<PendingUpload<K>[]> => {
      const queue = items.filter((i) => i.status !== 'uploading')
      const failed: PendingUpload<K>[] = []

      for (const [index, item] of queue.entries()) {
        onProgress?.(index, queue.length)
        setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: 'uploading', error: undefined } : i)))

        try {
          await upload(item.kind, item.file)
          release(item)
          setItems((cur) => cur.filter((i) => i.key !== item.key))
        } catch (e) {
          const error = errorMessage(e)
          failed.push({ ...item, status: 'error', error })
          setItems((cur) => cur.map((i) => (i.key === item.key ? { ...i, status: 'error', error } : i)))
        }
      }

      onProgress?.(queue.length, queue.length)

      return failed
    },
    [items],
  )

  const of = useCallback((kind: K) => items.filter((i) => i.kind === kind), [items])

  return { items, add, remove, run, of }
}

export type PendingUploads<K extends string> = ReturnType<typeof usePendingUploads<K>>

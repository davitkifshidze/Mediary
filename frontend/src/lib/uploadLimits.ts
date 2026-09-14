import { useQuery } from '@tanstack/react-query'
import { fetchUploadLimits, type UploadKindLimit } from '@/api/account'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   **ატვირთვის ლიმიტები ინტერფეისში (2026-09-14).**

   ⚠️ ლიმიტი აქამდე **მხოლოდ backend-ის ვალიდაციაში იყო**: ატვირთვა 422-ით
   ვარდებოდა და ეკრანზე არსად ეწერა, რა ზომა ან რა ფორმატი შეიძლება. ახლა
   იგივე რიცხვები, რომლებზეც სერვერი ამოწმებს, ეკრანზეც წერია —
   `GET /api/uploads/limits` (ერთი წყარო, `App\\Support\\UploadLimits`).

   ⚠️ **რიცხვი ფრონტზე არ დუბლირდება.** მაცდური იყო `MAX = 8 * 1024 * 1024`
   კონსტანტად ჩაწერა, მაგრამ ნამდვილი ჭერი `php.ini`-ზეც არის დამოკიდებული
   (`upload_max_filesize`), ე.ი. ასლი პირველივე დღეს მოიტყუებოდა.
   ============================================================ */

/** ქეშირებულია — ლიმიტი სესიის განმავლობაში არ იცვლება */
export function useUploadLimits() {
  return useQuery({
    queryKey: ['upload-limits'],
    queryFn: fetchUploadLimits,
    staleTime: 30 * 60_000,
  })
}

/** ერთი სახეობის ლიმიტი (ჯერ არ ჩამოსულზე `undefined`) */
export function limitFor(
  limits: { kinds: UploadKindLimit[] } | undefined,
  kind: UploadKindLimit['kind'],
): UploadKindLimit | undefined {
  return limits?.kinds.find((k) => k.kind === kind)
}

/**
 * ადამიანური მინაწერი — „მაქს. 8 MB · JPG, PNG…".
 *
 * ⚠️ ფორმატების სია **იჭრება**: ცამეტი გაფართოება სექციის სათაურს ორ რიგად
 * გახლეჩდა; დანარჩენი „+N"-ად ითვლება.
 */
export function limitHint(limit: UploadKindLimit | undefined, more: (n: number) => string): string {
  if (!limit) return ''

  const size = `≤ ${formatBytes(limit.max_bytes)}`
  if (!limit.mimes.length) return size

  const shown = limit.mimes.slice(0, 6).join(', ').toUpperCase()
  const rest = limit.mimes.length - 6

  return `${size} · ${shown}${rest > 0 ? ` ${more(rest)}` : ''}`
}

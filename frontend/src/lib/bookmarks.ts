import { useQueryClient } from '@tanstack/react-query'

/* ============================================================
   **ბუკმარკის ქეშის ორი გასაღები**.

   დეტალის ფანჯარა ჩანაწერს სიიდან იღებს, მაგრამ `?open=<id>`-ით გახსნილი
   ბუკმარკი შეიძლება მიმდინარე ფილტრს მიღმა იყოს — მაშინ ის ცალკე იკითხება
   (`['bookmark', id]`). ⚠️ ყოველი ცვლილება **ორივეს** ანულებს: მხოლოდ სიის
   განახლება ფილტრს მიღმა მდგომ ფანჯარას ძველ რჩეულს/ბმულებს დაუტოვებდა.
   ============================================================ */

export function bookmarkKey(id: number): readonly ['bookmark', number] {
  return ['bookmark', id]
}

export function useBookmarkRefresh(): () => void {
  const qc = useQueryClient()

  return () => {
    void qc.invalidateQueries({ queryKey: ['bookmarks'] })
    void qc.invalidateQueries({ queryKey: ['bookmark'] })
  }
}

/** ვებძებნის სწრაფი ჩიპები (`bookmarks.webChips.*`) — დეტალის ფანჯარაც და ფორმაც */
export const BOOKMARK_WEB_TERMS = ['product', 'photos', 'logo', 'review'] as const

/**
 * ვებძებნის საწყისი შეკითხვა — **სათაური + დომენი** (ფორმაშიც იგივე წესია).
 * ⚠️ დომენი `www.`-ის გარეშე; გაუმართავი ბმული უბრალოდ გამოიტოვება.
 */
export function bookmarkWebQuery(title: string | null | undefined, url: string | null | undefined): string {
  let domain: string | null = null
  try {
    domain = url ? new URL(url.trim()).hostname.replace(/^www\./, '') : null
  } catch {
    domain = null
  }

  return [title?.trim(), domain].filter(Boolean).join(' ')
}

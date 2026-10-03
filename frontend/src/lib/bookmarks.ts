import { useQueryClient } from '@tanstack/react-query'

/* ============================================================
   **ბუკმარკის ქეშის ორი გასაღები** (Tasks §36.1).

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

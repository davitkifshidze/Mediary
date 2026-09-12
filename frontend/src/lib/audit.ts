import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { recordVisit } from '@/api/audit'

/**
 * **„რომელ სექციაში შევიდა" (Tasks §4.1)**.
 *
 * ⚠️ **სიგნალი აქედან მოდის და არა backend-ის middleware-იდან.** აპლიკაცია
 * SPA-ა: სექციაში შესვლა მარშრუტის შეცვლაა და არა HTTP რექვესთი — ერთი
 * გვერდის გახსნა ხუთ GET-ს აგზავნის, ბრაუზერის „უკან" კი არცერთს. ე.ი.
 * რექვესთების ლოგირება ერთდროულად ხმაურიც იქნებოდა და გამოტოვებაც.
 *
 * ⚠️ **მხოლოდ `pathname`, query-ს გარეშე.** ფილტრის შეცვლა (`?view=…`)
 * სექციაში შესვლა არ არის და ლოგს უაზროდ გაზრდიდა.
 *
 * გამეორების საბოლოო ჩახშობა backend-შია (ერთი წუთის ფანჯარა) — აქაური
 * `ref` მხოლოდ ზედმეტ რექვესთს იშორებს.
 */
export function useVisitTracker(enabled = true): void {
  const { pathname } = useLocation()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || last.current === pathname) return

    last.current = pathname
    void recordVisit(pathname)
  }, [enabled, pathname])
}

import { useEffect, useRef, useState } from 'react'

/* ============================================================
   ფილტრის მონახაზი — ერთი განმარტება რვავე გვერდისთვის (ეტაპი 6).

   `LibraryPage · VideosPage · SongsPage · BooksPage · GamesPage ·
   BoardGamesPage · NotesPage · BookmarksPage` ერთსა და იმავე მოდელზე
   მუშაობს: **მოქმედი ფილტრი მისამართშია**, პანელი კი მხოლოდ *მონახაზს*
   ცვლის და „გაფილტვრაზე" წერს URL-ში (2.2-ის მოდელი).

   ⚠️ **სამი ფაქტი რვაჯერ ეწერა** — მონახაზის URL-თან სინქრონიზაცია,
   `same()` (ხელით დაწერილი შედარება, სიტყვასიტყვით ერთნაირი შვიდ
   გვერდზე) და „რამდენი ფილტრია ჩართული". სწორედ ამის გამო **„სრული
   გასუფთავება" არ მუშაობდა**: `onClear` მხოლოდ ცარიელ მისამართზე
   გადადიოდა, ხოლო თუ მისამართი ისედაც სუფთა იყო (მონიშნე სამი ჟანრი და
   „გაფილტვრის" გარეშე დააჭირე ჯვარს), `useEffect`-ს არაფერი ეცვლებოდა
   და მონახაზი — ე.ი. ეკრანზე მონიშნული ჩექბოქსები — ადგილზე რჩებოდა.

   ⚠️ **`apply()` თვითონვე ასწორებს მონახაზს.** ეს არის ის ერთი ადგილი,
   რომელიც „გასუფთავებას" ორივე მხარეს ამოქმედებს (მონახაზი + მოქმედი
   ფილტრი) — გამომძახებელს არჩევანი აღარ აქვს და აცდენაც აღარ ხდება.
   ============================================================ */

/**
 * შედარებადი „გასაღები" ფილტრის მნიშვნელობისთვის.
 *
 * ⚠️ **სიის რიგი მნიშვნელობა არაა** — `['a','b']` და `['b','a']` ერთი და
 * იგივე ფილტრია (ძველი `same()` სწორედ ასე ადარებდა); უბრალო
 * `JSON.stringify` მათ სხვადასხვად ჩათვლიდა და „გაფილტვრის" ღილაკი
 * უმიზეზოდ აქტიურდებოდა.
 */
export function filterKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(filterKey).sort().join(',')}]`

  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${k}:${filterKey((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }

  return JSON.stringify(value ?? null) ?? 'null'
}

/**
 * რამდენი ფილტრია ჩართული — სია თავისი სიგრძით, დანარჩენი 1-ით.
 *
 * ⚠️ **სტატუსი/რჩეული აქ არასდროს ხვდება** (Tasks 3): ისინი საიდბარის
 * სექციებია (`?view=`) და არა ფილტრი, ე.ი. მონახაზშიც არ არიან.
 */
export function filterCount(value: unknown): number {
  if (Array.isArray(value)) return value.length

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((sum, v) => sum + filterCount(v), 0)
  }

  if (typeof value === 'string') return value.trim() === '' ? 0 : 1

  return value ? 1 : 0
}

/**
 * მონახაზი + მოქმედი ფილტრი.
 *
 * @param applied მისამართიდან წაკითხული მოქმედი ფილტრი
 * @param empty   „არაფერი არაა მონიშნული" — გასუფთავების სამიზნე
 * @param write   მონახაზის მისამართში ჩაწერა (თითო გვერდის თავისი გზაა)
 */
export function useFilterDraft<T>(applied: T, empty: T, write: (next: T) => void) {
  const [draft, setDraft] = useState<T>(applied)

  const appliedKey = filterKey(applied)
  // ⚠️ ref-ით, რომ ეფექტის დამოკიდებულება მხოლოდ *გასაღები* იყოს: `applied`
  // ყოველ რენდერზე ახალი ობიექტია და პირდაპირ დამოკიდებულებად უსასრულო
  // ციკლს გამოიწვევდა.
  const latest = useRef(applied)
  latest.current = applied

  // მისამართის ცვლილება (საიდბარი, ბრაუზერის „უკან", ჟანრზე დაჭერა)
  useEffect(() => {
    setDraft(latest.current)
  }, [appliedKey])

  const apply = (next: T) => {
    setDraft(next)
    write(next)
  }

  return {
    draft,
    setDraft,
    /** მონახაზი მოქმედისგან განსხვავდება — „გაფილტვრა" აქტიურია */
    dirty: filterKey(draft) !== appliedKey,
    apply,
    /** სრული გასუფთავება — **ორივე მხარე**: მონახაზიც და მოქმედი ფილტრიც */
    clear: () => apply(empty),
    /** მოქმედი (და არა მონახაზის) ფილტრების რაოდენობა */
    activeCount: filterCount(applied),
  }
}

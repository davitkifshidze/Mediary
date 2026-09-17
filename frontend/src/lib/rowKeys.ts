/**
 * **სტაბილური `key` სარედაქტირებელი სტრიქონებისთვის (Tasks BUG-11).**
 *
 * ბმულების, DLC-ების და მსგავსი სიების რიგებს `key={i}` ჰქონდათ, ე.ი.
 * **მასივის ინდექსი**. შუა სტრიქონის წაშლაზე React ძველი `n`-ის DOM-ს
 * `n+1`-ისთვის იყენებს — და თან მიჰყვება ყველაფერი, რაც DOM-ში ზის და
 * არა state-ში: ფოკუსი, კარეტის პოზიცია, IME-ს მიმდინარე შეყვანა და
 * Radix `Select`-ის შიდა open/highlight — ე.ი. **ღია დროფდაუნი უცებ სხვა
 * სტრიქონის მონაცემზე ხვდება**.
 *
 * ⚠️ **`crypto.randomUUID()` აქ განზრახ არ გამოიყენება**, თუმცა ცხადი
 * არჩევანი ჩანს: ის **მხოლოდ დაცულ კონტექსტში არსებობს** (https ან
 * localhost), აპლიკაცია კი `http://mediary.local`-ზე იხსნება — იქ ის
 * `undefined`-ია და გამოძახება ჩავარდებოდა. იგივე ხაფანგი, რაც
 * `navigator.clipboard`-ს აქვს. გასაღები გლობალურად უნიკალური არც უნდა
 * იყოს — საკმარისია ერთი სიის ფარგლებში, ე.ი. მრიცხველი ზუსტად ის
 * ინსტრუმენტია (`feedback.tsx`-ის `nextToastId`-ის იგივე გზა).
 *
 * ⚠️ **გასაღები **მონაცემი არ არის** და გაგზავნამდე ცხადად იჭრება**
 * (`unkeyRows`). სამივე კონტროლერი დღეს რიგს ველ-ველად თავიდან აწყობს,
 * ე.ი. ზედმეტი გასაღები ბაზამდე ისედაც ვერ მიაღწევდა — მაგრამ ეს
 * **სერვერის** ქცევაა და არა ჩვენი გარანტია: ხვალინდელი `$data['links']`-ის
 * პირდაპირ შენახვა მას ჩუმად ჩაწერდა JSON-ში.
 */

export type Keyed<T> = T & { _key: string }

let nextRowKey = 1

export function newRowKey(): string {
  return `r${nextRowKey++}`
}

/** ერთი რიგი გასაღებით — ახალი სტრიქონის დამატებისას */
export function keyRow<T extends object>(row: T): Keyed<T> {
  return { ...row, _key: newRowKey() }
}

/** სერვერიდან ან დრაფტიდან მოსული სია — გასაღებები აქ ერგება */
export function keyRows<T extends object>(rows: readonly T[]): Keyed<T>[] {
  return rows.map(keyRow)
}

/** გაგზავნამდე: გასაღები ქრება, დანარჩენი ხელუხლებელია */
export function unkeyRows<T extends object>(rows: readonly Keyed<T>[]): T[] {
  return rows.map(({ _key, ...row }) => row as unknown as T)
}

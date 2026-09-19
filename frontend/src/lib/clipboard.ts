/**
 * **ბუფერში ჩაწერა — ერთი გზა მთელ აპზე.**
 *
 * ⚠️ **`navigator.clipboard` უსაფრთხო კონტექსტის გარეთ საერთოდ არ
 * არსებობს.** `localhost` ასეთად ითვლება, იმავე dev-სერვერზე ქსელის IP-ით
 * გახსნილი კი — არა; პირდაპირი გამოძახება იქ გაუგებარ „არაფერი მოხდა"-ს
 * იძლეოდა. იგივე ხაფანგი, რაც `crypto.randomUUID()`-ს აქვს (`lib/rowKeys.ts`).
 *
 * ⚠️ **ფუნქცია `lib/`-ში გადმოვიდა FEAT-16-ზე**: `secret-input.tsx`-ს ის
 * პირადად ჰქონდა, ხოლო აღდგენის ბმულს, აღდგენის კოდებსა და TOTP-ის
 * საიდუმლოს იგივე სჭირდებოდათ — მეორე ასლი კი სწორედ ის დუბლიკატია,
 * რომელსაც ფოლბექი ერთ დღეს დააკლდება.
 *
 * ⚠️ **აბრუნებს `boolean`-ს**: „დაკოპირდა" უხილავი ქმედებაა და ღილაკმა
 * ის უნდა დაადასტუროს; ჩუმად წარუმატებელი კოპირება ყველაზე ცუდი შედეგია.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* ქვემოთ სათადარიგო გზაა */
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

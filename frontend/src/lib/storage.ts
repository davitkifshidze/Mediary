/**
 * **ბრაუზერის საცავი, რომელიც აპს ვერასდროს ჩააგდებს (Tasks BUG-24).**
 *
 * ⚠️ **საქმე მხოლოდ `QuotaExceededError`-ში არაა.** Safari-ს private
 * რეჟიმში `setItem` ისვრის, ხოლო „ყველა ქუქის/საიტის მონაცემის ბლოკირებაზე"
 * ისვრის **თვითონ `window.localStorage`-ზე მიმართვაც** (`SecurityError`),
 * ე.ი. `localStorage.getItem('lang')` **მოდულის დონეზე** — როგორც ეს
 * `i18n/index.ts`-ს ჰქონდა — იმპორტისას ვარდება. ასეთ ჩავარდნას
 * `ErrorBoundary` ვერ იჭერს (ის ჯერ არც არსებობს), ე.ი. მომხმარებელი
 * თეთრ ეკრანს ხედავს.
 *
 * ამიტომ `try`-ის შიგნით **თვისებაზე მიმართვაცაა** და არა მხოლოდ
 * `getItem()`-ის გამოძახება.
 *
 * ⚠️ **ჩავარდნა ჩუმია და ეს განზრახაა**: საცავი მხოლოდ მოხერხებულობაა —
 * ენა, თემა და შენახული პარამეტრები. მისი არქონა სესიაში არაფერს შლის
 * (`lib/settings.tsx` სერვერზეც ინახავს), ე.ი. გაფრთხილება მომხმარებელს
 * იმას შესთავაზებდა, რასაც ვერაფერს უშველის.
 */
export function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // private mode / სავსე quota / დაბლოკილი საცავი — იხ. ზემოთ
  }
}

/** Tasks §20.3 — ხელით დაყენებულის მოხსნა (დამკვრელის სიგანე ნაგულისხმევზე) */
export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // იხ. ზემოთ
  }
}

/* Tasks §10 — ერთი სესიის ფარგლებში „უკვე გავაკეთე" ნიშნები (შესვლის
   მთვლელი): ტაბის დახურვაზე ქრება, სწორედ ეს გვინდა. იგივე წესები. */
export function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function sessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // იხ. ზემოთ
  }
}

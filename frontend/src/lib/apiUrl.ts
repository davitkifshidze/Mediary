/**
 * **API-ს ჰოსტი გვერდის loopback-სახელს მიჰყვება** (2026-09-28).
 *
 * ⚠️ **`localhost` და `127.0.0.1` ბრაუზერისთვის ორი სხვადასხვა საიტია.**
 * Vite `127.0.0.1:5173`-ს ბეჭდავს, `VITE_API_URL` კი `localhost:8000`-ს
 * ასახელებს — ე.ი. იქიდან გახსნილ გვერდს API უცხო საიტი იყო: CORS პასუხს
 * ბლოკავდა, Sanctum-ის `SameSite=Lax` ქუქის ბრაუზერი არ ინახავდა და
 * `document.cookie` სხვა ჰოსტის `XSRF-TOKEN`-ს ვერ კითხულობდა. login
 * „სერვერს ვერ დავუკავშირდი"-თი მთავრდებოდა, თუმცა სერვერი მუშაობდა.
 *
 * ⚠️ **ეს მხოლოდ ნახევარია** — backend-მა ტყუპი origin CORS-შიც უნდა
 * დაუშვას (`App\Support\LoopbackOrigin`).
 *
 * ⚠️ **ერთმანეთს მხოლოდ ეს ორი სახელი ენაცვლება.** სხვა ჰოსტი
 * (`mediary.local`, რეალური დომენი) ცნობიერი არჩევანია, ცარიელი
 * `VITE_API_URL` კი იგივე origin-ს ნიშნავს (პროქსის რეჟიმი) — ორივე
 * ხელუხლებელი რჩება. `[::1]` განზრახ არ არის სიაში: `php artisan serve`
 * მხოლოდ IPv4-ზე უსმენს.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1'])

export function apiBaseFor(configured: string, pageHost: string): string {
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    return configured
  }

  if (url.hostname === pageHost || !LOOPBACK.has(url.hostname) || !LOOPBACK.has(pageHost)) {
    return configured
  }

  url.hostname = pageHost
  return url.origin + url.pathname.replace(/\/$/, '')
}

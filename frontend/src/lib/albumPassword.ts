import { ALBUM_PASSWORD_MIN } from '@/api/gallery'

/* ============================================================
   **ალბომის ახალი პაროლი — რა უშლის ხელს (Tasks §17.2).**

   ⚠️ **ერთი ფუნქცია ორივე ფორმისთვის** — ალბომის ფანჯარა (`AlbumDialog`)
   და ამრჩევი, სადაც ალბომი გადატანისასვე იქმნება (`AlbumPicker`). ღილაკის
   გათიშვაც და ველთან დაწერილი მიზეზიც ამას კითხულობს, ე.ი. „ღილაკი
   გათიშულია და არ ვიცი, რატომ" ვერ მოხდება.

   ⚠️ **საზღვარს სერვერი იცავს** (`GalleryAlbumController`-ის `min:4`); აქ
   ის მხოლოდ იმისთვისაა, რომ მიზეზი ველთან ეწეროს და არა შენახვის შემდეგ
   toast-ში.
   ============================================================ */

export type AlbumPasswordProblem = 'short' | 'mismatch'

/**
 * `null` — არაფერი უშლის ხელს, **ან პაროლი ჯერ არ იწერება**: ცარიელი ველი
 * „პაროლს არ ვცვლი"-ს ნიშნავს და შეცდომა არ არის. „ლოკი ჩართულია, პაროლი კი
 * ცარიელია" გამომძახებლის კითხვაა — ფანჯარაში ცარიელი ველი კანონიერია.
 */
export function albumPasswordProblem(password: string, repeat: string): AlbumPasswordProblem | null {
  if (!password) return null
  if (password.length < ALBUM_PASSWORD_MIN) return 'short'

  return password === repeat ? null : 'mismatch'
}

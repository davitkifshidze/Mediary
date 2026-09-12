/* ============================================================
   ტეგების ნორმალიზება — ერთადერთი ფრონტის განმარტება (Tasks §2.6).

   ⚠️ **ოთხი ასლი იყო** (`VideosPage`, `SongsPage`, `BookForm`,
   `BookmarksPage`), სამი სხვადასხვა ხელმოწერით, ხოლო `NoteForm`-სა და
   ბორდგეიმის „მექანიკებს" საერთოდ არ ჰქონდა. ახლა ერთია და `TagSelect`-ში
   ჯდება, ე.ი. **ყველა მოდულს ავტომატურად ეხება**.

   ⚠️ **`Video::normalizeTags()`-ის ტყუპია და ისე უნდა დარჩეს**: trim →
   ზედმეტი სივრცის შეკუმშვა → რეგისტრის იგნორი → **ძველი რჩება**. თუ ორი
   მხარე სხვადასხვანაირად დაიწყებს თვლას, ფორმა ერთს აჩვენებს და ბაზაში
   მეორე შეინახება.

   ⚠️ ფრონტის მხარე **შეტყობინებაა** (მომხმარებელი ხედავს, რომ დუბლი
   მოეჭრა), backend-ის მხარე **გარანტიაა** (სკრიპტი და seeder ფორმას არ
   იცნობს) — ორივე საჭიროა.
   ============================================================ */

export function tagKey(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function dedupeTags(tags: string[]): { tags: string[]; removed: number } {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of tags) {
    const clean = raw.trim().replace(/\s+/g, ' ')
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }

  return { tags: out, removed: tags.filter((t) => t.trim()).length - out.length }
}

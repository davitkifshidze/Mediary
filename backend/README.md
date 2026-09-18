# Mediary — backend

Laravel 13 JSON API (PHP 8.3, MySQL/MariaDB). **ხედები არ არსებობს** — მხოლოდ
`/api`; ინტერფეისი `../frontend`-ია.

> აწყობა და გაშვება: [`../README.md`](../README.md).
> არქიტექტურა, გადაწყვეტილებები და ხაფანგები: [`../CLAUDE.md`](../CLAUDE.md).
> მიმდინარე სამუშაო: [`../Tasks.md`](../Tasks.md).

## ხშირი ბრძანებები

```bash
php artisan serve --port=8000          # dev-სერვერი
php artisan migrate --seed             # სქემა + ჟანრები და მოდულები
php artisan test                       # PHPUnit (sqlite :memory:)
./vendor/bin/pint                      # ფორმატირება
php artisan tinker                     # REPL
```

## პირველი ნაბიჯები ახალ ბაზაზე

```bash
php artisan mediary:bootstrap-admin --name= --email= --username= --password=
php artisan mediary:storage-recalc      # `storage_used_bytes`-ის გადათვლა დისკიდან
php artisan schedule:work               # შეხსენებების გასროლა (`notes:remind`)
```

## რა სად ცხოვრობს

| საქაღალდე | რა |
|---|---|
| `app/Http/Controllers/Api` | ყველა endpoint (`routes/api.php`) |
| `app/Services` | დომენური ლოგიკა — TMDB, სინქრონიზაცია, გალერეა, თარგმანი, წაშლა |
| `app/Support` | **რეესტრები**: `MediaDomain`, `PublicDomain`, `StatusDomain`, `StorageFolder`, `AuditRegistry` |
| `app/Models/Concerns` | `BelongsToUser`, `StoredFile`, `HasStatus`, `HasGallery`, `HasCustomFields` |
| `tests/Feature` | თითქმის ყველა ტესტი; `RegistryConsistencyTest` რეესტრებს ერთმანეთს უდარებს |

⚠️ ახალი მოდული რამდენიმე რეესტრში ერთდროულად უნდა ჩაიწეროს — გამოტოვება
**ჩუმია**. სწორედ ამას იჭერს `RegistryConsistencyTest`; დეტალები `../CLAUDE.md`-შია.

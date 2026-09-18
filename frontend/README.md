# Mediary — frontend

React 19 + TypeScript SPA (Vite, Tailwind v4, Radix/shadcn-style UI, TanStack
Query, react-i18next). ორენოვანი: ქართული/ინგლისური.

> აწყობა და გაშვება: [`../README.md`](../README.md).
> არქიტექტურა, გადაწყვეტილებები და ხაფანგები: [`../CLAUDE.md`](../CLAUDE.md).

## ხშირი ბრძანებები

```bash
npm run dev            # dev-სერვერი (http://localhost:5173)
npm run build          # `tsc -b` + Vite build
npm run lint           # oxlint + გამოუყენებელი ექსპორტების შემოწმება
npm run lint:exports   # იგივე, მთელ `src`-ზე (ინფორმაციული)
npm test               # Vitest (jsdom)
```

## რა სად ცხოვრობს

| საქაღალდე | რა |
|---|---|
| `src/api` | backend-ის კლიენტი და ტიპები, თითო მოდულზე თითო ფაილი |
| `src/lib` | საერთო წესები — `modules`, `settings`, `statuses`, `player`, `errors`, `dates` |
| `src/components/ui` | საერთო პრიმიტივები (`PageHeader`, `EmptyState`, `PhotoGrid`, `ModalShell`…) |
| `src/pages` | გვერდები; ყველა `lazy()`-ია (`App.tsx`) |
| `src/i18n` | `ka.json` / `en.json` + `audit.py` |

⚠️ **ორი წესი, რომელთა დარღვევაც ჩუმია:** გვერდიდან (`@/pages/...`) იმპორტი
არა-page მოდულში საწყის bundle-ს ასუქებს, ხოლო ახალი i18n-გასაღები **ორივე**
ლოკალში უნდა ჩაიწეროს. დანარჩენი — `../CLAUDE.md`-ში.

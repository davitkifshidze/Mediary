import { defineConfig } from 'vitest/config'
import path from 'node:path'

/* ============================================================
   ფრონტის ტესტები (Tasks §3).

   ⚠️ **ცალკე კონფიგი და არა `vite.config.ts`-ის `test` ბლოკი**: აპლიკაციის
   კონფიგში `react()` და `tailwindcss()` პლაგინები ზის, რომლებიც ამ
   ტესტებს არაფერში სჭირდება — `lib/`-ის სუფთა ფუნქციები იწერება და არა
   კომპონენტები. კონფიგი ასე იაფიც რჩება და ცხადიც.

   ⚠️ `jsdom` **საჭიროა და არა კომფორტისთვის**: `playableEmbedSrc()`
   YouTube-ზე `window.location.origin`-ს კითხულობს, ე.ი. სწორედ ის ერთი
   შემთხვევა, რომლის გამოც `enablejsapi`/`origin` არსებობს, node-ში
   საერთოდ ვერ შემოწმდებოდა.
   ============================================================ */

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})

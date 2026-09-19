import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/* ============================================================
   ⚠️ **HMR-ის ჰოსტი კონფიგურირებადია და აღარ არის ჩაბეტონებული** (Tasks GAP-17).

   აქ `mediary.local` ეწერა — იმ დესკტოპის მისამართი, სადაც Vite Apache-ის
   უკან იდგა (`mod_proxy`, პორტი 80). სხვა მანქანაზე, სადაც ეს სახელი hosts-ში
   არ არის, ბრაუზერი HMR-ის websocket-ს `mediary.local:80`-ზე ხსნიდა და
   **უხმოდ ვერ ახერხებდა**: გვერდი იხსნებოდა, ცხელი გადატვირთვა კი არ მუშაობდა.

   ⚠️ **ჩუმად ტყდებოდა — სწორედ ეს არის აქ საშიში.** `vite` შეცდომას არ
   აბრუნებს და `npm run build`-საც არაფერი ეტყობა; ჩანს მხოლოდ ის, რომ
   ფაილის შენახვაზე ეკრანი აღარ იცვლება.

   `VITE_DEV_HOST` (`frontend/.env`) დაყენებისას იგივე აწყობა ბრუნდება:
   პროქსის უკან HMR-ს ჰოსტის სახელი და პორტი 80 სჭირდება, თორემ ბრაუზერი
   `127.0.0.1:5173`-ზე მიდიოდა, რომელიც იმ სქემაში გარედან არ იხსნება.
   ============================================================ */
export default defineConfig(({ mode }) => {
  // ⚠️ მესამე არგუმენტი `''`-ია: `loadEnv` ნაგულისხმევად მხოლოდ `VITE_`-ს
  // კითხულობს, `''` კი ყველას — ამ ცვლადს პრეფიქსი ისედაც აქვს, მაგრამ
  // ასე მომავალი (არა-`VITE_`) პარამეტრიც იმუშავებს.
  const env = loadEnv(mode, path.resolve(import.meta.dirname, '..', 'backend'), '')
  const local = loadEnv(mode, import.meta.dirname, '')
  const devHost = local.VITE_DEV_HOST || env.VITE_DEV_HOST || ''

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      // ჰოსტის სახელით გახსნა მხოლოდ მაშინ ეშვება, როცა ის მართლა არსებობს
      allowedHosts: devHost ? [devHost] : [],
      // ⚠️ პროქსის გარეშე HMR-ს არაფერი სჭირდება — Vite თვითონ გამოთვლის
      ...(devHost ? { hmr: { host: devHost, clientPort: 80 } } : {}),
    },
  }
})

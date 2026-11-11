import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/* ⚠️ **გამორთული ღილაკი თაგვს „გრძნობს"** — მასზე კურსორი `not-allowed`-ია და
   მინიშნება (`title`, `Tooltip`) ჩანს. ამიტომ `pointer-events-none` აღარ წერია,
   ჰოვერის ფერები კი `not-disabled:`-ით იწერება: გამორთული ღილაკი ჰოვერზე არ
   იცვლება. ბმულად დახატულ ღილაკს (`asChild`, `buttonVariants()` `<a>`-ზე)
   ეს არ ეხება — ბმული არასდროს არის `:disabled`. */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background,border-color,opacity] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground not-disabled:hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground not-disabled:hover:opacity-90',
        /* **ტექსტიანი ღილაკის ნაგულისხმევი იერი** — ჩარჩო, ფონი და ჰოვერი (აიქონი
           შვილებშია). ფონი ბარათისაა: გვერდის ქაღალდისფერ ფონზე ღილაკი ჩანს,
           ბარათში კი ჩარჩო გამოყოფს. */
        outline: 'border border-border not-disabled:hover:bg-muted',
        /* ⚠️ `ghost` **მხოლოდ-აიქონ ღილაკისაა** (✕, ისრები, ⋯): არც ჩარჩოს
           ხატავს, არც ფონს. ტექსტიანზე `scripts/plain-buttons.mjs` მას კრძალავს. */
        ghost: 'not-disabled:hover:bg-muted',
        /* **წაშლის ოჯახი — ორი იერი.** `destructive` სავსე წითელია მუდმივი
           ჩარჩოთი და ჰოვერზე ბრუნდება (ფონი — გვერდის, ტექსტი და აიქონი —
           წითელი): დასტურის დიალოგი, დიალოგების ფუტერი, ფოტოს გადაფარვა.
           `destructiveOutline` „რედაქტირების" სარკეა — წითელი ჩარჩო და
           ტექსტი, ჰოვერზე ივსება: რიგის, ბარათისა და ქვესიის წაშლა.
           ⚠️ `fb-destructive` `index.css`-ის სახელურია — აიქონი ტექსტს
           მიჰყვება (ზოგადი ჰოვერის წესი ურნას წითლად ღებავს და სავსე წითელ
           ფონზე გააქრობდა). ჩარჩო ორივეს აქვს, რომ ზომა არ შეიცვალოს. */
        destructive:
          'fb-destructive border border-destructive bg-destructive text-destructive-foreground not-disabled:hover:bg-background not-disabled:hover:text-destructive',
        destructiveOutline:
          'fb-destructive border border-destructive/60 bg-transparent text-destructive not-disabled:hover:border-destructive not-disabled:hover:bg-destructive not-disabled:hover:text-destructive-foreground',
        /* **რედაქტირება** (2026-09-28, შენი არჩევანი) — სტაფილოსფერი ჩარჩო და
           ტექსტი, ჰოვერზე სავსე სტაფილოსფერი ღილაკი. ერთი ვარიანტი ყველგან:
           ჩანაწერის გვერდი, სიების რიგები, ლექსიკონები, ველები, ალბომები.
           ⚠️ `fb-edit` Tailwind-ის კლასი არაა — `index.css`-ის სახელურია,
           რომლითაც აიქონი ტექსტის ფერს მიჰყვება (ზოგადი ჰოვერის წესი მას
           სრულ სტაფილოსფრად შეღებავდა და სავსე ფონზე გააქრობდა). */
        edit: 'fb-edit border border-edit/60 bg-transparent text-edit not-disabled:hover:border-edit not-disabled:hover:bg-edit not-disabled:hover:text-edit-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3.5',
        /* ვიწრო ადგილის ღილაკი — ტექსტის შიგნით, რიგის ელემენტში, პატარა
           პანელში. მოქმედებების ზოლში არ იწერება: იქ ყველაფერი `sm`-ია. */
        xs: 'h-7 gap-1.5 px-2.5 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    /* ⚠️ აიქონ-ღილაკის ჰოვერი **მხოლოდ აიქონზე** ჩანს (ანიმაცია და
       ფერი `index.css`-იდან) — ფონის კვადრატი მოიხსნა, ჩარჩოიან აიქონსაც
       ფონი არ აქვს. ტექსტიან ღილაკს ფონი რჩება: იქ ის ღილაკის საზღვარია
       და არა აიქონის მორთულობა.
       ⚠️ `outline`-ის ფონი ზომის მიხედვით აქ იწერება და არა ვარიანტში: ერთ
       ელემენტზე `bg-card` და `bg-transparent` ერთად რომ მოხვდეს, `<a>`-ზე
       (`buttonVariants()` `cn`-ის გარეშე) გამარჯვებულს CSS-ის რიგი არჩევს. */
    compoundVariants: [
      { size: 'icon', variant: ['ghost', 'outline'], class: 'not-disabled:hover:bg-transparent' },
      { size: 'icon', variant: 'outline', class: 'bg-transparent' },
      { size: ['default', 'sm', 'xs', 'lg'], variant: 'outline', class: 'bg-card' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
)
Button.displayName = 'Button'

export { buttonVariants }

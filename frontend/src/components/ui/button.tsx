import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background,border-color,opacity] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground hover:opacity-90',
        outline: 'border border-border bg-transparent hover:bg-muted',
        ghost: 'hover:bg-muted',
        /* **წაშლის ოჯახი — ორი იერი.** `destructive` სავსე წითელია მუდმივი
           ჩარჩოთი და ჰოვერზე ბრუნდება (ფონი — გვერდის, ტექსტი და აიქონი —
           წითელი): დასტურის დიალოგი, დიალოგების ფუტერი, ფოტოს გადაფარვა.
           `destructiveOutline` „რედაქტირების" სარკეა — წითელი ჩარჩო და
           ტექსტი, ჰოვერზე ივსება: რიგის, ბარათისა და ქვესიის წაშლა.
           ⚠️ `fb-destructive` `index.css`-ის სახელურია — აიქონი ტექსტს
           მიჰყვება (ზოგადი ჰოვერის წესი ურნას წითლად ღებავს და სავსე წითელ
           ფონზე გააქრობდა). ჩარჩო ორივეს აქვს, რომ ზომა არ შეიცვალოს. */
        destructive:
          'fb-destructive border border-destructive bg-destructive text-destructive-foreground hover:bg-background hover:text-destructive',
        destructiveOutline:
          'fb-destructive border border-destructive/60 bg-transparent text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground',
        /* **რედაქტირება** (2026-09-28, შენი არჩევანი) — სტაფილოსფერი ჩარჩო და
           ტექსტი, ჰოვერზე სავსე სტაფილოსფერი ღილაკი. ერთი ვარიანტი ყველგან:
           ჩანაწერის გვერდი, სიების რიგები, ლექსიკონები, ველები, ალბომები.
           ⚠️ `fb-edit` Tailwind-ის კლასი არაა — `index.css`-ის სახელურია,
           რომლითაც აიქონი ტექსტის ფერს მიჰყვება (ზოგადი ჰოვერის წესი მას
           სრულ სტაფილოსფრად შეღებავდა და სავსე ფონზე გააქრობდა). */
        edit: 'fb-edit border border-edit/60 bg-transparent text-edit hover:border-edit hover:bg-edit hover:text-edit-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3.5',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    /* ⚠️ აიქონ-ღილაკის ჰოვერი **მხოლოდ აიქონზე** ჩანს (ანიმაცია და
       ფერი `index.css`-იდან) — ფონის კვადრატი მოიხსნა. ტექსტიან ღილაკს ფონი
       რჩება: იქ ის ღილაკის საზღვარია და არა აიქონის მორთულობა. */
    compoundVariants: [
      { size: 'icon', variant: ['ghost', 'outline'], class: 'hover:bg-transparent' },
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

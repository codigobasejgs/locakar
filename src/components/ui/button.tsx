import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-magenta to-brand text-white shadow-[0_0_0_1px_rgb(255_255_255/0.08)_inset] hover:shadow-glow hover:brightness-110",
        whatsapp: "bg-[#25D366] text-[#052e16] hover:bg-[#2fe277] hover:shadow-[0_10px_40px_-10px_rgb(37_211_102/0.7)]",
        outline: "border border-line-strong bg-white/[0.03] text-white hover:border-brand-soft/50 hover:bg-white/[0.07]",
        ghost: "text-muted hover:bg-white/[0.06] hover:text-white",
        danger: "bg-red-500/90 text-white hover:bg-red-500",
        light: "bg-white text-ink hover:bg-zinc-200",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-sm sm:text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

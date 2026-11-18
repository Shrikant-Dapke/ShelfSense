import { cn } from "cn"

/**
 * Restrained shimmer: a translucent highlight sweeps across a muted block.
 * The global prefers-reduced-motion rule in globals.css neutralizes the
 * animation, and motion-reduce hides the highlight entirely.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-lg bg-canvas dark:bg-muted/70",
        "after:absolute after:inset-0 after:animate-[ss-shimmer_1.8s_linear_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/45 after:to-transparent motion-reduce:after:hidden dark:after:via-white/5",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }

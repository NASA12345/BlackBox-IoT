import * as React from "react"
import { cn } from "../utils"

const badgeVariants = {
  default: "border transparent bg-primary text-primary-foreground hover:bg-primary/80",
  secondary: "border transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "border transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
  outline: "text-foreground",
  success: "border transparent bg-green-600 text-white hover:bg-green-700",
  warning: "border transparent bg-yellow-600 text-white hover:bg-yellow-700",
  info: "border transparent bg-blue-600 text-white hover:bg-blue-700",
}

const Badge = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      badgeVariants[variant],
      className
    )}
    {...props}
  />
))
Badge.displayName = "Badge"

export { Badge, badgeVariants }

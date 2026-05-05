import type { Variants } from 'framer-motion'

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
}

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  enter: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: 'easeOut' },
  }),
}

export const badgeUnlockVariants: Variants = {
  initial: { scale: 0, rotate: -15, opacity: 0 },
  enter: {
    scale: 1, rotate: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 500, damping: 18, mass: 0.8 },
  },
}

export const progressVariants: Variants = {
  initial: { scaleX: 0, originX: 0 },
  enter: { scaleX: 1, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] } },
}

export const sidebarItemVariants: Variants = {
  initial: { opacity: 0, x: -12 },
  enter: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, duration: 0.2 },
  }),
}

export const hoverScale = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 25 },
}

export const hoverLift = {
  whileHover: { y: -3, transition: { duration: 0.2 } },
  whileTap: { y: 0 },
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: { duration: 0.3 } },
}

export const listVariants: Variants = {
  initial: { opacity: 0 },
  enter: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

export const listItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.25 } },
}

'use client'

import { motion } from 'framer-motion'
import { pageVariants } from '@/lib/animations'

export function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="enter" exit="exit">
      {children}
    </motion.div>
  )
}

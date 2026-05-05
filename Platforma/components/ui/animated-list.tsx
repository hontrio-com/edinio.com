'use client'

import { motion } from 'framer-motion'
import { listVariants, listItemVariants } from '@/lib/animations'

export function AnimatedList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={listVariants} initial="initial" animate="enter" className={className}>
      {children}
    </motion.div>
  )
}

export function AnimatedListItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={listItemVariants} className={className}>
      {children}
    </motion.div>
  )
}

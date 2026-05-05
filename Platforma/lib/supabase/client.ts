import { createBrowserClient } from '@supabase/ssr'

// Browser client without Database generic — avoids TS inference issues with custom types.
// Use explicit type casts at call sites if needed.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

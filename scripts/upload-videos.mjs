import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { resolve } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const BUCKET = 'course-videos'
const LOCAL_FOLDER = './video-ai'

// Mapare fișier local → cale în bucket
const VIDEO_MAP = [
  { file: 'lectia-1.mp4', storagePath: 'video-ai/lectia-1.mp4', lessonTitle: 'Lecția 1' },
  { file: 'lectia-2.mp4', storagePath: 'video-ai/lectia-2.mp4', lessonTitle: 'Lecția 2' },
  { file: 'lectia-3.mp4', storagePath: 'video-ai/lectia-3.mp4', lessonTitle: 'Lecția 3' },
  { file: 'lectia-4.mp4', storagePath: 'video-ai/lectia-4.mp4', lessonTitle: 'Lecția 4' },
  { file: 'lectia-5.mp4', storagePath: 'video-ai/lectia-5.mp4', lessonTitle: 'Lecția 5' },
  { file: 'lectia-6.mp4', storagePath: 'video-ai/lectia-6.mp4', lessonTitle: 'Lecția 6' },
  { file: 'lectia-7.mp4', storagePath: 'video-ai/lectia-7.mp4', lessonTitle: 'Lecția 7' },
]

async function uploadFile(entry) {
  const localPath = resolve(LOCAL_FOLDER, entry.file)

  if (!existsSync(localPath)) {
    console.log(`  ⏭  Sărit — fișier negăsit: ${entry.file}`)
    return { success: false, skipped: true }
  }

  const sizeMB = (statSync(localPath).size / 1024 / 1024).toFixed(1)
  console.log(`\n📤 ${entry.lessonTitle} — ${entry.file} (${sizeMB} MB)`)

  const fileBuffer = readFileSync(localPath)

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(entry.storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
      cacheControl: '3600',
    })

  if (error) {
    console.error(`  ❌ Eroare: ${error.message}`)
    return { success: false }
  }

  console.log(`  ✅ Uploaded → ${data.path}`)
  console.log(`  📋 Rulează în SQL Editor pentru a lega lecția de video:`)
  console.log(`     UPDATE lessons SET storage_path = '${entry.storagePath}'`)
  console.log(`     WHERE title_ro ILIKE '%${entry.lessonTitle.replace('Lecția ', '')}%';`)

  return { success: true, storagePath: entry.storagePath }
}

async function main() {
  console.log('════════════════════════════════════════════')
  console.log('🎬 Edinio — Upload video-uri în Supabase Storage')
  console.log(`📦 Bucket: ${BUCKET}`)
  console.log(`📁 Folder local: ${resolve(LOCAL_FOLDER)}`)
  console.log('════════════════════════════════════════════')

  if (!existsSync(LOCAL_FOLDER)) {
    console.error(`❌ Folderul ${LOCAL_FOLDER} nu există.`)
    console.log(`   Creează-l și copiază video-urile din public/videoclipuri/:`)
    console.log(`   mkdir video-uploads`)
    console.log(`   copy public\\videoclipuri\\*.mp4 video-uploads\\`)
    process.exit(1)
  }

  const localFiles = readdirSync(LOCAL_FOLDER).filter(f => f.endsWith('.mp4'))
  console.log(`\n📹 Fișiere găsite: ${localFiles.length}`)
  localFiles.forEach(f => {
    const sizeMB = (statSync(resolve(LOCAL_FOLDER, f)).size / 1024 / 1024).toFixed(1)
    console.log(`   • ${f} (${sizeMB} MB)`)
  })

  let uploaded = 0, failed = 0, skipped = 0

  for (const entry of VIDEO_MAP) {
    const result = await uploadFile(entry)
    if (result.success) uploaded++
    else if (result.skipped) skipped++
    else failed++
  }

  console.log('\n════════════════════════════════════════════')
  console.log(`✅ Uploadate: ${uploaded}`)
  console.log(`⏭  Sărite:   ${skipped}`)
  console.log(`❌ Eșuate:   ${failed}`)
  console.log('════════════════════════════════════════════')
  console.log('\n📌 Verifică storage_path în DB:')
  console.log('SELECT id, title_ro, storage_path FROM lessons ORDER BY sort_order;')
}

main().catch(console.error)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { code, video_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Chercher le code en base
  const { data, error } = await supabase
    .from('codes')
    .select('id, full_code')
    .eq('video_id', video_id)

  console.log('CODES EN DB:', data)
  console.log('CODE REÇU:', code)

  return NextResponse.json({ db: data, recu: code })
}
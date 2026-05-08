import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { code, video_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data } = await supabase
    .from('codes')
    .select('id, full_code')
    .eq('video_id', video_id)

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 })
  }

  const normalizedInput = code.trim().toUpperCase().replace(/-/g, '')
  const match = data.find(
    c => c.full_code.trim().toUpperCase().replace(/-/g, '') === normalizedInput
  )

  if (!match) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
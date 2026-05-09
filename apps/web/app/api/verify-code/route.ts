import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const code = body.code
  const video_id = body.video_id
  const token = body.token

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return NextResponse.json({ success: false, message: 'Non authentifié' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('codes')
    .select('id, full_code')
    .eq('video_id', video_id)

  if (!data || data.length === 0) {
    return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
  }

  const normalizedInput = code.trim().toUpperCase().replace(/-/g, '')
  const match = data.find(c => c.full_code.trim().toUpperCase().replace(/-/g, '') === normalizedInput)

  if (!match) {
    return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
  }

  await supabase.from('code_submissions').insert({
    membre_id: user.id,
    video_id,
    submitted_code: code,
    is_correct: true,
    points_awarded: 100,
  })

  return NextResponse.json({ success: true, points_awarded: 100 })
}
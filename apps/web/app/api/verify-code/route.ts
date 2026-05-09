import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const code = body.code
  const video_id = body.video_id
  const token = body.token

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  console.log("URL OK:", !!supabaseUrl)
  console.log("KEY OK:", !!supabaseKey)
  console.log("VIDEO_ID:", video_id)
  console.log("CODE:", code)

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return NextResponse.json({ success: false, message: 'Non authentifié' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('codes')
    .select('id, full_code, points_value')
    .eq('video_id', video_id)

  console.log("DATA:", JSON.stringify(data))
  console.log("ERROR:", JSON.stringify(error))

  if (!data || data.length === 0) {
    return NextResponse.json({ success: false, message: 'Code incorrect', debug: { error } }, { status: 400 })
  }

  const normalizedInput = code.trim().toUpperCase().replace(/-/g, '')
  const match = data.find(c => c.full_code.trim().toUpperCase().replace(/-/g, '') === normalizedInput)

  if (!match) {
    return NextResponse.json({ success: false, message: 'Code incorrect', debug: { normalizedInput, codesEnDB: data.map(c => c.full_code) } }, { status: 400 })
  }

  await supabase.from('code_submissions').insert({
    membre_id: user.id,
    video_id,
    submitted_code: code,
    is_correct: true,
    points_awarded: match.points_value || 100,
  })

  return NextResponse.json({ success: true, points_awarded: match.points_value || 100 })
}
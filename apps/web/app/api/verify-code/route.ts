import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function normalizeSubmittedCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "")
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const code = typeof body.code === "string" ? body.code : ""
  const video_id = typeof body.video_id === "string" ? body.video_id.trim() : ""
  const token = body.token

  if (!code.trim()) {
    return NextResponse.json({ success: false, message: "Code requis" }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return NextResponse.json({ success: false, message: 'Non authentifié' }, { status: 401 })
  }

  const normalizedInput = normalizeSubmittedCode(code)

  let matchedVideoId = video_id

  if (video_id) {
    const { data, error } = await supabase
      .from('codes')
      .select('id, full_code')
      .eq('video_id', video_id)

    if (error || !data || data.length === 0) {
      return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
    }

    const match = data.find(c => normalizeSubmittedCode(c.full_code) === normalizedInput)
    if (!match) {
      return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
    }
  } else {
    const { data: allCodes, error } = await supabase
      .from('codes')
      .select('id, full_code, video_id')

    if (error || !allCodes || allCodes.length === 0) {
      return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
    }

    const match = allCodes.find(c => normalizeSubmittedCode(c.full_code) === normalizedInput)
    if (!match || typeof match.video_id !== "string") {
      return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
    }

    const { data: videoRow } = await supabase
      .from('videos')
      .select('id')
      .eq('id', match.video_id)
      .maybeSingle()

    if (!videoRow) {
      return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
    }

    matchedVideoId = match.video_id
  }

  const { data: vid } = await supabase
    .from('videos')
    .select('points_value')
    .eq('id', matchedVideoId)
    .maybeSingle()

  const pointsAwarded = Number(vid?.points_value) || 100

  await supabase.from('code_submissions').insert({
    membre_id: user.id,
    video_id: matchedVideoId,
    submitted_code: code,
    is_correct: true,
    points_awarded: pointsAwarded,
  })

  return NextResponse.json({ success: true, video_id: matchedVideoId })
}
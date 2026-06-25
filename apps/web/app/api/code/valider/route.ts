import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const SB_URL = "https://lrolatbudvianeazliax.supabase.co"
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4"
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { video_id, submitted_code } = body
  if (!video_id || !submitted_code) return NextResponse.json({ success: false, error: 'Champs manquants' }, { status: 400 })
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || ''
  const supabase = createClient(SB_URL, SB_KEY)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ success: false, error: 'Non authentifie' }, { status: 401 })
  const { data: codeData } = await supabase.from('codes').select('full_code').eq('video_id', video_id).single()
  if (!codeData) return NextResponse.json({ success: false, message: 'Code non trouve' })
  if (codeData.full_code.toUpperCase() !== submitted_code.toUpperCase()) return NextResponse.json({ success: false, message: 'Code incorrect' })
  const { data: vid } = await supabase.from('videos').select('points_value, title').eq('id', video_id).single()
  const points = vid?.points_value || 15
  await supabase.from('code_submissions').insert({ membre_id: user.id, video_id, submitted_code, is_correct: true, points_awarded: points })

  return NextResponse.json({ success: true, points_awarded: points })
}

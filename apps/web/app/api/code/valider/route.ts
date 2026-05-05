import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const supabase = createClient("https://lrolatbudvianeazliax.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4")
export async function POST(request: NextRequest) {
  const { video_id, submitted_code, membre_id } = await request.json()
  if (!video_id || !submitted_code || !membre_id) return NextResponse.json({ success: false, error: 'Champs manquants' }, { status: 400 })
  const { data: codeData } = await supabase.from('codes').select('full_code').eq('video_id', video_id).single()
  if (!codeData) return NextResponse.json({ success: false, message: 'Code non trouvé' })
  const isCorrect = codeData.full_code.toUpperCase() === submitted_code.toUpperCase()
  if (!isCorrect) return NextResponse.json({ success: false, message: 'Code incorrect' })
  const { data: video } = await supabase.from('videos').select('points_value').eq('id', video_id).single()
  const points = video?.points_value || 15
  await supabase.from('code_submissions').insert({ membre_id, video_id, submitted_code, is_correct: true, points_awarded: points })
  await supabase.from('points_transactions').insert({ membre_id, type: 'code', amount: points, description: 'Code vidéo soumis' })
  return NextResponse.json({ success: true, points_awarded: points })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { code, video_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 1. Trouver le code en base
  const { data: codes } = await supabase
    .from('codes')
    .select('id, full_code, points_value')
    .eq('video_id', video_id)

  if (!codes || codes.length === 0) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 })
  }

  // 2. Comparer
  const normalizedInput = code.trim().toUpperCase().replace(/-/g, '')
  const match = codes.find(
    c => c.full_code.trim().toUpperCase().replace(/-/g, '') === normalizedInput
  )

  if (!match) {
    return NextResponse.json({ error: 'Code incorrect' }, { status: 400 })
  }

  // 3. Récupérer le token user
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser(token)

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // 4. Enregistrer la soumission
  const points = match.points_value || 100

  await supabase.from('code_submissions').insert({
    membre_id: user.id,
    video_id: video_id,
    submitted_code: code,
    is_correct: true,
    points_awarded: points,
  })

  return NextResponse.json({ success: true, points_awarded: points })
}
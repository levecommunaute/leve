import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { code, video_id, token } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Vérifier l'utilisateur
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) {
    return NextResponse.json({ success: false, message: 'Non authentifié' }, { status: 401 })
  }

  // Chercher le code
  const { data } = await supabase
    .from('codes')
    .select('id, full_code, points_value')
    .eq('video_id', video_id)

  if (!data || data.length === 0) {
    return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
  }

  const normalizedInput = code.trim().toUpperCase().replace(/-/g, '')
  const match = data.find(
    c => c.full_code.trim().toUpperCase().replace(/-/g, '') === normalizedInput
  )

  if (!match) {
    return NextResponse.json({ success: false, message: 'Code incorrect' }, { status: 400 })
  }

  // Enregistrer la soumission
  await supabase.from('code_submissions').insert({
    membre_id: user.id,
    video_id,
    submitted_code: code,
    is_correct: true,
    points_awarded: match.points_value || 100,
  })

  return NextResponse.json({ success: true, points_awarded: match.points_value || 100 })
}
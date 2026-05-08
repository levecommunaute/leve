import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  console.log('BODY REÇU:', body)
  return NextResponse.json({ received: body })
}
import { NextResponse } from "next/server";
import {
  dollarsToPtcUnits,
  getPtcBalance,
  getPtcSourcesTotals,
} from "../../../../lib/ptc";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [ptcBalance, sources] = await Promise.all([
      getPtcBalance(),
      getPtcSourcesTotals(),
    ]);

    return NextResponse.json({
      ptc_balance: ptcBalance,
      ptc_units: dollarsToPtcUnits(ptcBalance),
      sources,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

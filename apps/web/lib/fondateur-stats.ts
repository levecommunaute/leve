import { getServiceSupabase } from "./admin-server";

const MIN_NUMERO = 11;
const MAX_NUMERO = 10010;
const PAGE_SIZE = 1000;

export async function countFondateurMembresInscrits(): Promise<number> {
  const supabase = getServiceSupabase();
  let offset = 0;
  let total = 0;

  while (true) {
    const { data, error } = await supabase
      .from("profiles")
      .select("numero_membre")
      .not("numero_membre", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      const raw = String(row.numero_membre ?? "").trim();
      if (!/^\d+$/.test(raw)) continue;
      const n = Number.parseInt(raw, 10);
      if (n >= MIN_NUMERO && n <= MAX_NUMERO) total += 1;
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return total;
}

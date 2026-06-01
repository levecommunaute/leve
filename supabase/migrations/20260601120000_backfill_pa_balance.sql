-- Alimenter pa_balance depuis les achats PA historiques (cost_usd = pts × 5 $)

UPDATE public.banque_leve
SET pa_balance = (
  SELECT COALESCE(SUM(cost_usd), 0)
  FROM public.pa_transactions
  WHERE type = 'purchase'
);

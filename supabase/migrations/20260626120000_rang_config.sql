-- Configuration des seuils de rang et bonus quiz mensuels

CREATE TABLE IF NOT EXISTS public.rang_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seuil_bronze numeric NOT NULL DEFAULT 0,
  seuil_argent numeric NOT NULL DEFAULT 100,
  seuil_or numeric NOT NULL DEFAULT 300,
  seuil_diamant numeric NOT NULL DEFAULT 600,
  bonus_bronze numeric NOT NULL DEFAULT 0,
  bonus_argent numeric NOT NULL DEFAULT 0.15,
  bonus_or numeric NOT NULL DEFAULT 0.35,
  bonus_diamant numeric NOT NULL DEFAULT 0.60,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rang_config_seuils_check CHECK (
    seuil_bronze >= 0
    AND seuil_argent >= seuil_bronze
    AND seuil_or >= seuil_argent
    AND seuil_diamant >= seuil_or
  ),
  CONSTRAINT rang_config_bonus_check CHECK (
    bonus_bronze >= 0
    AND bonus_argent >= 0
    AND bonus_or >= 0
    AND bonus_diamant >= 0
  )
);

CREATE OR REPLACE FUNCTION public.rang_config_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rang_config_updated_at ON public.rang_config;
CREATE TRIGGER rang_config_updated_at
  BEFORE UPDATE ON public.rang_config
  FOR EACH ROW
  EXECUTE FUNCTION public.rang_config_set_updated_at();

ALTER TABLE public.rang_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rang_config_select_public ON public.rang_config;
CREATE POLICY rang_config_select_public
  ON public.rang_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.rang_config (
  seuil_bronze,
  seuil_argent,
  seuil_or,
  seuil_diamant,
  bonus_bronze,
  bonus_argent,
  bonus_or,
  bonus_diamant
)
SELECT 0, 100, 300, 600, 0, 0.15, 0.35, 0.60
WHERE NOT EXISTS (SELECT 1 FROM public.rang_config);

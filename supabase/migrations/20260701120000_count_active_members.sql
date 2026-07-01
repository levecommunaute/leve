-- Compte les membres actifs (member_type insensible à la casse).
CREATE OR REPLACE FUNCTION public.count_active_members()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.profiles
  WHERE LOWER(TRIM(member_type)) IN (
    'communaute',
    'communauté',
    'pionnier',
    'fondateur',
    'collaborateur'
  );
$$;

COMMENT ON FUNCTION public.count_active_members() IS
  'Nombre de profils avec member_type actif (communaute, pionnier, fondateur, collaborateur), casse et accent ignorés.';

GRANT EXECUTE ON FUNCTION public.count_active_members() TO service_role;

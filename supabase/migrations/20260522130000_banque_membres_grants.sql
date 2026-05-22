-- Accès lecture pour les membres connectés (RLS filtre par membre_id = auth.uid())
GRANT SELECT ON TABLE public.banque_membres TO authenticated;
GRANT SELECT ON TABLE public.banque_membres_mouvements TO authenticated;

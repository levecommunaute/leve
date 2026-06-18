-- Cron quotidien : appelle l'Edge Function `beta-rappel-inactivite` à 10h UTC
-- pour relancer par courriel les beta testeurs inactifs depuis 3 jours.

-- Extensions requises : pg_cron (planification) + pg_net (appel HTTP).
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- La clé service role doit être stockée une seule fois dans Vault pour autoriser
-- l'appel à l'Edge Function depuis pg_cron. Exécuter manuellement (hors migration) :
--
--   select vault.create_secret(
--     '<SERVICE_ROLE_KEY>',
--     'beta_rappel_service_role_key',
--     'Clé service role pour le cron beta-rappel-inactivite'
--   );
--
-- (ou mettre à jour le secret existant via vault.update_secret).

-- Supprime le job existant s'il a déjà été créé (idempotence).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'beta-rappel-inactivite') THEN
    PERFORM cron.unschedule('beta-rappel-inactivite');
  END IF;
END;
$$;

SELECT cron.schedule(
  'beta-rappel-inactivite',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrolatbudvianeazliax.supabase.co/functions/v1/beta-rappel-inactivite',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'beta_rappel_service_role_key'
        LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

BEGIN;

-- Preserve the existing pg_net HTTP response history before recreating the
-- non-relocatable extension. This archive remains in the private schema.
CREATE TABLE private.pg_net_http_response_archive_20261126
AS TABLE net._http_response;

-- No queued requests were present at preflight. Pause only the push-delivery
-- cron job while replacing the extension.
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'ffvf-push-delivery';

DROP EXTENSION pg_net;
DROP SCHEMA IF EXISTS net;

CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- Restore the same scheduled push-delivery task.
SELECT cron.schedule(
  'ffvf-push-delivery',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://ugtzmtmsfaajclftfeuz.supabase.co/functions/v1/send-push',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-ffvf-cron-token',
        (SELECT decrypted_secret
         FROM vault.decrypted_secrets
         WHERE name='ffvf_cron_token'
         ORDER BY created_at DESC
         LIMIT 1)
      ),
      timeout_milliseconds := 10000
    );
  $job$
);

COMMIT;
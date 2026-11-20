SELECT cron.schedule(
  'ffvf-push-delivery',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://tvdxbyzvkjiebwslmnvj.supabase.co/functions/v1/send-push',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-ffvf-cron-token',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='ffvf_cron_token' ORDER BY created_at DESC LIMIT 1)
      ),
      timeout_milliseconds := 10000
    );
  $job$
);
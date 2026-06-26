
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove qualquer agendamento anterior com o mesmo nome
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname = 'refresh-flyers-daily';

SELECT cron.schedule(
  'refresh-flyers-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--3b30a666-bdbf-4d56-bbb7-750e826b7707.lovable.app/api/public/hooks/refresh-flyers',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_ZzTqg0Lr3s8Y1MNisDLa9g_XP-jUfnH"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

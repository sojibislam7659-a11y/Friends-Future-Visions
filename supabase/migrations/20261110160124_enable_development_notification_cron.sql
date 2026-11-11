-- Development-only: restore the reminder schedules used by Main.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'ffvf-meeting-reminders',
  '* * * * *',
  'SELECT private.issue_meeting_reminders();'
);

SELECT cron.schedule(
  'ffvf-monthly-due-reminders',
  '0 3 1 * *',
  'SELECT private.issue_monthly_due_reminders();'
);
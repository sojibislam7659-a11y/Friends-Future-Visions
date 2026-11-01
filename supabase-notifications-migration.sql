-- Oikko notification and notice foundation
-- Additive/idempotent migration. Review and run in Supabase SQL Editor.
-- Does not expose push endpoint details or VAPID secrets to browser code.

begin;

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  notice_type text not null default 'general'
    check (notice_type in ('general','meeting','reminder')),
  meeting_at timestamptz,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_notice_requires_time
    check (notice_type <> 'meeting' or meeting_at is not null)
);

create index if not exists notices_published_at_idx
  on public.notices (published_at desc)
  where published = true;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_id uuid references public.notices(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  notification_type text not null default 'general'
    check (notification_type in ('general','monthly_due','meeting','system')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_pending_idx
  on public.notifications (scheduled_for)
  where sent_at is null and scheduled_for is not null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.notices enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- Notices: authenticated users can read published notices; only super admins manage them.
drop policy if exists notices_read_published on public.notices;
create policy notices_read_published
  on public.notices for select to authenticated
  using (published = true or public.is_super_admin());

drop policy if exists notices_super_admin_manage on public.notices;
create policy notices_super_admin_manage
  on public.notices for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Inbox: a member sees and marks only their own notifications.
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Remove the earlier client-side INSERT policy if this migration was previously applied.
drop policy if exists notifications_super_admin_insert on public.notifications;

-- Inbox rows are created only by trusted server-side code (service_role).
-- Clients must never fabricate or alter notification content.

-- A user can register, refresh, or remove only their own browser push subscription.
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

grant select on public.notices to authenticated;
grant insert, update, delete on public.notices to authenticated;

-- Notification recipients may read their own inbox and mark only read_at.
-- Revoke the earlier broad table-level grants, including the previous INSERT grant.
revoke insert, update on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

commit;

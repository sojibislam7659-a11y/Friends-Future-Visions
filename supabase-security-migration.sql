-- Friends Future Vision: Super Admin-only committee data management.
-- Apply to the MAIN Supabase project only after reviewing this migration.
-- Members and admin role are read-only. Members may submit profile-change
-- requests and upload a photo to their own folder; approval is manual.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'super_admin'
  );
$$;
revoke all on function private.is_super_admin() from public, anon;
grant execute on function private.is_super_admin() to authenticated;

revoke all on function public.is_committee_admin() from public, anon, authenticated;
revoke all on function public.is_super_admin() from public, anon, authenticated;
-- Preserve the ensure_rls event trigger; revoke direct RPC execution only.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

alter table public.members add column if not exists profile_photo_path text;

create table if not exists public.profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  submitted_by uuid not null default auth.uid() references auth.users(id),
  requested_changes jsonb not null default '{}'::jsonb,
  requested_photo_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profile_change_requests_nonempty
    check (requested_changes <> '{}'::jsonb or requested_photo_path is not null)
);

create index if not exists idx_financial_transactions_member_id
  on public.financial_transactions(member_id);
create index if not exists idx_financial_transactions_created_by
  on public.financial_transactions(created_by);
create index if not exists idx_payment_submissions_member_id
  on public.payment_submissions(member_id);
create index if not exists idx_payment_submissions_submitted_by
  on public.payment_submissions(submitted_by);
create index if not exists idx_payment_submissions_reviewed_by
  on public.payment_submissions(reviewed_by);
create index if not exists idx_profile_change_requests_member_id
  on public.profile_change_requests(member_id);
create index if not exists idx_profile_change_requests_submitted_by
  on public.profile_change_requests(submitted_by);
create index if not exists idx_profile_change_requests_reviewed_by
  on public.profile_change_requests(reviewed_by);

drop policy if exists "Members: admin full access" on public.members;
drop policy if exists "Members: Super Admin full access" on public.members;
drop policy if exists "Members: read own profile" on public.members;
create policy "Members: Super Admin full access"
  on public.members for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
create policy "Members: read own profile"
  on public.members for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists "Transactions: admin full access" on public.financial_transactions;
drop policy if exists "Transactions: Super Admin full access" on public.financial_transactions;
drop policy if exists "Transactions: read own entries" on public.financial_transactions;
create policy "Transactions: Super Admin full access"
  on public.financial_transactions for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
create policy "Transactions: read own entries"
  on public.financial_transactions for select to authenticated
  using (exists (
    select 1 from public.members m
    where m.id = financial_transactions.member_id
      and m.auth_user_id = (select auth.uid())
  ));

drop policy if exists "Payments: admin full access" on public.payment_submissions;
drop policy if exists "Payments: Super Admin full access" on public.payment_submissions;
create policy "Payments: Super Admin full access"
  on public.payment_submissions for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

drop policy if exists "Profiles: own or admin can view" on public.profiles;
drop policy if exists "Profiles: super admin can insert" on public.profiles;
drop policy if exists "Profiles: super admin can update" on public.profiles;
drop policy if exists "Profiles: Super Admin full access" on public.profiles;
drop policy if exists "Profiles: read own profile" on public.profiles;
create policy "Profiles: Super Admin full access"
  on public.profiles for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
create policy "Profiles: read own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

alter table public.profile_change_requests enable row level security;
drop policy if exists "Profile requests: Super Admin full access" on public.profile_change_requests;
drop policy if exists "Profile requests: member reads own" on public.profile_change_requests;
drop policy if exists "Profile requests: member submits own pending request" on public.profile_change_requests;
create policy "Profile requests: Super Admin full access"
  on public.profile_change_requests for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
create policy "Profile requests: member reads own"
  on public.profile_change_requests for select to authenticated
  using (submitted_by = (select auth.uid()));
create policy "Profile requests: member submits own pending request"
  on public.profile_change_requests for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      requested_photo_path is null
      or requested_photo_path like ((select auth.uid())::text || '/%')
    )
    and exists (
      select 1 from public.members m
      where m.id = profile_change_requests.member_id
        and m.auth_user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.financial_transactions to authenticated;
grant select, insert, update, delete on public.payment_submissions to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_change_requests to authenticated;

-- Safe directory projection: names and approved photo paths only.
drop view if exists public.member_directory;
create table if not exists public.member_directory (
  member_id uuid primary key references public.members(id) on delete cascade,
  member_no text,
  full_name text not null,
  full_name_bn text,
  profile_photo_path text,
  status text not null
);

create or replace function private.sync_member_directory()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.member_directory where member_id = old.id;
    return old;
  end if;
  if new.status = 'active' then
    insert into public.member_directory
      (member_id, member_no, full_name, full_name_bn, profile_photo_path, status)
    values
      (new.id, new.member_no, new.full_name, new.full_name_bn, new.profile_photo_path, new.status)
    on conflict (member_id) do update set
      member_no = excluded.member_no,
      full_name = excluded.full_name,
      full_name_bn = excluded.full_name_bn,
      profile_photo_path = excluded.profile_photo_path,
      status = excluded.status;
  else
    delete from public.member_directory where member_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_member_directory() from public, anon, authenticated;
drop trigger if exists sync_member_directory_after_member_change on public.members;
create trigger sync_member_directory_after_member_change
after insert or update of member_no, full_name, full_name_bn, profile_photo_path, status or delete
on public.members for each row execute function private.sync_member_directory();

insert into public.member_directory
  (member_id, member_no, full_name, full_name_bn, profile_photo_path, status)
select id, member_no, full_name, full_name_bn, profile_photo_path, status
from public.members where status = 'active'
on conflict (member_id) do update set
  member_no = excluded.member_no,
  full_name = excluded.full_name,
  full_name_bn = excluded.full_name_bn,
  profile_photo_path = excluded.profile_photo_path,
  status = excluded.status;

alter table public.member_directory enable row level security;
drop policy if exists "Directory: authenticated read" on public.member_directory;
drop policy if exists "Directory: Super Admin full access" on public.member_directory;
create policy "Directory: authenticated read"
  on public.member_directory for select to authenticated using (true);
create policy "Directory: Super Admin full access"
  on public.member_directory for all to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));
grant select, insert, update, delete on public.member_directory to authenticated;

-- Private photo bucket. Only a member can upload into their own UID folder.
-- Authenticated members may view approved directory photos; Super Admin has
-- full storage control. A photo is not published until its path is approved
-- and saved to members.profile_photo_path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-profile-photos', 'member-profile-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  name = excluded.name, public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Member photos: Super Admin full access" on storage.objects;
drop policy if exists "Member photos: upload own folder" on storage.objects;
drop policy if exists "Member photos: read own folder" on storage.objects;
drop policy if exists "Member photos: authenticated directory photo read" on storage.objects;
create policy "Member photos: Super Admin full access"
  on storage.objects for all to authenticated
  using (bucket_id = 'member-profile-photos' and (select private.is_super_admin()))
  with check (bucket_id = 'member-profile-photos' and (select private.is_super_admin()));
create policy "Member photos: upload own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-profile-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Member photos: authenticated directory photo read"
  on storage.objects for select to authenticated
  using (bucket_id = 'member-profile-photos');

revoke all on storage.buckets from anon, authenticated;

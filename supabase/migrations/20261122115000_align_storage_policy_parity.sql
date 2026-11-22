-- Align the one remaining Production Storage RLS policy difference with Development.
-- This migration changes policy metadata only; it does not move, rewrite, or delete objects.

begin;

do $preflight$
begin
  if (
    select count(*) from storage.buckets
    where id in (
      'committee-documents','committee-proofs','member-private-documents',
      'member-profile-photos','payment-qr'
    )
  ) <> 5 then
    raise exception 'Preflight failed: expected all five private Storage buckets';
  end if;

  if exists (
    select 1 from storage.buckets
    where
      (id in ('committee-documents','committee-proofs','member-private-documents')
        and (public or file_size_limit <> 10485760
          or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp','application/pdf']::text[]))
      or (id='member-profile-photos'
        and (public or file_size_limit <> 5242880
          or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']::text[]))
      or (id='payment-qr'
        and (public or file_size_limit <> 2097152
          or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']::text[]))
  ) then
    raise exception 'Preflight failed: Storage bucket privacy or upload limits differ from Development';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='members' and column_name='nominee_photo_path'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='members' and column_name='auth_user_id'
  ) then
    raise exception 'Preflight failed: nominee photo ownership columns are missing';
  end if;

  if to_regprocedure('private.is_super_admin()') is null
     or to_regprocedure('private.has_portal_access()') is null then
    raise exception 'Preflight failed: portal authorization helpers are missing';
  end if;
end
$preflight$;

-- Production called this policy "Super Admin upload"; Development uses
-- "Super Admin insert". Recreate the Development name and condition exactly.
drop policy if exists "Private member docs: Super Admin upload" on storage.objects;
drop policy if exists "Private member docs: Super Admin insert" on storage.objects;
create policy "Private member docs: Super Admin insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'member-private-documents'
  and (select private.is_super_admin())
);

-- Members may read their own nominee photo when its Storage path is linked
-- from their own members row. All other private documents remain owner/admin only.
drop policy if exists "Private member docs: owner or Super Admin read" on storage.objects;
create policy "Private member docs: owner or Super Admin read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-private-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.is_super_admin())
    or exists (
      select 1
      from public.members m
      where m.nominee_photo_path = objects.name
        and m.auth_user_id = (select auth.uid())
    )
  )
);

commit;

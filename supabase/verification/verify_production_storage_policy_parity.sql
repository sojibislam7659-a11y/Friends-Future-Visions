-- Read-only Storage policy and bucket parity check for an isolated restore rehearsal.

do $verify$
declare
  v_count integer;
begin
  if (
    select count(*) from storage.buckets
    where id in (
      'committee-documents','committee-proofs','member-private-documents',
      'member-profile-photos','payment-qr'
    ) and not public
  ) <> 5 then
    raise exception 'All five Storage buckets must remain private';
  end if;

  if exists (
    select 1 from storage.buckets
    where
      (id in ('committee-documents','committee-proofs','member-private-documents')
        and (file_size_limit <> 10485760
          or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp','application/pdf']::text[]))
      or (id='member-profile-photos'
        and (file_size_limit <> 5242880
          or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']::text[]))
      or (id='payment-qr'
        and (file_size_limit <> 2097152
          or allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp']::text[]))
  ) then
    raise exception 'Storage bucket upload limits do not match Development';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Private member docs: Super Admin insert'
      and cmd='INSERT'
      and roles='{authenticated}'
      and with_check like '%private.is_super_admin%'
  ) then
    raise exception 'Development Super Admin insert policy is missing';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Private member docs: Super Admin upload'
  ) then
    raise exception 'Legacy Production-only Super Admin upload policy remains';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Private member docs: owner or Super Admin read'
      and cmd='SELECT'
      and qual like '%nominee_photo_path%'
      and qual like '%auth_user_id%'
  ) then
    raise exception 'Member nominee photo owner-read condition is missing';
  end if;

  select count(*) into v_count
  from pg_policies where schemaname='storage' and tablename='objects';
  if v_count <> 18 then
    raise exception 'Expected 18 Storage object policies matching Development; found %',v_count;
  end if;
end
$verify$;

select count(*) as storage_object_count,
       count(*) filter(where bucket_id='member-private-documents') as private_member_document_count
from storage.objects;

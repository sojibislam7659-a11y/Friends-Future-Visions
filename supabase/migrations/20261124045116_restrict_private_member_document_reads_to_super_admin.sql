drop policy if exists "Private member docs: owner or Super Admin read" on storage.objects;
create policy "Private member docs: Super Admin or own nominee photo read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-private-documents'
  and (
    (select private.is_super_admin())
    or exists (
      select 1
      from public.members m
      where m.nominee_photo_path = objects.name
        and m.auth_user_id = (select auth.uid())
    )
  )
);
DROP POLICY IF EXISTS "Private member docs: owner or Super Admin read" ON storage.objects;
CREATE POLICY "Private member docs: owner or Super Admin read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'member-private-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT private.is_super_admin())
      OR EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.nominee_photo_path = objects.name
          AND m.auth_user_id = (SELECT auth.uid())
      )
    )
  );

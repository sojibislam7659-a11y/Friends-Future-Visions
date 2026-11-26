-- Allow an authenticated member to read only the identity documents linked to their own member row.
-- The bucket remains private; all other members' paths remain inaccessible.
DROP POLICY IF EXISTS "Private member docs: owner or Super Admin read" ON storage.objects;
CREATE POLICY "Private member docs: owner or Super Admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'member-private-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT private.is_super_admin())
      OR EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.auth_user_id = (SELECT auth.uid())
          AND objects.name IN (m.member_identity_document_path,m.nominee_nid_path,m.nominee_photo_path)
      )
    )
  );

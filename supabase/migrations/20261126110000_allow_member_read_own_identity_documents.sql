-- Allow a member to read only private documents linked to their own authenticated member record.
-- Keep the bucket private and preserve Super Admin access.
DROP POLICY IF EXISTS "Private member docs: Super Admin or own nominee photo read" ON storage.objects;
CREATE POLICY "Private member docs: Super Admin or own nominee photo read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'member-private-documents'
    AND (
      (SELECT private.is_super_admin())
      OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.auth_user_id = (SELECT auth.uid())
          AND objects.name IN (m.member_identity_document_path,m.nominee_nid_path,m.nominee_photo_path)
      )
    )
  );

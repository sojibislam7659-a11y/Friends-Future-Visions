-- Members may read only the identity documents attached to their own member row.
-- The bucket remains private. Super Admin access and the existing own nominee-photo
-- access are preserved; no folder-wide access is granted.
DROP POLICY IF EXISTS "Private member docs: Super Admin or own nominee photo read"
  ON storage.objects;

CREATE POLICY "Private member docs: Super Admin or own identity documents read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'member-private-documents'
    AND (
      (SELECT private.is_super_admin())
      OR EXISTS (
        SELECT 1
        FROM public.members AS m
        WHERE m.auth_user_id = (SELECT auth.uid())
          AND objects.name IN (
            m.member_identity_document_path,
            m.nominee_nid_path,
            m.nominee_photo_path
          )
      )
    )
  );

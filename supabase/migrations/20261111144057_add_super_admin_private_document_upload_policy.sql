DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Private member docs: Super Admin insert'
  ) THEN
    CREATE POLICY "Private member docs: Super Admin insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'member-private-documents'
        AND (SELECT private.is_super_admin())
      );
  END IF;
END
$$;

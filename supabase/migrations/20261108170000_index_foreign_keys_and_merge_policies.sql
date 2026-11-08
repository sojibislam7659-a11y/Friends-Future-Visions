-- Development performance and RLS policy consolidation.
CREATE INDEX IF NOT EXISTS committee_documents_uploaded_by_idx
  ON public.committee_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS financial_postings_created_by_idx
  ON public.financial_postings(created_by);
CREATE INDEX IF NOT EXISTS member_private_documents_member_id_idx
  ON public.member_private_documents(member_id);
CREATE INDEX IF NOT EXISTS member_private_documents_reviewed_by_idx
  ON public.member_private_documents(reviewed_by);
CREATE INDEX IF NOT EXISTS payment_methods_updated_by_idx
  ON public.payment_methods(updated_by);

DROP POLICY IF EXISTS "Committee documents: Super Admin manage" ON public.committee_documents;
CREATE POLICY "Committee documents: Super Admin insert"
  ON public.committee_documents FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_super_admin()));
CREATE POLICY "Committee documents: Super Admin update"
  ON public.committee_documents FOR UPDATE TO authenticated
  USING ((SELECT private.is_super_admin()))
  WITH CHECK ((SELECT private.is_super_admin()));
CREATE POLICY "Committee documents: Super Admin delete"
  ON public.committee_documents FOR DELETE TO authenticated
  USING ((SELECT private.is_super_admin()));

DROP POLICY IF EXISTS "Payment methods: Super Admin manage" ON public.payment_methods;
CREATE POLICY "Payment methods: Super Admin insert"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_super_admin()));
CREATE POLICY "Payment methods: Super Admin update"
  ON public.payment_methods FOR UPDATE TO authenticated
  USING ((SELECT private.is_super_admin()))
  WITH CHECK ((SELECT private.is_super_admin()));
CREATE POLICY "Payment methods: Super Admin delete"
  ON public.payment_methods FOR DELETE TO authenticated
  USING ((SELECT private.is_super_admin()));

DROP POLICY IF EXISTS "Payments: Super Admin full access" ON public.payment_submissions;
DROP POLICY IF EXISTS "Payments: members submit own pending" ON public.payment_submissions;

CREATE POLICY "Payments: members or Super Admin submit"
  ON public.payment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_super_admin())
    OR (
      submitted_by = (SELECT auth.uid())
      AND status = 'pending'
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
      AND amount > 0
      AND payment_date <= ((now() AT TIME ZONE 'Asia/Dhaka'))::date
      AND payment_method = ANY (ARRAY['bkash'::text,'nagad'::text])
      AND char_length(trim(reference_no)) BETWEEN 1 AND 100
      AND EXISTS (
        SELECT 1 FROM public.members m
        WHERE m.id = payment_submissions.member_id
          AND m.auth_user_id = (SELECT auth.uid())
          AND m.status = 'active'
      )
    )
  );

CREATE POLICY "Payments: Super Admin update"
  ON public.payment_submissions FOR UPDATE TO authenticated
  USING ((SELECT private.is_super_admin()))
  WITH CHECK ((SELECT private.is_super_admin()));

CREATE POLICY "Payments: Super Admin delete"
  ON public.payment_submissions FOR DELETE TO authenticated
  USING ((SELECT private.is_super_admin()));

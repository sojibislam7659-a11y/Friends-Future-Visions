-- Match Main's member-owned pending submission rule without granting Super Admin insert bypass.
DROP POLICY IF EXISTS "Payments: members or Super Admin submit" ON public.payment_submissions;

CREATE POLICY "Payments: members submit own pending"
ON public.payment_submissions
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = (SELECT auth.uid())
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND amount > 0
  AND payment_date <= ((now() AT TIME ZONE 'Asia/Dhaka')::date)
  AND payment_method = ANY (ARRAY['bkash'::text,'nagad'::text])
  AND char_length(trim(reference_no)) BETWEEN 1 AND 100
  AND EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.id = payment_submissions.member_id
      AND m.auth_user_id = (SELECT auth.uid())
      AND m.status = 'active'
  )
);
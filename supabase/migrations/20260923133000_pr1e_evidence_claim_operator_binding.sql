-- Preserve the existing PR 1E command, ACL, and receipt contract while fixing
-- PostgreSQL operator precedence in the evidence-attestation claim comparison.
-- The old unparenthesized expression parses as a boolean JSON extraction and
-- fails before any attestation can commit. This forward fix is reapply-safe.
DO $fix$
DECLARE
  definition text;
  old_expression text := 'e.payload->''claimIds'' @> p_payload->''claimIds'' AND e.payload->''claimIds'' <@ p_payload->''claimIds''';
  new_expression text := '(e.payload->''claimIds'') @> (p_payload->''claimIds'') AND (e.payload->''claimIds'') <@ (p_payload->''claimIds'')';
  old_count integer;
  new_count integer;
BEGIN
  SELECT pg_get_functiondef('public.pr1e_review_command(text,uuid,uuid,uuid,uuid,uuid,bigint,uuid,text,bigint,jsonb)'::regprocedure)
    INTO STRICT definition;
  old_count := (length(definition) - length(replace(definition, old_expression, ''))) / length(old_expression);
  new_count := (length(definition) - length(replace(definition, new_expression, ''))) / length(new_expression);
  IF old_count = 1 AND new_count = 0 THEN
    EXECUTE replace(definition, old_expression, new_expression);
  ELSIF old_count = 0 AND new_count = 1 THEN
    NULL; -- exact reapplication
  ELSE
    RAISE EXCEPTION 'PR1E_EVIDENCE_CLAIM_OPERATOR_SOURCE_MISMATCH';
  END IF;
END
$fix$;

-- Match the existing application/Edge source limit. The single DO statement is
-- atomic: incompatible immutable history aborts without rewriting any row.
DO $source_size_limit$
BEGIN
  LOCK TABLE public.enterprise_evidence_source_versions IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM public.enterprise_evidence_source_versions
    WHERE content_bytes <= 0 OR content_bytes > 12000000
  ) THEN
    RAISE EXCEPTION 'ENTERPRISE_SOURCE_SIZE_HISTORY_REQUIRES_REVIEW';
  END IF;

  ALTER TABLE public.enterprise_evidence_source_versions
    ADD CONSTRAINT enterprise_evidence_source_versions_size_limit_check
    CHECK (content_bytes > 0 AND content_bytes <= 12000000);
  ALTER TABLE public.enterprise_evidence_source_versions
    DROP CONSTRAINT enterprise_evidence_source_versions_content_bytes_check;
END
$source_size_limit$;

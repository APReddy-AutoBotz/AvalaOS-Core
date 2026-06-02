-- AvalaOS Core Storage Buckets And Policies
-- Creates private buckets for source uploads and generated exports.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    (
        'source-uploads',
        'source-uploads',
        FALSE,
        52428800,
        ARRAY[
            'text/plain',
            'text/markdown',
            'text/csv',
            'application/json',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
    ),
    (
        'klarity-exports',
        'klarity-exports',
        FALSE,
        52428800,
        ARRAY[
            'text/markdown',
            'application/json',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
    )
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.storage_object_org_id(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_first_segment TEXT;
BEGIN
    v_first_segment := split_part(p_name, '/', 1);

    IF v_first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN v_first_segment::UUID;
    END IF;

    RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "Avala members can read org storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Avala members can upload source objects" ON storage.objects;
DROP POLICY IF EXISTS "Avala members can update source objects" ON storage.objects;
DROP POLICY IF EXISTS "Avala members can delete source objects" ON storage.objects;

CREATE POLICY "Avala members can read org storage objects" ON storage.objects
    FOR SELECT USING (
        bucket_id IN ('source-uploads', 'klarity-exports')
        AND public.storage_object_org_id(name) IS NOT NULL
        AND public.is_active_org_member(public.storage_object_org_id(name))
    );

CREATE POLICY "Avala members can upload source objects" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'source-uploads'
        AND public.storage_object_org_id(name) IS NOT NULL
        AND public.is_active_org_member(public.storage_object_org_id(name))
    );

CREATE POLICY "Avala members can update source objects" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'source-uploads'
        AND public.storage_object_org_id(name) IS NOT NULL
        AND public.is_active_org_member(public.storage_object_org_id(name))
    )
    WITH CHECK (
        bucket_id = 'source-uploads'
        AND public.storage_object_org_id(name) IS NOT NULL
        AND public.is_active_org_member(public.storage_object_org_id(name))
    );

CREATE POLICY "Avala members can delete source objects" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'source-uploads'
        AND public.storage_object_org_id(name) IS NOT NULL
        AND public.is_active_org_member(public.storage_object_org_id(name))
    );

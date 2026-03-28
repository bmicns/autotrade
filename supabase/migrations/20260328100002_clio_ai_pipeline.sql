-- =============================================================================
-- CLIO AI Pipeline Migration
-- Supabase Dashboard > SQL Editor 에서 실행
-- =============================================================================

-- 1. pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 기존 file_chunks 테이블 삭제 후 재생성 (vector 타입 포함)
DROP TABLE IF EXISTS public.file_chunks CASCADE;

CREATE TABLE public.file_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  content     text NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  embedding   vector(1536),
  token_count integer DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_file_chunks_file ON public.file_chunks(file_id);

-- 3. 벡터 유사도 검색 함수
CREATE OR REPLACE FUNCTION match_file_chunks(
  query_embedding vector(1536),
  match_count integer DEFAULT 10,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  file_id uuid,
  content text,
  chunk_index integer,
  token_count integer,
  similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id, fc.file_id, fc.content, fc.chunk_index, fc.token_count,
    (1 - (fc.embedding <=> query_embedding))::float AS similarity
  FROM public.file_chunks fc
  WHERE 1 - (fc.embedding <=> query_embedding) > match_threshold
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. file_chunks RLS
ALTER TABLE public.file_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_chunks_select_all" ON public.file_chunks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "file_chunks_insert_all" ON public.file_chunks
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "file_chunks_delete_own" ON public.file_chunks
  FOR DELETE TO authenticated USING (true);

-- 5. messages 테이블에 document_id 추가
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

-- 6. 확인
SELECT 'Migration complete!' AS status;

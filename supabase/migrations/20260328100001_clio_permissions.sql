-- =============================================================================
-- CLIO 부서/사용자/권한 고도화 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행
-- =============================================================================

-- 1. file_permissions 테이블 (파일 공유 권한)
CREATE TABLE IF NOT EXISTS public.file_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  granted_to_user uuid REFERENCES public.users(id) ON DELETE CASCADE,
  granted_to_dept uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'read',
  granted_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_target CHECK (granted_to_user IS NOT NULL OR granted_to_dept IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fp_file ON public.file_permissions(file_id);
CREATE INDEX IF NOT EXISTS idx_fp_user ON public.file_permissions(granted_to_user);
CREATE INDEX IF NOT EXISTS idx_fp_dept ON public.file_permissions(granted_to_dept);

-- file_permissions RLS
ALTER TABLE public.file_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp_select" ON public.file_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "fp_insert" ON public.file_permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fp_delete" ON public.file_permissions FOR DELETE TO authenticated USING (true);

-- 2. departments 테이블 확장
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.users(id);
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 3. users 테이블 확장
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 4. 확인
SELECT 'Permissions migration complete!' AS status;

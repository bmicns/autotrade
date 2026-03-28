-- =============================================================================
-- 파일 공유 (접근 권한 부여) 마이그레이션
-- 파일 자체를 전송하지 않고, 읽기 권한만 기간 제한으로 공유
-- =============================================================================

-- 1. file_shares 테이블 (파일 접근 권한 기록)
create table if not exists public.file_shares (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.files(id) on delete cascade,
  shared_by   uuid not null references public.users(id) on delete cascade,
  shared_with uuid not null references public.users(id) on delete cascade,
  message_id  uuid references public.messages(id) on delete set null,
  permission  text not null default 'read',          -- read only (확장 가능)
  expires_at  timestamptz not null,                  -- 만료 시각
  created_at  timestamptz not null default now()
);

comment on table public.file_shares is '파일 접근 권한 공유 기록 (기간 제한)';

-- 인덱스
create index idx_file_shares_file      on public.file_shares(file_id);
create index idx_file_shares_shared_with on public.file_shares(shared_with);
create index idx_file_shares_expires   on public.file_shares(expires_at);

-- 2. messages 테이블에 shared_file_id 컬럼 추가
alter table public.messages
  add column if not exists shared_file_id uuid references public.files(id) on delete set null;

-- 3. RLS 정책
alter table public.file_shares enable row level security;

-- 공유 기록 조회: 공유한 사람 또는 공유받은 사람
create policy "file_shares_select"
  on public.file_shares for select
  to authenticated
  using (shared_by = auth.uid() or shared_with = auth.uid());

-- 공유 생성: 본인이 공유자
create policy "file_shares_insert"
  on public.file_shares for insert
  to authenticated
  with check (shared_by = auth.uid());

-- 공유 삭제: 공유한 사람만
create policy "file_shares_delete"
  on public.file_shares for delete
  to authenticated
  using (shared_by = auth.uid());

-- 4. files RLS 정책 업데이트: 공유받은 파일도 조회 가능하도록
-- 기존 정책 삭제 후 재생성
drop policy if exists "files_select" on public.files;

create policy "files_select"
  on public.files for select
  to authenticated
  using (
    uploaded_by = auth.uid()
    or department_id in (
      select department_id from public.users where id = auth.uid()
    )
    or id in (
      select file_id from public.file_shares
      where shared_with = auth.uid()
        and expires_at > now()
    )
  );

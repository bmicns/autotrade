-- =============================================================================
-- CLIO Platform - Supabase 데이터베이스 스키마
-- 전사 문서 관리 및 협업 플랫폼
-- =============================================================================

-- UUID 확장 활성화

-- =============================================================================
-- 1. 부서 테이블
-- =============================================================================
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                    -- 부서명
  code       text unique not null,             -- 부서 코드 (예: DEV, HR)
  created_at timestamptz not null default now()
);

comment on table public.departments is '부서 마스터 테이블';

-- =============================================================================
-- 2. 사용자 테이블 (Supabase Auth 연동)
-- =============================================================================
create table public.users (
  id            uuid primary key references auth.users on delete cascade,
  email         text unique not null,
  name          text not null,
  department_id uuid references public.departments(id) on delete set null,
  role          text not null default 'user',   -- admin | manager | user
  avatar_url    text,
  created_at    timestamptz not null default now()
);

comment on table public.users is '사용자 프로필 (auth.users 확장)';

-- =============================================================================
-- 3. 파일 테이블
-- =============================================================================
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                  -- 표시용 파일명
  type          text,                           -- MIME 타입
  size          bigint default 0,               -- 바이트 단위
  department_id uuid references public.departments(id) on delete set null,
  uploaded_by   uuid references public.users(id) on delete set null,
  status        text not null default 'completed', -- uploading | processing | completed | error
  storage_path  text,                           -- Supabase Storage 경로
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.files is '업로드된 파일 메타데이터';

-- =============================================================================
-- 4. 템플릿 테이블
-- =============================================================================
create table public.templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                  -- 템플릿 이름
  description   text,                           -- 설명
  department_id uuid references public.departments(id) on delete set null,
  scope         text not null default 'company', -- department | company (공개 범위)
  icon          text,                           -- 아이콘 식별자
  content       text,                           -- 템플릿 본문
  placeholders  jsonb default '[]'::jsonb,      -- 치환 필드 목록
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.templates is '문서 템플릿';

-- =============================================================================
-- 5. 문서 테이블
-- =============================================================================
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  content         text,                         -- 생성된 문서 내용
  template_id     uuid references public.templates(id) on delete set null,
  source_file_ids uuid[] default '{}',          -- 참조 파일 ID 배열
  instructions    text,                         -- AI 작성 지시사항
  status          text not null default 'completed', -- draft | completed
  created_by      uuid references public.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.documents is 'AI로 생성된 문서';

-- =============================================================================
-- 6. 채널 테이블
-- =============================================================================
create table public.channels (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null default 'department', -- department | direct | group
  department_id uuid references public.departments(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.channels is '메시징 채널';

-- =============================================================================
-- 7. 채널 멤버 테이블
-- =============================================================================
create table public.channel_members (
  channel_id uuid references public.channels(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (channel_id, user_id)
);

comment on table public.channel_members is '채널-사용자 매핑';

-- =============================================================================
-- 8. 메시지 테이블
-- =============================================================================
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channels(id) on delete cascade,
  sender_id       uuid references public.users(id) on delete set null,
  content         text not null,
  attachment_name text,                         -- 첨부 파일명
  attachment_size text,                         -- 첨부 파일 크기 (표시용)
  created_at      timestamptz not null default now()
);

comment on table public.messages is '채팅 메시지';

-- =============================================================================
-- 9. 감사 로그 테이블
-- =============================================================================
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  action      text not null,                    -- 수행 동작 (예: file.upload, doc.create)
  target_type text,                             -- 대상 유형 (file, document, template 등)
  target_id   uuid,                             -- 대상 ID
  details     jsonb default '{}'::jsonb,        -- 추가 상세 정보
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is '사용자 활동 감사 로그';

-- =============================================================================
-- 인덱스
-- =============================================================================

-- files 인덱스
create index idx_files_department  on public.files(department_id);
create index idx_files_uploaded_by on public.files(uploaded_by);
create index idx_files_created_at  on public.files(created_at desc);

-- messages 인덱스
create index idx_messages_channel    on public.messages(channel_id);
create index idx_messages_created_at on public.messages(created_at desc);

-- documents 인덱스
create index idx_documents_created_by on public.documents(created_by);
create index idx_documents_template   on public.documents(template_id);

-- audit_logs 인덱스
create index idx_audit_logs_user       on public.audit_logs(user_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- =============================================================================
-- Row Level Security (RLS) 정책
-- =============================================================================

-- 모든 테이블 RLS 활성화
alter table public.departments    enable row level security;
alter table public.users          enable row level security;
alter table public.files          enable row level security;
alter table public.templates      enable row level security;
alter table public.documents      enable row level security;
alter table public.channels       enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages       enable row level security;
alter table public.audit_logs     enable row level security;

-- ---- departments: 인증 사용자 읽기 가능 ----
create policy "departments_select"
  on public.departments for select
  to authenticated
  using (true);

-- ---- users: 인증 사용자 읽기 / 본인 수정 가능 ----
create policy "users_select"
  on public.users for select
  to authenticated
  using (true);

create policy "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users_insert"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

-- ---- files: 같은 부서 또는 본인 업로드 ----
create policy "files_select"
  on public.files for select
  to authenticated
  using (
    uploaded_by = auth.uid()
    or department_id in (
      select department_id from public.users where id = auth.uid()
    )
  );

create policy "files_insert"
  on public.files for insert
  to authenticated
  with check (uploaded_by = auth.uid());

create policy "files_update"
  on public.files for update
  to authenticated
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid());

create policy "files_delete"
  on public.files for delete
  to authenticated
  using (uploaded_by = auth.uid());

-- ---- templates: 전사(scope=company) 또는 같은 부서 ----
create policy "templates_select"
  on public.templates for select
  to authenticated
  using (
    scope = 'company'
    or department_id in (
      select department_id from public.users where id = auth.uid()
    )
  );

create policy "templates_insert"
  on public.templates for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "templates_update"
  on public.templates for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---- documents: 본인 작성 또는 같은 부서 사용자 ----
create policy "documents_select"
  on public.documents for select
  to authenticated
  using (
    created_by = auth.uid()
    or created_by in (
      select u2.id from public.users u1
      join public.users u2 on u1.department_id = u2.department_id
      where u1.id = auth.uid()
    )
  );

create policy "documents_insert"
  on public.documents for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "documents_update"
  on public.documents for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---- channels: 인증 사용자 읽기 가능 ----
create policy "channels_select"
  on public.channels for select
  to authenticated
  using (true);

create policy "channels_insert"
  on public.channels for insert
  to authenticated
  with check (true);

-- ---- channel_members: 인증 사용자 읽기 / 본인 참여 ----
create policy "channel_members_select"
  on public.channel_members for select
  to authenticated
  using (true);

create policy "channel_members_insert"
  on public.channel_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "channel_members_delete"
  on public.channel_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- messages: 채널 멤버만 읽기/쓰기 ----
create policy "messages_select"
  on public.messages for select
  to authenticated
  using (
    channel_id in (
      select channel_id from public.channel_members where user_id = auth.uid()
    )
  );

create policy "messages_insert"
  on public.messages for insert
  to authenticated
  with check (sender_id = auth.uid());

-- ---- audit_logs: 본인 로그만 읽기, 시스템이 기록 ----
create policy "audit_logs_select"
  on public.audit_logs for select
  to authenticated
  using (user_id = auth.uid());

create policy "audit_logs_insert"
  on public.audit_logs for insert
  to authenticated
  with check (user_id = auth.uid());

-- =============================================================================
-- updated_at 자동 갱신 트리거
-- =============================================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_files_updated_at
  before update on public.files
  for each row execute function public.handle_updated_at();

create trigger set_templates_updated_at
  before update on public.templates
  for each row execute function public.handle_updated_at();

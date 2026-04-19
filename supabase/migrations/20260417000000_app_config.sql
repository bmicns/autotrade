-- app_config: 엔진 제어 및 동적 설정 테이블
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 초기값
INSERT INTO app_config (key, value) VALUES
  ('engine_enabled', 'true'::jsonb),
  ('max_positions', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

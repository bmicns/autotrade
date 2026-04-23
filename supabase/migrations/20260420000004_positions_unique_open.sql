-- 동일 종목 open 포지션 중복 방지: stock_code 기준 partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS positions_stock_code_open_unique
  ON positions(stock_code)
  WHERE status = 'open';

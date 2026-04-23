-- pending_orders: 지정가 주문 체결 확인 루프용
CREATE TABLE IF NOT EXISTS pending_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_code text NOT NULL,
  stock_name text,
  order_no text NOT NULL,
  order_qty integer NOT NULL,
  limit_price integer NOT NULL,
  signal_score integer,
  created_at timestamptz DEFAULT now()
);

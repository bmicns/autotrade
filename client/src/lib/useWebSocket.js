import { useEffect, useRef, useCallback } from "react";

export function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    // 환경변수로 WS URL 지정 가능, 없으면 같은 호스트:4000
    const wsUrl = import.meta.env.VITE_WS_URL;
    let url;
    if (wsUrl) {
      url = wsUrl;
    } else {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      url = `${protocol}//${host}:4000`;
    }

    const ws = new WebSocket(url);

    ws.onopen = () => console.log("[WS] 연결됨");
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onMessage(msg);
      } catch {}
    };
    ws.onclose = () => {
      console.log("[WS] 연결 끊김, 3초 후 재연결...");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    wsRef.current = ws;
  }, [onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}

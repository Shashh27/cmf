"""WebSocket connection manager for order-scoped chatbox rooms."""

from __future__ import annotations

import asyncio
from typing import Dict, Iterable, Set, Tuple

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


class ChatWsManager:
    """Maps (order_id, user_id) -> open WebSocket connections."""

    def __init__(self) -> None:
        self._rooms: Dict[Tuple[int, int], Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, order_id: int, user_id: int, websocket: WebSocket) -> None:
        """Register socket — caller must have already called websocket.accept()."""
        key = (order_id, user_id)
        async with self._lock:
            self._rooms.setdefault(key, set()).add(websocket)

    async def disconnect(self, order_id: int, user_id: int, websocket: WebSocket) -> None:
        key = (order_id, user_id)
        async with self._lock:
            sockets = self._rooms.get(key)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._rooms.pop(key, None)

    def iter_order(self, order_id: int) -> Iterable[Tuple[int, Set[WebSocket]]]:
        for (oid, uid), sockets in list(self._rooms.items()):
            if oid == order_id and sockets:
                yield uid, set(sockets)

    async def send_to_sockets(self, sockets: Set[WebSocket], payload: dict) -> None:
        safe_payload = jsonable_encoder(payload)
        dead: list[WebSocket] = []
        for ws in sockets:
            try:
                await ws.send_json(safe_payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            for key, bucket in list(self._rooms.items()):
                bucket.discard(ws)
                if not bucket:
                    self._rooms.pop(key, None)


chat_ws_manager = ChatWsManager()

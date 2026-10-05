# Phase 2 — Backend

1. Express + Socket.IO foundation
2. Room service: create/join/leave/host/max players
3. Server-authoritative game state: lobby → word choice → drawing → round end → finished
4. Real-time drawing transport with validation and rate limits
5. Server-side guessing and score calculation
6. Reconnect/resume support
7. Persistence (optional PostgreSQL)
8. Deployment configuration for a WebSocket-capable host

Security rule: never send the secret word to non-drawers. Never trust client score or client drawer permissions.

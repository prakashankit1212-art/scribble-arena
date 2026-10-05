# Scribble Arena V2

Real-time drawing and guessing game with a React frontend and an in-memory Socket.IO backend.

## Stack
React, TypeScript, Vite, Express, Socket.IO and Zod.

## Run locally
Install both packages, then start the client and server together:

```sh
npm install
npm install --prefix server
npm run dev
```

The frontend runs at http://localhost:5174 and the backend at http://localhost:3000. Check the backend at http://localhost:3000/health.

The root `npm start` command also starts both services. Use `npm run dev:client` or `npm run dev:server` to start them separately.

## Verify
```sh
npm run build
npm test
```

Rooms are currently stored in memory and are lost when the backend stops. The server owns room membership, drawer permissions, word selection, hints, round timers, drawing validation and scoring. Session IDs are stored in browser localStorage to support reconnects.

Configure `HTTP_PORT`, `CLIENT_ORIGIN` and `VITE_SERVER_URL` in `.env`; `.env.example` contains the local defaults.

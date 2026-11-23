# Fish

Six-player Fish (Canadian Fish) in the browser. Express + Socket.IO, no build step.

```
npm install
npm start        # http://localhost:3000  (set PORT to change)
npm test         # plays full games against a throwaway server with 6 socket clients
```

## Refreshing / reconnecting

Each browser tab keeps a random session token in `sessionStorage`. A refresh (or a wifi blip) only drops the
socket; the server keeps the player's seat for **2 minutes** (`RECONNECT_GRACE_MS`) and, when the tab
reconnects, re-sends the room, hand, chat and activity log. Teammates see the player as "reconnecting"
rather than the game being cancelled. If the player doesn't return in time, the seat is released and the game is cancelled.

State lives in server memory, so restarting the server still ends all games.

## Layout

- `server.js` – rooms, sessions, rules enforcement
- `public/game.js`, `public/player.js` – game rules (dealing, asking, declaring)
- `public/index.html`, `style.css`, `app.js` – the client
- `tests/` – socket-level test suite (`bot.js` is a tiny Socket.IO client over `ws`)

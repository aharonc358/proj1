
# Mini Chat + Polls (WhatsApp-style Demo)

Tiny full-stack demo suitable for **5–10 users**. Features:
- Group **text chat**
- **Private one-to-one chat**
- **Create polls** and **vote** (one vote per user, re-vote changes your choice)
- Real-time updates (Socket.IO)
- No auth, just pick a nickname and join

## Run locally

1) Install Node.js 18+
2) In the project folder:
```bash
npm i
npm start
```
3) Open http://localhost:3000 in multiple tabs to simulate multiple users.

## Notes

- In-memory storage: messages (capped), polls, users.
- Room cap: 10 users (edit `MAX_USERS` in `server.js`).
- This is a teaching/demo app, not production. No persistence, auth, or security hardening.


// Simple WhatsApp-style demo: group chat + polls (for ~5–10 users)
// Run: npm i && npm start, then open http://localhost:3000

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Serve static client
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// In-memory state (fine for a demo)
const ROOM_NAME = "main";
const MAX_USERS = 10; // cap at 10
const messages = []; // { id, user, text, ts }
const polls = new Map(); // id -> { id, question, options: [{id,text,votes}], votesByUser: {userId: optionId}, createdAt }
const users = new Map(); // socket.id -> { id, name }

function getRoomUserCount() {
  const room = io.sockets.adapter.rooms.get(ROOM_NAME);
  return room ? room.size : 0;
}

io.on('connection', (socket) => {
  socket.on('join', ({ name }) => {
    if (typeof name !== 'string' || !name.trim()) {
      socket.emit('error_msg', 'Name is required to join.');
      return;
    }

    // Enforce user cap
    if (getRoomUserCount() >= MAX_USERS) {
      socket.emit('room_full', { max: MAX_USERS });
      return;
    }

    const user = { id: socket.id, name: name.trim() };
    users.set(socket.id, user);
    socket.join(ROOM_NAME);

    // Send initial state
    socket.emit('joined', {
      self: user,
      users: Array.from(users.values())
        .filter(u => io.sockets.sockets.get(u.id)?.rooms.has(ROOM_NAME)),
      messages,
      polls: Array.from(polls.values())
    });

    // Notify others
    socket.to(ROOM_NAME).emit('user_joined', user);
  });

  socket.on('send_message', (text) => {
    const user = users.get(socket.id);
    if (!user) return;
    if (typeof text !== 'string' || !text.trim()) return;
    const msg = { id: uuidv4(), user, text: text.trim(), ts: Date.now() };
    messages.push(msg);
    if (messages.length > 200) messages.shift(); // simple cap
    io.to(ROOM_NAME).emit('message_new', msg);
  });

  socket.on('private_message', ({ to, text }) => {
    const fromUser = users.get(socket.id);
    const target = users.get(to);
    if (!fromUser || !target) return;
    if (typeof text !== 'string' || !text.trim()) return;
    const msg = {
      from: fromUser,
      to: target,
      text: text.trim(),
      ts: Date.now()
    };
    io.to(to).to(socket.id).emit('private_message', msg);
  });

  socket.on('create_poll', ({ question, options }) => {
    const user = users.get(socket.id);
    if (!user) return;
    if (typeof question !== 'string' || !question.trim()) return;
    if (!Array.isArray(options)) return;
    const cleanOpts = options
      .map(o => (typeof o === 'string' ? o.trim() : ''))
      .filter(o => o).slice(0, 8); // cap options to 8
    if (cleanOpts.length < 2) {
      socket.emit('error_msg', 'Provide at least 2 options.');
      return;
    }

    const id = uuidv4();
    const poll = {
      id,
      question: question.trim(),
      createdBy: users.get(socket.id)?.name || 'Someone',
      options: cleanOpts.map(t => ({ id: uuidv4(), text: t, votes: 0 })),
      votesByUser: {}, // userId -> optionId
      createdAt: Date.now()
    };
    polls.set(id, poll);
    io.to(ROOM_NAME).emit('poll_new', poll);
  });

  socket.on('vote', ({ pollId, optionId }) => {
    const user = users.get(socket.id);
    if (!user) return;
    const poll = polls.get(pollId);
    if (!poll) return;

    // If already voted, decrement prior choice
    const prev = poll.votesByUser[user.id];
    if (prev) {
      const prevOpt = poll.options.find(o => o.id === prev);
      if (prevOpt) prevOpt.votes = Math.max(0, prevOpt.votes - 1);
    }

    // Set new vote
    const opt = poll.options.find(o => o.id === optionId);
    if (!opt) return;
    poll.votesByUser[user.id] = optionId;
    opt.votes += 1;

    io.to(ROOM_NAME).emit('poll_update', poll);
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      socket.to(ROOM_NAME).emit('user_left', user);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

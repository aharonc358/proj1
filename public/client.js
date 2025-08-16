
const socket = io();
let currentUser = null;
let users = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const joinSection = $('#joinSection');
const chatSection = $('#chatSection');
const statusEl = $('#status');
const userList = $('#userList');
const messagesEl = $('#messages');
const msgInput = $('#msgInput');
const sendBtn = $('#sendBtn');
const nameInput = $('#nameInput');
const joinBtn = $('#joinBtn');

const pollQuestion = $('#pollQuestion');
const optionsDiv = $('#options');
const addOptionBtn = $('#addOption');
const createPollBtn = $('#createPollBtn');
const pollList = $('#pollList');

function addMessage({ user, text, ts }) {
  const div = document.createElement('div');
  const t = new Date(ts);
  const time = t.toLocaleTimeString();
  div.className = 'message';
  div.innerHTML = `<span class="author">${escapeHtml(user.name)}</span>: ${escapeHtml(text)} <span class="time">${time}</span>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function renderUsers(list) {
  userList.innerHTML = '';
  list.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u.name + (currentUser && u.id === currentUser.id ? ' (you)' : '');
    li.dataset.id = u.id;
    if (!currentUser || u.id !== currentUser.id) {
      li.onclick = () => {
        const text = prompt(`Private message to ${u.name}:`);
        if (text) socket.emit('private_message', { to: u.id, text });
      };
    }
    userList.appendChild(li);
  });
}

function renderPoll(poll) {
  const existing = document.getElementById(`poll-${poll.id}`);
  const container = existing || document.createElement('div');
  container.id = `poll-${poll.id}`;
  container.className = 'poll';

  container.innerHTML = `
    <div class="q">${escapeHtml(poll.question)}</div>
    <div class="meta">By ${escapeHtml(poll.createdBy)} • ${new Date(poll.createdAt).toLocaleString()}</div>
    <div class="options">
      ${poll.options.map(o => `
        <button class="vote" data-poll="${poll.id}" data-option="${o.id}">
          ${escapeHtml(o.text)} — <strong>${o.votes}</strong>
        </button>
      `).join('')}
    </div>
  `;

  if (!existing) pollList.prepend(container);

  // Bind vote buttons
  container.querySelectorAll('.vote').forEach(btn => {
    btn.onclick = () => {
      const pollId = btn.getAttribute('data-poll');
      const optionId = btn.getAttribute('data-option');
      socket.emit('vote', { pollId, optionId });
    };
  });
}

joinBtn.onclick = () => {
  const name = nameInput.value.trim();
  socket.emit('join', { name });
};

sendBtn.onclick = () => {
  const text = msgInput.value.trim();
  if (!text) return;
  socket.emit('send_message', text);
  msgInput.value = '';
};

msgInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendBtn.click();
});

addOptionBtn.onclick = () => {
  const input = document.createElement('input');
  input.className = 'opt';
  input.placeholder = `Option ${optionsDiv.querySelectorAll('.opt').length + 1}`;
  optionsDiv.appendChild(input);
};

createPollBtn.onclick = () => {
  const question = pollQuestion.value.trim();
  const opts = $$('.opt').map(i => i.value.trim()).filter(Boolean);
  socket.emit('create_poll', { question, options: opts });
  pollQuestion.value = '';
  optionsDiv.innerHTML = '';
  addOptionBtn.click(); // add two defaults
  addOptionBtn.click();
};

// Socket events

socket.on('joined', (state) => {
  currentUser = state.self;
  statusEl.textContent = `Signed in as ${currentUser.name}`;
  joinSection.classList.add('hidden');
  chatSection.classList.remove('hidden');

  users = state.users;
  renderUsers(users);
  messagesEl.innerHTML = '';
  state.messages.forEach(addMessage);

  pollList.innerHTML = '';
  state.polls.sort((a,b)=>a.createdAt-b.createdAt).forEach(renderPoll);
});

socket.on('room_full', ({ max }) => {
  alert(`Room is full (max ${max} users). Try again later.`);
});

socket.on('error_msg', (msg) => alert(msg));

socket.on('user_joined', (user) => {
  addSystem(`${user.name} joined.`);
  users.push(user);
  renderUsers(users);
});

socket.on('user_left', (user) => {
  addSystem(`${user.name} left.`);
  users = users.filter(u => u.id !== user.id);
  renderUsers(users);
});

socket.on('message_new', addMessage);

socket.on('poll_new', renderPoll);
socket.on('poll_update', renderPoll);
socket.on('private_message', addPrivateMessage);

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addPrivateMessage({ from, to, text, ts }) {
  const div = document.createElement('div');
  div.className = 'message private';
  const time = new Date(ts).toLocaleTimeString();
  if (currentUser && from.id === currentUser.id) {
    div.innerHTML = `<span class="author">To ${to.name}</span>: ${escapeHtml(text)} <span class="time">${time}</span>`;
  } else {
    div.innerHTML = `<span class="author">From ${from.name}</span>: ${escapeHtml(text)} <span class="time">${time}</span>`;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Prefill two options on load
window.addEventListener('load', () => {
  addOptionBtn.click();
  addOptionBtn.click();
});

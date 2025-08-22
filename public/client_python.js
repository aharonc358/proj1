// Socket.IO is already initialized in the HTML file
// const socket = io() is defined in index_python.html

let currentUser = null;
let users = [];
const privateChats = new Map();

// Encryption state
let myKeyPair = null;
const userPublicKeys = new Map(); // userId -> publicKey

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

// Function to update crypto UI status
function updateCryptoStatus(status, isSuccess) {
  const cryptoStatus = document.getElementById('crypto-status');
  const cryptoControls = document.getElementById('crypto-controls');
  
  if (cryptoStatus) {
    cryptoStatus.textContent = status;
    cryptoStatus.style.color = isSuccess ? '#28a745' : '#dc3545';
  }
  
  // Show crypto controls if test failed
  if (cryptoControls && !isSuccess) {
    cryptoControls.style.display = 'block';
  }
}

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
      li.onclick = () => openPrivateChat(u);
    }
    userList.appendChild(li);
  });
}

function openPrivateChat(user, emit = true) {
  let chat = privateChats.get(user.id);
  if (!chat) {
    const container = document.getElementById('privateChats');
    chat = document.createElement('div');
    chat.className = 'private-chat';
    chat.dataset.id = user.id;
    
    // Check if we can do encrypted chat
    const canEncrypt = myKeyPair && userPublicKeys.has(user.id);
    
    chat.innerHTML = `
      <div class="header">
        <span class="title">${escapeHtml(user.name)}</span>
        <span class="encryption-status">${canEncrypt ? '🔒 Encrypted' : '⚠️ Unencrypted'}</span>
        <button class="close">&times;</button>
      </div>
      <div class="messages"></div>
      <div class="composer">
        <input class="pm-input" placeholder="Message ${escapeHtml(user.name)}" />
        <button class="pm-send">Send</button>
      </div>
    `;
    container.appendChild(chat);

    const input = chat.querySelector('.pm-input');
    const sendBtn = chat.querySelector('.pm-send');
    chat.querySelector('.close').onclick = () => {
      chat.remove();
      privateChats.delete(user.id);
    };
    
    // Use encrypted messaging if possible
    sendBtn.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
      
      if (canEncrypt) {
        await sendEncryptedPrivateMessage(user.id, text);
      } else {
        socket.emit('private_message', { to: user.id, text });
      }
      
      input.value = '';
    };
    
    input.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendBtn.click();
    });
    
    privateChats.set(user.id, chat);
    input.focus();
  }
  
  if (emit) {
    socket.emit('open_private', { to: user.id });
  }
}

// Function to send encrypted private messages
async function sendEncryptedPrivateMessage(userId, plainText) {
  try {
    const recipientPublicKey = userPublicKeys.get(userId);
    if (!recipientPublicKey) {
      console.error('No public key available for user:', userId);
      return;
    }
    
    // Encrypt the message with recipient's public key
    console.log('Encrypting message...');
    const encryptedContent = await CryptoUtils.encrypt(recipientPublicKey, plainText);
    console.log('Message encrypted successfully');
    
    // Send to server
    socket.emit('send_encrypted_private_message', {
      to: userId,
      encryptedContent
    });
    
    // Display in our own UI
    const recipientUser = users.find(u => u.id === userId);
    if (recipientUser) {
      addPrivateMessage({
        from: currentUser,
        to: recipientUser,
        text: plainText, // We show plaintext in our UI for messages we send
        ts: Date.now(),
        encrypted: true
      });
    }
  } catch (error) {
    console.error('Failed to send encrypted message:', error);
    alert('Could not encrypt message. Please try again or use unencrypted messaging.');
  }
}

function closePrivateChat(userId) {
  const chat = privateChats.get(userId);
  if (chat) {
    chat.remove();
    privateChats.delete(userId);
  }
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

// Event handlers - Direct implementation to avoid issues
// IMPORTANT: Do not move this function - it needs to be defined early
function attachJoinHandlers() {
  console.log('Attaching join button handlers');
  
  // Get fresh references to DOM elements
  const nameInput = document.getElementById('nameInput');
  const joinBtn = document.getElementById('joinBtn');
  
  if (!joinBtn || !nameInput) {
    console.error('Join elements not found:', { joinBtn, nameInput });
    return false;
  }
  
  // Direct onclick handler without arrow function
  joinBtn.onclick = function() {
    const name = nameInput.value.trim();
    console.log('Join button clicked, name:', name);
    
    if (!name) {
      console.warn('Name input is empty');
      alert('Please enter your name to join.');
      return;
    }
    
    if (!socket || !socket.connected) {
      console.warn('Socket not connected:', socket);
      alert('Connection error. Please refresh and try again.');
      return;
    }
    
    // Direct emit with explicit callback
    console.log('Emitting join event with name:', name);
    socket.emit('join', { name }, (response) => {
      console.log('Join response received:', response);
    });
  };
  
  // Also handle Enter key in name input
  nameInput.onkeypress = function(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      console.log('Enter key pressed in name input');
      joinBtn.click();
    }
  };
  
  console.log('Join handlers attached successfully');
  return true;
}

// Attach join handlers immediately
attachJoinHandlers();

// Re-attach on DOM content loaded to be extra safe
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM content loaded, re-attaching join handlers');
  attachJoinHandlers();
});

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
  if (!question) return;
  const opts = $$('.opt').map(i => i.value.trim()).filter(Boolean);
  if (opts.length < 2) {
    alert('Provide at least 2 options.');
    return;
  }
  socket.emit('create_poll', { question, options: opts });
  pollQuestion.value = '';
  optionsDiv.innerHTML = '';
  addOptionBtn.click(); // add two defaults
  addOptionBtn.click();
};

// Socket events
socket.on('joined', async (state) => {
  console.log('JOINED event received:', state);
  
  try {
    // First set UI to joined state BEFORE any async operations
    currentUser = state.self;
    statusEl.textContent = `Signed in as ${currentUser.name}`;
    joinSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    
    // Generate encryption keys if needed - AFTER UI is updated
    if (!myKeyPair) {
      console.log('Generating encryption keys...');
      try {
        myKeyPair = await CryptoUtils.generateKeyPair();
        console.log('Encryption keys generated successfully');
      } catch (err) {
        console.error('Failed to generate encryption keys:', err);
        // Continue even if encryption fails - we'll fall back to unencrypted messages
      }
    }
    
    // Store public keys for all users
    users = state.users;
    users.forEach(user => {
      if (user.publicKey) {
        userPublicKeys.set(user.id, user.publicKey);
        console.log(`Stored public key for ${user.name}`);
      }
    });
    
    renderUsers(users);
    messagesEl.innerHTML = '';
    state.messages.forEach(addMessage);
    
    pollList.innerHTML = '';
    state.polls.forEach(renderPoll);
    
    // Show encryption status - set it early for later display
    if (myKeyPair) {
      // Update the join-encryption-status element
      const joinEncStatus = document.getElementById('join-encryption-status');
      if (joinEncStatus) {
        joinEncStatus.innerHTML = '🔒 End-to-End Encryption Enabled';
      }
    }
  } catch (error) {
    console.error('Error during join setup:', error);
  }
});

socket.on('room_full', ({ max }) => {
  alert(`Room is full (max ${max} users). Try again later.`);
});

socket.on('error_msg', (msg) => alert(msg));

socket.on('user_joined', (user) => {
  addSystem(`${user.name} joined.`);
  users.push(user);
  
  // Store their public key if available
  if (user.publicKey) {
    userPublicKeys.set(user.id, user.publicKey);
    console.log(`Stored public key for new user ${user.name}`);
  }
  
  renderUsers(users);
});

socket.on('user_left', (user) => {
  addSystem(`${user.name} left.`);
  users = users.filter(u => u.id !== user.id);
  renderUsers(users);
  closePrivateChat(user.id);
});

socket.on('message_new', addMessage);

socket.on('poll_new', renderPoll);
socket.on('poll_update', renderPoll);
socket.on('private_message', addPrivateMessage);

// Handler for encrypted private messages
socket.on('encrypted_private_message', async (msg) => {
  try {
    const { from, to, encryptedContent, ts } = msg;
    
    // Only decrypt if we're the recipient and have keys
    if (currentUser && to.id === currentUser.id && myKeyPair && myKeyPair.privateKey) {
      console.log('Received encrypted message, attempting to decrypt...');
      
      // Decrypt the message
      const decryptedText = await CryptoUtils.decrypt(myKeyPair.privateKey, encryptedContent);
      console.log('Message decrypted successfully');
      
      // Display the decrypted message
      addPrivateMessage({
        from,
        to,
        text: decryptedText,
        ts,
        encrypted: true
      });
    } else if (currentUser && from.id === currentUser.id) {
      // This is a message we sent - already displayed in sendEncryptedPrivateMessage
      console.log('Received confirmation of sent encrypted message');
    } else {
      console.warn('Received encrypted message but cannot decrypt it');
    }
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    
    // Show error in UI
    addPrivateMessage({
      from: msg.from,
      to: msg.to,
      text: '[Could not decrypt message]',
      ts: msg.ts,
      encrypted: true
    });
  }
});
socket.on('private_history', ({ with: user, messages }) => {
  if (!privateChats.has(user.id)) {
    openPrivateChat(user, false);
  }
  const chat = privateChats.get(user.id);
  const list = chat.querySelector('.messages');
  list.innerHTML = '';
  messages.forEach(addPrivateMessage);
});

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addPrivateMessage({ from, to, text, ts, encrypted = false }) {
  const other = currentUser && from.id === currentUser.id ? to : from;
  if (!privateChats.has(other.id)) {
    openPrivateChat(other, false);
  }
  const chat = privateChats.get(other.id);
  const list = chat.querySelector('.messages');
  const div = document.createElement('div');
  const time = new Date(ts).toLocaleTimeString();
  if (encrypted) {
    div.classList.add('encrypted');
  }
  
  if (currentUser && from.id === currentUser.id) {
    div.innerHTML = `<span class="author">You:</span> ${escapeHtml(text)} <span class="time">${time}</span>${encrypted ? ' 🔒' : ''}`;
  } else {
    div.innerHTML = `<span class="author">${escapeHtml(from.name)}:</span> ${escapeHtml(text)} <span class="time">${time}</span>${encrypted ? ' 🔒' : ''}`;
  }
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

// Add CSS for encryption indicators
function addEncryptionStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .encryption-status {
      color: #28a745;
      font-size: 0.8rem;
      margin-left: 5px;
    }
    
    .message.encrypted, .private-message.encrypted {
      position: relative;
    }
    
    .message.encrypted:after, .private-message.encrypted:after {
      content: "🔒";
      font-size: 12px;
      position: absolute;
      right: 5px;
      top: 5px;
      color: #28a745;
    }

    .crypto-warning {
      background-color: #fff3cd;
      color: #856404;
      padding: 8px;
      margin: 5px 0;
      border-radius: 4px;
      text-align: center;
      cursor: pointer;
    }
    
    /* Join section styling */
    .join-info {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin-top: 5px;
    }
    
    .hint {
      margin-right: 10px;
    }
    
    #join-encryption-status {
      font-size: 0.85rem;
      color: #28a745;
    }
  `;
  document.head.appendChild(style);
}

// Initialize with two default poll options
window.addEventListener('load', () => {
  addOptionBtn.click();
  addOptionBtn.click();
  
  // Add encryption styles
  addEncryptionStyles();
  
  // Enhanced debug logs for socket connection
  console.log("Socket.IO client initialized");
  console.log("Socket.IO version:", io.version);
  console.log("Connection URL:", window.location.origin);
  
  socket.on('connect', () => {
    console.log('Connected to server', socket.id);
    statusEl.textContent = statusEl.textContent || `Connected (${socket.id})`;
    
    // Re-attach join handlers when socket connects
    console.log('Socket connected, re-attaching join handlers');
    attachJoinHandlers();
  });
  
  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    statusEl.textContent = `Disconnected: ${reason}`;
  });
  
  socket.on('connect_error', (err) => {
    console.error('Connection error:', err);
    statusEl.textContent = `Connection error: ${err.message}`;
  });
  
  // Display connection status visually
  if (socket.connected) {
    console.log('Already connected on page load');
  } else {
    console.log('Waiting for connection...');
    statusEl.textContent = 'Connecting...';
  }

  // Run crypto test and update status display
  console.log("Starting crypto support test...");
  CryptoUtils.testCryptoSupport()
    .then(supported => {
      console.log("Crypto test result:", supported ? "PASSED" : "FAILED");
      
      // Update crypto status display
      updateCryptoStatus(
        supported ? '🔒 Crypto support: Available' : '⚠️ Crypto support: Not available (see console)',
        supported
      );
      
      // Update the join-encryption-status element based on test result
      const joinEncStatus = document.getElementById('join-encryption-status');
      if (joinEncStatus) {
        if (supported) {
          joinEncStatus.innerHTML = '🔒 End-to-End Encryption Available';
          joinEncStatus.style.color = '#28a745'; // green
        } else {
          joinEncStatus.innerHTML = '⚠️ Encryption Unavailable';
          joinEncStatus.style.color = '#dc3545'; // red
        }
      }
      
      if (!supported) {
        console.error("Warning: E2E encryption may not work in this browser");
        
        // Show a detailed warning to the user
        const warning = document.createElement('div');
        warning.className = 'crypto-warning';
        warning.textContent = '⚠️ Warning: Your browser may not support secure messaging. Try enabling fallback mode.';
        warning.title = 'Click for more details';
        warning.onclick = () => {
          console.log("Debug info - User Agent:", navigator.userAgent);
          console.log("Debug info - Web Crypto API available:", typeof window.crypto !== 'undefined' && typeof window.crypto.subtle !== 'undefined');
          console.log("Debug info - window.crypto:", window.crypto);
          console.log("Debug info - window.crypto.subtle:", window.crypto?.subtle);
          document.getElementById('crypto-controls').style.display = 'block';
          alert('Crypto test failed. Check browser console for detailed error information.');
        };
        
        const app = document.querySelector('.app');
        if (app) {
          app.prepend(warning);
        }
      }
    })
    .catch(error => {
      console.error("Critical error during crypto test:", error);
      updateCryptoStatus('❌ Crypto error: Test threw an exception', false);
      
      // Show an error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'crypto-warning';
      errorMsg.style.backgroundColor = '#f8d7da';
      errorMsg.style.color = '#721c24';
      errorMsg.textContent = '❌ Error: Crypto test threw an exception. See console for details.';
      
      const app = document.querySelector('.app');
      if (app) {
        app.prepend(errorMsg);
      }
    });
});

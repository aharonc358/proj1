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

// Function to update security status in the info panel
function updateSecurityStatus() {
  // Update encryption status - always green for active features
  const encryptionStatusEl = document.getElementById('encryptionStatus');
  if (encryptionStatusEl) {
    encryptionStatusEl.style.color = '#28a745'; // Always green
  }
  
  // Update mixnet status - always green
  const mixnetStatusEl = document.getElementById('mixnetStatus');
  if (mixnetStatusEl) {
    mixnetStatusEl.style.color = '#28a745'; // Always green
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
  
  // If chat already exists, just focus it and don't re-request history
  if (chat) {
    // Focus the chat window instead of re-opening
    const input = chat.querySelector('.pm-input');
    if (input) input.focus();
    
    // Flash the window to draw attention
    chat.style.animation = 'flash 0.5s';
    setTimeout(() => {
      chat.style.animation = '';
    }, 500);
    
    // Don't emit open_private if chat already exists
    return;
  }
  
  // Create a new chat window
  const container = document.getElementById('privateChats');
  chat = document.createElement('div');
  chat.className = 'private-chat';
  chat.dataset.id = user.id;
  
  chat.innerHTML = `
    <div class="header">
      <span class="title">${escapeHtml(user.name)}</span>
      <span class="encryption-status">🔒 Encrypted</span>
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
    // Tell server to clear history for this conversation
    socket.emit('clear_private_history', { userId: user.id });
    console.log(`Requested to clear private chat history with ${user.name}`);
    
    // Remove chat window from UI
    chat.remove();
    privateChats.delete(user.id);
  };
  
  // Always use encrypted messaging
  sendBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    
    await sendEncryptedPrivateMessage(user.id, text);
    input.value = '';
  };
  
  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendBtn.click();
  });
  
  privateChats.set(user.id, chat);
  input.focus();
  
  // Only emit open_private for new chats
  if (emit) {
    socket.emit('open_private', { to: user.id });
  }
}

// Function to send encrypted private messages with OpenPGP
async function sendEncryptedPrivateMessage(userId, plainText) {
  try {
    console.log("Preparing to send encrypted private message to", userId);
    
    // Generate unique message ID to identify related encrypted messages
    const messageId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    console.log("Generated message ID:", messageId);
    
    // Create a mapping of userId -> encryptedContent (just like group messages)
    const encryptedContents = {};
    
    // Get recipient's public key
    const recipientPublicKey = userPublicKeys.get(userId);
    if (!recipientPublicKey) {
      console.error('No OpenPGP public key available for user:', userId);
      alert('Cannot encrypt message: recipient public key not available');
      return false;
    }
    
    // Encrypt for recipient
    console.log('Encrypting private message for recipient...');
    const recipientEncrypted = await CryptoUtils.encrypt(recipientPublicKey, plainText);
    encryptedContents[userId] = recipientEncrypted;
    console.log('Message encrypted successfully for recipient');
    
    // Encrypt for ourselves too (if we have a key)
    if (myKeyPair && myKeyPair.publicKey) {
      console.log('Encrypting private message for ourselves...');
      const senderEncrypted = await CryptoUtils.encrypt(myKeyPair.publicKey, plainText);
      encryptedContents[currentUser.id] = senderEncrypted;
      console.log('Message encrypted successfully for ourselves');
    }
    
    console.log(`Private message encrypted for ${Object.keys(encryptedContents).length} recipients`);
    
    // Send to server with new format
    socket.emit('send_encrypted_private_message', {
      to: userId,
      encryptedContents,
      messageId
    });
    
    console.log(`Private message sent with ID ${messageId}`);
    return true;
    
  } catch (error) {
    console.error('Failed to encrypt message with OpenPGP:', error);
    alert('Could not encrypt message: ' + (error.message || 'Unknown error'));
    return false;
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

// Function to send encrypted group messages
async function sendEncryptedGroupMessage(plainText) {
  try {
    console.log("Preparing to send encrypted group message:", plainText);
    
    // Generate unique message ID to identify related encrypted messages
    const messageId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    console.log("Generated message ID:", messageId);
    
    // Create a mapping of userId -> encryptedContent
    const encryptedContents = {};
    
    // Count how many users we can encrypt for
    let encryptionPossibleCount = 0;
    
    // Log all users and their keys
    console.log("Current users in room:", users.map(u => `${u.name} (${u.id})`));
    console.log("Available public keys:", Array.from(userPublicKeys.keys()));
    
    // Encrypt for each user in the room (including ourselves)
    for (const user of users) {
      const publicKey = userPublicKeys.get(user.id);
      
      if (publicKey) {
        console.log(`Encrypting message for ${user.name} (ID: ${user.id})`);
        try {
          // Encrypt the message using OpenPGP
          const encryptedContent = await CryptoUtils.encrypt(publicKey, plainText);
          encryptedContents[user.id] = encryptedContent;
          console.log(`Successfully encrypted for ${user.name}`);
          encryptionPossibleCount++;
        } catch (encryptError) {
          console.error(`Failed to encrypt for user ${user.name}:`, encryptError);
          // Skip this user rather than stopping the entire process
        }
      } else {
        console.warn(`No public key available for ${user.name} (ID: ${user.id})`);
      }
    }
    
    // Only proceed if we could encrypt for at least one recipient (including ourselves)
    if (encryptionPossibleCount === 0) {
      console.error('Could not encrypt message for any recipients');
      alert('No encryption keys available. Message not sent.');
      return false;
    }
    
    console.log(`Sending encrypted group message to ${encryptionPossibleCount} recipients:`, {
      messageId,
      recipientIds: Object.keys(encryptedContents)
    });
    
    // Send to server
    socket.emit('send_encrypted_group_message', {
      encryptedContents,
      messageId
    });
    
    console.log(`Group message sent to server with ID ${messageId}`);
    
    // We no longer add the message immediately to the UI
    // Instead, we'll wait for the server to send it back through the socket
    // This prevents duplicate messages and ensures proper message verification
    
    return true;
    
  } catch (error) {
    console.error('Failed to encrypt group message:', error);
    alert('Could not encrypt message: ' + (error.message || 'Unknown error'));
    return false;
  }
}

// Updated send button handler with encryption support
sendBtn.onclick = async () => {
  const text = msgInput.value.trim();
  if (!text) return;
  
  // If we have encryption keys and we're in the main chat, use encrypted group messaging
  if (myKeyPair && userPublicKeys.size > 0) {
    const success = await sendEncryptedGroupMessage(text);
    if (success) {
      msgInput.value = ''; // Only clear if successfully sent
    }
  } else {
    // Fall back to unencrypted messaging if no keys available
    socket.emit('send_message', text);
    msgInput.value = '';
  }
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
    
    // Generate OpenPGP encryption keys
    if (!myKeyPair) {
      console.log('Generating OpenPGP encryption keys...');
      try {
        // Generate browser-side keys
        myKeyPair = await CryptoUtils.generateKeyPair();
        console.log('OpenPGP keys generated successfully');
        
        // Update the server with our OpenPGP public key
        socket.emit('update_user_key', { publicKey: myKeyPair.publicKey });
        console.log('Sent OpenPGP public key to server');
      } catch (err) {
        console.error('Failed to generate OpenPGP keys:', err);
        // Continue even if encryption fails
      }
    }
    
    // Store public keys for all users
    users = state.users;
    users.forEach(user => {
      // Skip storing keys from server - we'll use keys sent directly via update_user_key
      if (user.id !== currentUser.id) {
        console.log(`Awaiting OpenPGP public key from ${user.name}`);
      }
    });
    
    renderUsers(users);
    messagesEl.innerHTML = '';
    state.messages.forEach(addMessage);
    
    pollList.innerHTML = '';
    state.polls.forEach(renderPoll);
    
        // Update security panel
        updateSecurityStatus();
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
  
  // We don't immediately store their server-generated key
  // Instead, we'll wait for them to send their browser-generated OpenPGP key
  console.log(`User ${user.name} joined, awaiting their OpenPGP public key`);
  
  renderUsers(users);
});

// Listen for user key updates (OpenPGP keys)
socket.on('user_key_updated', (user) => {
  console.log(`Received OpenPGP public key from ${user.name}`);
  
  // Store or update the user's public key
  if (user.publicKey) {
    userPublicKeys.set(user.id, user.publicKey);
    console.log(`Stored OpenPGP public key for ${user.name}`);
    
    // Update encryption status in chat UI if exists
    const chat = privateChats.get(user.id);
    if (chat) {
      const statusElem = chat.querySelector('.encryption-status');
      if (statusElem) {
        statusElem.textContent = '🔒 Encrypted';
        statusElem.style.color = '#28a745'; // green
      }
    }
  }
  
  // Update the user in our users array
  const existingUserIndex = users.findIndex(u => u.id === user.id);
  if (existingUserIndex >= 0) {
    users[existingUserIndex] = user;
  }
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

// Handler for encrypted private messages with OpenPGP
socket.on('encrypted_private_message', async (msg) => {
  try {
    const { from, to, encryptedContent, ts, messageId, mixed } = msg;
    
    console.log('Received encrypted private message:', {
      from: from?.name || 'Unknown',
      to: to?.name || 'Unknown',
      hasEncryptedContent: !!encryptedContent,
      messageId,
      timestamp: ts,
      mixnetProcessed: !!mixed
    });
    
    // Only decrypt if we have keys and there's encrypted content for us
    if (currentUser && myKeyPair && myKeyPair.privateKey && encryptedContent) {
      console.log(`Attempting to decrypt private message ${messageId || ''}`);
      
      try {
        // Decrypt the message using our private key
        const decryptedText = await CryptoUtils.decrypt(myKeyPair.privateKey, encryptedContent);
        console.log('Private message decryption successful');
        
        // Display the successfully decrypted message
        addPrivateMessage({
          from,
          to,
          text: decryptedText,
          ts,
          encrypted: true,
          mixed: !!mixed // Pass the mixnet flag to the display function
        });
      } catch (decryptError) {
        console.error('Private message decryption error:', decryptError);
        
        // Show error in UI
        addPrivateMessage({
          from,
          to,
          text: `[Decryption failed - ${decryptError.message}]`,
          ts,
          encrypted: true,
          mixed: !!mixed // Preserve mixnet flag even for failed decryption
        });
      }
    } else {
      console.warn('Received encrypted private message but cannot decrypt it:', {
        hasCurrentUser: !!currentUser,
        hasKeyPair: !!myKeyPair,
        hasPrivateKey: !!(myKeyPair && myKeyPair.privateKey),
        hasEncryptedContent: !!encryptedContent
      });
    }
  } catch (error) {
    console.error('Failed to process encrypted private message:', error);
    
    // Show error in UI
    if (msg && msg.from && msg.to) {
      addPrivateMessage({
        from: msg.from,
        to: msg.to,
        text: '[Error processing encrypted message]',
        ts: msg.ts || Date.now(),
        encrypted: true,
        mixed: !!msg.mixed // Preserve mixnet flag even on general errors
      });
    }
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

// Handler for encrypted group messages
socket.on('encrypted_group_message', async (msg) => {
  try {
    const { user, encryptedContent, messageId, ts, mixed } = msg;
    
    console.log('Received encrypted group message event:', {
      from: user?.name || 'Unknown',
      hasEncryptedContent: !!encryptedContent,
      messageId,
      timestamp: ts,
      mixnetProcessed: !!mixed
    });
    
    // Only decrypt if we have keys and there's encrypted content for us
    if (currentUser && myKeyPair && myKeyPair.privateKey && encryptedContent) {
      console.log(`Attempting to decrypt group message from ${user.name}, messageId: ${messageId}`);
      
      try {
        // Decrypt the message using our private key
        const decryptedText = await CryptoUtils.decrypt(myKeyPair.privateKey, encryptedContent);
        console.log('Group message decryption successful:', decryptedText);
        
        // Display the successfully decrypted message with encryption indicator
        addEncryptedGroupMessage({
          user,
          text: decryptedText,
          ts,
          encrypted: true,
          messageId,
          mixed: !!mixed // Pass the mixnet flag to the display function
        });
      } catch (decryptError) {
        console.error('Group message decryption error:', decryptError);
        
        // Show error in UI
        addEncryptedGroupMessage({
          user,
          text: `[Decryption failed - ${decryptError.message}]`,
          ts,
          encrypted: true,
          messageId
        });
      }
    } else {
      console.warn('Received encrypted group message but cannot decrypt it (no keys available):', {
        hasCurrentUser: !!currentUser,
        hasKeyPair: !!myKeyPair,
        hasPrivateKey: !!(myKeyPair && myKeyPair.privateKey),
        hasEncryptedContent: !!encryptedContent
      });
    }
  } catch (error) {
    console.error('Failed to process encrypted group message:', error);
  }
});

// Function to display encrypted group messages in the main chat
function addEncryptedGroupMessage({ user, text, ts, encrypted = true, messageId, mixed = false }) {
  const div = document.createElement('div');
  const time = new Date(ts).toLocaleTimeString();
  
  // Add message-specific classes
  div.className = 'message';  // Base class
  if (mixed) {
    div.classList.add('mixed');  // Only add if mixnet processed successfully
  }
  if (encrypted) {
    div.classList.add('encrypted');
  }
  
  // Add message ID for potential future use (like editing)
  if (messageId) {
    div.dataset.messageId = messageId;
  }
  
  // Handle null/undefined text (failed decryption)
  const safeText = text || "[Message could not be decrypted]";
  
  // Format the message content
  if (currentUser && user.id === currentUser.id) {
    div.innerHTML = `<span class="author">You:</span> ${escapeHtml(safeText)} <span class="time">${time}</span>`;
  } else {
    div.innerHTML = `<span class="author">${escapeHtml(user.name)}</span>: ${escapeHtml(safeText)} <span class="time">${time}</span>`;
  }
  
  // Add to the message list and scroll to view
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addPrivateMessage({ from, to, text, ts, encrypted = false, mixed = false }) {
  // Safety check for other user
  const other = currentUser && from.id === currentUser.id ? to : from;
  if (!other || !other.id) {
    console.error("Invalid user data in private message:", { from, to });
    return;
  }
  
  // Create chat window if needed
  if (!privateChats.has(other.id)) {
    openPrivateChat(other, false);
  }
  
  // Get chat window elements
  const chat = privateChats.get(other.id);
  if (!chat) {
    console.error("Failed to get or create private chat for user:", other.id);
    return;
  }
  
  const list = chat.querySelector('.messages');
  const div = document.createElement('div');
  const time = new Date(ts).toLocaleTimeString();
  
  // Add base class
  div.className = 'private-message';
  
  // Only add mixed class if message was processed by mixnet
  if (mixed) {
    div.classList.add('mixed');
  }
  
  // Mark encrypted messages
  if (encrypted) {
    div.classList.add('encrypted');
  }
  
  // Handle null/undefined text (failed decryption)
  const safeText = text || "[Message could not be decrypted]";
  
  // Set message content
  try {
    if (currentUser && from.id === currentUser.id) {
      div.innerHTML = `<span class="author">You:</span> ${escapeHtml(safeText)} <span class="time">${time}</span>`;
    } else {
      div.innerHTML = `<span class="author">${escapeHtml(from?.name || 'Unknown')}:</span> ${escapeHtml(safeText)} <span class="time">${time}</span>`;
    }
    
    // Add to chat
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  } catch (error) {
    console.error("Error displaying private message:", error);
    
    // Fallback display method if escaping fails
    div.textContent = `Message from ${from?.name || 'Unknown'} at ${time}: [Display error]`;
    list.appendChild(div);
  }
}

// Add CSS for encryption indicators
function addEncryptionStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flash {
      0%, 100% { background-color: transparent; }
      50% { background-color: rgba(0, 123, 255, 0.2); }
    }

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
    
    .message.mixed:before, .private-message.mixed:before {
      content: "🔀";
      font-size: 12px;
      margin-right: 5px;
      opacity: 0.7;
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
    
    /* Security info panel styling */
    .security-info-panel {
      position: fixed;
      top: 10px;
      right: 10px;
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 1000;
    }

    .security-info-header {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 0.85rem;
      color: #495057;
      text-align: center;
      border-bottom: 1px solid #dee2e6;
      padding-bottom: 3px;
    }

    .security-feature {
      display: flex;
      align-items: center;
      margin: 5px 0;
      font-size: 0.8rem;
      color: #28a745;
    }

    .security-icon {
      margin-right: 5px;
    }

    .security-text {
      flex: 1;
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

  // Update security status panel
  updateSecurityStatus();
  
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

  // Update encryption status
  updateEncryptionStatus();
});

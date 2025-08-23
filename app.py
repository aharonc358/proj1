#!/usr/bin/env python3
# Python implementation of the WhatsApp-style demo chat + polls
# Rewrite of the original server.js with end-to-end encryption

from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room
import os
import time
import uuid
from collections import defaultdict

# Import our models
from models.user import User
from models.message import Message, PrivateMessage, EncryptedMessage, EncryptedPrivateMessage
from crypto.elgamal import ElGamalCrypto

app = Flask(__name__)
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   ping_timeout=60,
                   ping_interval=25,
                   async_mode='threading')

# Serve static client files
@app.route('/')
def index():
    return send_from_directory('public', 'index_python.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('public', path)

# In-memory state 
ROOM_NAME = "main"
MAX_USERS = 10  # cap at 10
messages = []  # Message objects converted to dicts
polls = {}  # id -> { id, question, options: [{id,text,votes}], votesByUser: {userId: optionId}, createdAt }
users = {}  # socket_id -> User objects
private_messages = {}  # key 'id1:id2' -> [{from,to,text,ts,encrypted,encryptedContent}]
user_keys = {}  # id -> publicKey (OpenPGP format)

def dm_key(id1, id2):
    """Generate a consistent key for private messages between two users"""
    return ':'.join(sorted([id1, id2]))

def get_room_user_count():
    """Get the number of users in the main room"""
    return len([u for u in users.values() if u.in_room])

@socketio.on('connect')
def handle_connect():
    """Handle new client connection"""
    print('Client connected:', request.sid)
    print(f'Connection origin: {request.origin}')
    print(f'Client transport: {request.environ.get("wsgi.websocket_version", "unknown")}')
    try:
        headers = request.headers
        if headers:
            print(f'Headers: Host={headers.get("Host", "unknown")}, Origin={headers.get("Origin", "unknown")}')
    except Exception as e:
        print(f'Error accessing headers: {e}')

@socketio.on('join')
def handle_join(data):
    """Handle user joining the chat"""
    name = data.get('name', '').strip()
    if not name:
        emit('error_msg', 'Name is required to join.')
        return
        
    # Enforce user cap
    if get_room_user_count() >= MAX_USERS:
        emit('room_full', {'max': MAX_USERS})
        return
        
    # Create user with encryption keys
    socket_id = request.sid
    user = User(socket_id, name)
    users[socket_id] = user
    join_room(ROOM_NAME)
    
    print(f"User {name} joined with public key: {user.public_key[:40]}...")
    
    # Convert users to dicts for sending
    user_dicts = [u.to_dict() for u in users.values() if u.in_room]
    
    # Send initial state
    emit('joined', {
        'self': user.to_dict(),
        'users': user_dicts,
        'messages': messages,
        'polls': list(polls.values())
    })
    
    # Send all known OpenPGP keys to the new user
    for uid, key in user_keys.items():
        # Find the user object for this key
        user_obj = next((u for u in users.values() if u.id == uid), None)
        if user_obj:
            # Create a user dict with the key
            key_update = user_obj.to_dict()
            # Send to the new user only
            emit('user_key_updated', key_update)
    
    # Notify others
    emit('user_joined', user.to_dict(), room=ROOM_NAME, skip_sid=socket_id)

@socketio.on('send_message')
def handle_message(text):
    """Handle new message in main chat"""
    socket_id = request.sid
    user = users.get(socket_id)
    
    if not user:
        return
        
    if not isinstance(text, str) or not text.strip():
        return
        
    # Create message object and convert to dict
    msg = Message(user.to_dict(), text.strip())
    msg_dict = msg.to_dict()
    
    messages.append(msg_dict)
    if len(messages) > 200:
        messages.pop(0)  # simple cap
        
    emit('message_new', msg_dict, room=ROOM_NAME)

@socketio.on('private_message')
def handle_private_message(data):
    """Handle private message between users"""
    socket_id = request.sid
    from_user = users.get(socket_id)
    to_user_id = data.get('to')
    text = data.get('text', '')
    
    to_user = users.get(to_user_id)
    
    if not from_user or not to_user:
        return
        
    if not isinstance(text, str) or not text.strip():
        return
        
    # Create message object and convert to dict
    msg = PrivateMessage(from_user.to_dict(), to_user.to_dict(), text.strip())
    msg_dict = msg.to_dict()
    
    key = dm_key(from_user.id, to_user.id)
    hist = private_messages.get(key, [])
    hist.append(msg_dict)
    
    if len(hist) > 200:
        hist.pop(0)  # simple cap
        
    private_messages[key] = hist
    
    # Send to both sender and recipient
    for sid in [to_user_id, socket_id]:
        emit('private_message', msg_dict, room=sid)

@socketio.on('open_private')
def handle_open_private(data):
    """Handle opening a private chat with history"""
    socket_id = request.sid
    from_user = users.get(socket_id)
    to_user_id = data.get('to')
    to_user = users.get(to_user_id)
    
    if not from_user or not to_user:
        return
        
    key = dm_key(from_user.id, to_user.id)
    hist = private_messages.get(key, [])
    
    emit('private_history', {'with': to_user.to_dict(), 'messages': hist}, room=socket_id)
    emit('private_history', {'with': from_user.to_dict(), 'messages': hist}, room=to_user_id)

@socketio.on('create_poll')
def handle_create_poll(data):
    """Handle creation of a new poll"""
    socket_id = request.sid
    user = users.get(socket_id)
    
    if not user:
        return
        
    question = data.get('question', '').strip()
    options = data.get('options', [])
    
    if not question:
        return
        
    if not isinstance(options, list):
        return
        
    # Clean and filter options
    clean_opts = []
    for o in options:
        if isinstance(o, str) and o.strip():
            clean_opts.append(o.strip())
    
    clean_opts = clean_opts[:8]  # cap options to 8
    
    if len(clean_opts) < 2:
        emit('error_msg', 'Provide at least 2 options.')
        return
        
    poll_id = str(uuid.uuid4())
    poll = {
        'id': poll_id,
        'question': question,
        'createdBy': user.name,
        'options': [{'id': str(uuid.uuid4()), 'text': text, 'votes': 0} for text in clean_opts],
        'votesByUser': {},  # userId -> optionId
        'createdAt': int(time.time() * 1000)
    }
    
    polls[poll_id] = poll
    emit('poll_new', poll, room=ROOM_NAME)

@socketio.on('vote')
def handle_vote(data):
    """Handle votes on polls"""
    socket_id = request.sid
    user = users.get(socket_id)
    
    if not user:
        return
        
    poll_id = data.get('pollId')
    option_id = data.get('optionId')
    
    poll = polls.get(poll_id)
    if not poll:
        return
        
    # If already voted, decrement prior choice
    prev = poll['votesByUser'].get(user.id)
    if prev:
        prev_opt = next((o for o in poll['options'] if o['id'] == prev), None)
        if prev_opt:
            prev_opt['votes'] = max(0, prev_opt['votes'] - 1)
    
    # Set new vote
    opt = next((o for o in poll['options'] if o['id'] == option_id), None)
    if not opt:
        return
        
    poll['votesByUser'][user.id] = option_id
    opt['votes'] += 1
    
    emit('poll_update', poll, room=ROOM_NAME)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    socket_id = request.sid
    print(f'Client disconnected: {socket_id}')
    user = users.get(socket_id)
    
    if user:
        user.in_room = False
        print(f'User {user.name} left the room')
        emit('user_left', user.to_dict(), room=ROOM_NAME)
        
        # Clean up - we'll keep the user data in case they reconnect
        # but mark them as not in the room
        # In a real app with persistence, you'd want to handle cleanup differently

# Add handler for key exchange between users
@socketio.on('update_user_key')
def handle_user_key_update(data):
    """Handle OpenPGP public key updates from users."""
    socket_id = request.sid
    from_user = users.get(socket_id)
    if not from_user:
        return
    
    public_key = data.get('publicKey')
    if not public_key:
        return
    
    # Update the user's public key
    from_user.set_public_key(public_key)
    
    # Store the key in our global dictionary
    user_keys[from_user.id] = public_key
    print(f"Updated OpenPGP public key for {from_user.name}")
    
    # Broadcast the updated user data to all users
    user_dict = from_user.to_dict()
    emit('user_key_updated', user_dict, room=ROOM_NAME)

# Add handler for encrypted private messages
@socketio.on('send_encrypted_private_message')
def handle_encrypted_private_message(data):
    """Handle encrypted private messages between users."""
    socket_id = request.sid
    from_user = users.get(socket_id)
    if not from_user:
        return
    
    to_user_id = data.get('to')
    encrypted_content = data.get('encryptedContent')
    
    to_user = users.get(to_user_id)
    if not to_user or not encrypted_content:
        return
    
    # Create encrypted message
    msg = EncryptedPrivateMessage(from_user.to_dict(), to_user.to_dict(), encrypted_content)
    msg_dict = msg.to_dict()
    
    # Store in private messages history
    key = dm_key(from_user.id, to_user.id)
    hist = private_messages.get(key, [])
    hist.append(msg_dict)
    
    if len(hist) > 200:
        hist.pop(0)  # simple cap
    
    private_messages[key] = hist
    
    # Send to both sender and recipient
    for sid in [to_user_id, socket_id]:
        emit('encrypted_private_message', msg_dict, room=sid)
    
    print(f"Encrypted message sent from {from_user.name} to {to_user.name}")

if __name__ == '__main__':
    # Try multiple ports in case of conflicts
    ports = [3001, 3002, 3003, 3004, 5000]
    
    # Use PORT environment variable if provided
    if os.environ.get('PORT'):
        ports.insert(0, int(os.environ.get('PORT')))
        
    for PORT in ports:
        try:
            print(f"Trying to start server on port {PORT}...")
            print(f"Server listening on http://localhost:{PORT}")
            print(f"Access via network: http://0.0.0.0:{PORT}")
            print(f"For ngrok usage: Use 'ngrok http {PORT}'")
            print(f"Socket.IO configuration: async_mode={socketio.async_mode}, cors_allowed_origins=*")
            socketio.run(app, host='0.0.0.0', port=PORT, debug=True, allow_unsafe_werkzeug=True)
            # If we reach this point, the server started successfully
            break
        except OSError as e:
            if "Address already in use" in str(e) or "address already in use" in str(e).lower():
                print(f"Port {PORT} is already in use, trying next port...")
            else:
                print(f"Error starting server on port {PORT}: {e}")
                break  # Exit on non-port-conflict errors

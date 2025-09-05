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
from models.anonymous_polls import AnonymousPolling  # NEW
# old ones below
from models.user import User
from models.message import Message, PrivateMessage, EncryptedMessage, EncryptedPrivateMessage, EncryptedGroupMessage
from crypto.elgamal import ElGamalCrypto
from crypto.mixnet import MixNode, MixnetManager
from crypto.pir import PIR
import random

app = Flask(__name__)
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   ping_timeout=60,
                   ping_interval=25,
                   async_mode='threading')

# Serve static client files
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

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

anon_polls = AnonymousPolling()  # NEW


# Initialize mixnet for anonymous message delivery
mixnet_manager = MixnetManager(socketio)

# Configure three mix nodes with different parameters for diversity
mix_node1 = MixNode("node1", batch_size=2, max_delay_ms=50)  # First mix node
mix_node2 = MixNode("node2", batch_size=2, max_delay_ms=75)  # Second mix node with medium delay
mix_node3 = MixNode("node3", batch_size=2, max_delay_ms=60)  # Third mix node with different delay

# Add nodes to the mixnet manager in cascade order
mixnet_manager.add_node(mix_node1)
mixnet_manager.add_node(mix_node2)
mixnet_manager.add_node(mix_node3)
print(f"Mixnet initialized with {len(mixnet_manager.nodes)} nodes: {[node.name for node in mixnet_manager.nodes]}")

# Initialize background mixnet processing
def start_mixnet_processing():
    """Start background mixnet processing task."""
    print("Starting mixnet background processing task...")
    socketio.start_background_task(process_mixnet_continuously)
    
def process_mixnet_continuously():
    """Background task to process mixnet messages."""
    print("Mixnet processor started")
    while True:
        try:
            mixnet_manager.process_messages()
        except Exception as e:
            print(f"Error in mixnet processing task: {e}")
        socketio.sleep(0.1)  # Check less frequently (every 100ms) to reduce log noise

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
    # Send an empty message array to new users for a clean slate
    # This prevents showing unreadable encrypted messages from before they joined
    emit('joined', {
        'self': user.to_dict(),
        'users': user_dicts,
        'messages': [],  # Empty array instead of full message history
        'polls': [],  # Legacy polls disabled; use anon_polls only
        'anon_polls': anon_polls.list_public_polls()  # NEW
    })
    try:
        print(f"POLL: sent initial polls to {name} (count={len(polls)})")
    except Exception:
        pass
    
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

@socketio.on('clear_private_history')
def handle_clear_private_history(data):
    """Handle clearing private chat history."""
    socket_id = request.sid
    from_user = users.get(socket_id)
    to_user_id = data.get('userId')
    
    if not from_user or not to_user_id:
        print("Invalid request to clear private history")
        return
        
    # Clear the history for this conversation pair
    key = dm_key(from_user.id, to_user_id)
    if key in private_messages:
        message_count = len(private_messages[key])
        private_messages[key] = []
        print(f"Cleared {message_count} messages in private chat between {from_user.name} and {users.get(to_user_id).name if users.get(to_user_id) else to_user_id}")
    else:
        print(f"No messages found to clear for conversation {key}")

@socketio.on('create_poll')
def handle_create_poll(data):
    """Legacy poll creation disabled. Use create_anon_poll."""
    socket_id = request.sid
    user = users.get(socket_id)
    print(f"POLL(legacy): create requested by {user.name if user else 'unknown'} - REJECTED (use create_anon_poll)")
    emit('error_msg', 'Legacy polls are disabled. Please use anonymous polls.')

@socketio.on('vote')
def handle_vote(data):
    """Legacy voting disabled. Use anonymous vote flow."""
    socket_id = request.sid
    user = users.get(socket_id)
    print(f"POLL(legacy): vote requested by {user.name if user else 'unknown'} - REJECTED (use anonymous voting)")
    emit('error_msg', 'Legacy voting is disabled. Please use anonymous voting.')

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
    """Handle encrypted private messages between users with per-recipient encryption."""
    socket_id = request.sid
    from_user = users.get(socket_id)
    if not from_user:
        print("Error: Sender user not found")
        return
    
    to_user_id = data.get('to')
    encrypted_contents = data.get('encryptedContents', {})
    message_id = data.get('messageId')
    
    # Support both old format (encryptedContent) and new format (encryptedContents)
    if not encrypted_contents and data.get('encryptedContent'):
        encrypted_contents = {to_user_id: data.get('encryptedContent')}
    
    to_user = users.get(to_user_id)
    if not to_user or not encrypted_contents:
        print("Error: Recipient not found or no encrypted contents")
        return
    
    print(f"Processing encrypted private message from {from_user.name} to {to_user.name}")
    
    try:
        # Create base encrypted message with recipient's content
        recipient_content = encrypted_contents.get(to_user_id, '')
        msg = EncryptedPrivateMessage(from_user.to_dict(), to_user.to_dict(), recipient_content)
        msg_dict = msg.to_dict()
        
        # Add message ID if provided
        if message_id:
            msg_dict['messageId'] = message_id
        
        # Store in private messages history (with recipient's encrypted version)
        key = dm_key(from_user.id, to_user.id)
        hist = private_messages.get(key, [])
        hist.append(msg_dict)
        
        if len(hist) > 200:
            hist.pop(0)  # simple cap
        
        private_messages[key] = hist
        
        # Route personalized encrypted messages through mixnet for enhanced privacy
        for user_id, encrypted_content in encrypted_contents.items():
            user = next((u for u in users.values() if u.id == user_id), None)
            if user:
                print(f"Routing encrypted private message to {user.name} (ID: {user.id}) through mixnet")
                # Add to mixnet instead of emitting directly
                mixnet_manager.add_message(
                    encrypted_content=encrypted_content,
                    recipient_id=user.id,
                    user_data={
                        'from': from_user.to_dict(),
                        'to': to_user.to_dict()
                    },
                    message_id=message_id or str(uuid.uuid4()),  # Ensure we have a message ID
                    message_type='private'
                )
        
        print(f"Encrypted private message sent from {from_user.name} to {to_user.name}")
    except Exception as e:
        print(f"Error processing encrypted private message: {e}")


# Add handler for encrypted group messages
@socketio.on('send_encrypted_group_message')
def handle_encrypted_group_message(data):
    """Handle encrypted group messages with per-recipient encryption."""
    socket_id = request.sid
    from_user = users.get(socket_id)
    if not from_user:
        print("Error: Sender user not found")
        return
    
    encrypted_contents = data.get('encryptedContents', {})
    message_id = data.get('messageId')
    
    if not encrypted_contents:
        print("Error: No encrypted contents provided")
        return
        
    if not message_id:
        print("Error: No message ID provided")
        return
    
    print(f"Processing encrypted group message from {from_user.name}, message ID: {message_id}")
    print(f"Recipients: {len(encrypted_contents)} users")
    
    try:
        # Create base message for history
        msg = EncryptedGroupMessage(from_user.to_dict(), encrypted_contents, message_id)
        msg_dict = msg.to_dict()
        
        # Store base message in history
        messages.append(msg_dict)
        if len(messages) > 200:
            messages.pop(0)  # simple cap
        
        # Send individualized encrypted content to each recipient through mixnet
        for user_id, encrypted_content in encrypted_contents.items():
            recipient = next((u for u in users.values() if u.id == user_id), None)
            if recipient:
                print(f"Routing encrypted message to {recipient.name} (ID: {recipient.id}) through mixnet")
                # Add to mixnet instead of emitting directly
                mixnet_manager.add_message(
                    encrypted_content=encrypted_content,
                    recipient_id=recipient.id,
                    user_data=from_user.to_dict(),
                    message_id=message_id,
                    message_type='group'
                )
            else:
                print(f"Warning: Recipient with ID {user_id} not found")
        
        print(f"Encrypted group message sent from {from_user.name} to {len(encrypted_contents)} recipients")
    except Exception as e:
        print(f"Error processing encrypted group message: {e}")


# NEW SOCKET.IO HANDLERS

@socketio.on('get_anon_tally_pubkey')
def handle_get_anon_tally_pubkey():
    pem = anon_polls.public_key()
    print("ANONPOLL: served tally public key (PEM length:", len(pem), ")")
    emit('anon_tally_pubkey', {'pem': pem}, room=request.sid)

@socketio.on('pir_get_anon_tally_pubkey')
def handle_pir_get_anon_tally_pubkey():
    # Provide the tally key via PIR database of size 1 (for API symmetry)
    db = [anon_polls.public_key()]
    q = PIR.generate_query(total_items=len(db), target_index=0)
    pem = PIR.process_query(db, q)
    print("ANONPOLL: PIR served tally public key (PEM length:", len(pem) if pem else 0, ")")
    emit('anon_tally_pubkey', {'pem': pem}, room=request.sid)

@socketio.on('create_anon_poll')
def handle_create_anon_poll(data):
    socket_id = request.sid
    user = users.get(socket_id)
    if not user:
        return
    question = (data.get('question') or '').strip()
    options = [o.strip() for o in (data.get('options') or []) if isinstance(o, str) and o.strip()]
    try:
        poll_id = anon_polls.create_poll(question, user.name, options)
    except Exception as e:
        emit('error_msg', f'Anonymous poll error: {e}')
        return
    pub = anon_polls.public_results(poll_id)
    print(f"ANONPOLL: create poll={poll_id} q='{question}' opts={len(pub.get('options', []))}")
    emit('anon_poll_new', pub, room=ROOM_NAME)
    # Send finalize token only to creator
    tok = anon_polls.mint_finalize_token(poll_id)
    if tok:
        print(f"ANONPOLL: issued finalize token to creator {user.name} for poll={poll_id}")
        emit('anon_finalize_token', { 'pollId': poll_id, **tok }, room=socket_id)
    # Note: do not emit key-rotation here to avoid clearing creator's UI/token prematurely.

@socketio.on('mint_anon_vote_token')
def handle_mint_anon_vote_token(data):
    poll_id = data.get('pollId')
    tok = anon_polls.mint_vote_token(poll_id)
    if not tok:
        emit('error_msg', 'Invalid anonymous poll ID')
        return
    # NOTE: This does not tie token to a user on the server.
    print(f"ANONPOLL: minted vote token for poll={poll_id}")
    emit('anon_vote_token', {'pollId': poll_id, **tok}, room=request.sid)

@socketio.on('pir_mint_anon_vote_token')
def handle_pir_mint_anon_vote_token(data):
    poll_id = data.get('pollId')
    db = anon_polls.pir_token_database(poll_id, min_size=256)
    if not db:
        emit('error_msg', 'Invalid anonymous poll ID')
        return
    # Select a random index to avoid reusing the same token across attempts
    idx = random.randrange(len(db))
    q = PIR.generate_query(total_items=len(db), target_index=idx)
    tok = PIR.process_query(db, q)
    if not tok:
        emit('error_msg', 'No anonymous vote tokens available')
        return
    print(f"ANONPOLL: PIR served vote token for poll={poll_id}")
    emit('anon_vote_token', {'pollId': poll_id, **tok}, room=request.sid)

@socketio.on('cast_anon_vote')
def handle_cast_anon_vote(data):
    poll_id = data.get('pollId')
    token = data.get('token')
    sig = data.get('sig')
    ciphertext = data.get('ciphertext')
    ok = anon_polls.submit_encrypted_vote(poll_id=poll_id, token=token, sig=sig, ciphertext=ciphertext)
    if ok:
        print(f"ANONPOLL: ballot accepted poll={poll_id} ct_len={len(ciphertext) if ciphertext else 0}")
        emit('anon_ballot_queued', {'pollId': poll_id}, room=request.sid)
    else:
        print(f"ANONPOLL: ballot rejected poll={poll_id}")
        emit('error_msg', 'Anonymous ballot rejected')

@socketio.on('finalize_anon_poll')
def handle_finalize_anon_poll(data):
    poll_id = data.get('pollId')
    nonce = data.get('nonce')
    sig = data.get('sig')
    res = anon_polls.finalize(poll_id, finalize_nonce=nonce, finalize_sig=sig)
    if res:
        # Only aggregated counts are ever emitted
        print("ANONPOLL: finalized", poll_id, "→", [(o['text'], o['votes']) for o in res['options']])
        emit('anon_poll_final', res, room=ROOM_NAME)
        # After finalize, notify clients that crypto state rotated; keys/tokens must refresh
        emit('anon_tally_key_rotated', {}, room=ROOM_NAME)
    else:
        emit('error_msg', 'Unknown anonymous poll')


if __name__ == '__main__':
    # Start mixnet processing
    start_mixnet_processing()
    
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

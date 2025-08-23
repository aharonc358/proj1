# Mini Chat + Polls (Python Version) with Enhanced Security

A Python implementation of the WhatsApp-style demo chat application with comprehensive end-to-end encryption, mixnet-based anonymity, and advanced privacy features.

## Project Overview

This application demonstrates a modern secure messaging platform with robust privacy protections. It combines real-time communication features with multiple layers of cryptographic security to ensure:

1. Message confidentiality (no one but the intended recipient can read messages)
2. Metadata privacy (protecting who talks to whom)
3. Temporal anonymity (obscuring when messages are sent)
4. User-friendly security indicators

## Key Security Features

### End-to-End Encryption

- **OpenPGP-based Encryption**: All messages are encrypted in the browser before transmission using OpenPGP, ensuring the server never sees message contents
- **Client-Side Key Generation**: Cryptographic keys are generated in the user's browser, keeping private keys local
- **Automatic Key Exchange**: Public keys are automatically distributed to other users upon joining
- **Per-Recipient Encryption**: Group messages are individually encrypted for each recipient
- **Support for Private & Group Messages**: All communications are protected, whether one-to-one or group-based

### Three-Node Mixnet (Anonymity Network)

- **Complete Three-Node Cascade**: Messages pass through three independent mix nodes before delivery
- **Message Batching**: Messages are collected into batches before processing, preventing timing correlation
- **Random Shuffling**: Each node independently shuffles messages to break sequence correlation
- **Variable Timing Delays**: Random delays are added to messages to prevent timing analysis
- **Multi-Stage Processing**: Each message must pass through all three nodes to be marked as "mixed"
- **Processing Verification**: Each message tracks which nodes have processed it
- **Metadata Protection**: Mix nodes operate on encrypted data, preventing them from seeing message contents

### Privacy-Preserving UX Features

- **Security Information Panel**: Consolidated security status indicator in the application interface
- **Message Encryption Indicators**: Visual indicator (🔒) shows when messages are encrypted
- **Mixnet Processing Indicators**: Visual indicator (🔀) shows when messages have passed through the full mixnet
- **Private Chat Management**: Automatic clearing of chat history when conversations are closed
- **Conversation Isolation**: Private chat windows maintain separate encryption contexts

### Enhanced Privacy Protection

- **Chat History Clearing**: Private message history is cleared when a conversation is closed
- **Session Isolation**: Reopening chats creates fresh conversation contexts
- **Decrypted Content Protection**: Decrypted messages remain in the browser without being transmitted

## Technical Implementation

### Cryptographic Modules

- `crypto/elgamal.py`: Implementation of ElGamal encryption for asymmetric cryptography
- `crypto/mixnet.py`: Implementation of mixnet for anonymous message routing
  - `MixNode`: Individual mixing node with batching, shuffling, and delay capabilities
  - `MixnetManager`: Orchestrates message flow through multiple mix nodes in sequence
- `public/crypto-utils.js`: Client-side encryption and key management

### Security Workflow

1. **Key Generation & Exchange**:
   - Browser generates OpenPGP key pair on user join
   - Public key shared with all participants
   - Keys stored in secure in-memory structures

2. **Message Encryption**:
   - Sender encrypts message individually for each recipient
   - Each message is assigned a unique identifier
   - Encrypted contents are packaged with metadata

3. **Anonymous Routing**:
   - Encrypted messages enter the first mix node
   - Messages are batched until threshold is reached
   - Batch is shuffled and delays are added
   - Process repeats through nodes 2 and 3
   - Full path history is tracked

4. **Message Delivery & Decryption**:
   - Fully mixed messages are delivered to recipients
   - Recipients decrypt using their private keys
   - Security indicators show encryption and mixing status

## Security Considerations & Limitations

- **In-Memory Storage**: This implementation uses in-memory storage and is intended for educational/demonstration purposes
- **Trust Boundaries**: The server must be trusted for message delivery, though it cannot read message contents
- **Mixnet Limitations**: Current implementation provides strong but not perfect anonymity (correlations still possible with very small user bases)
- **Key Management**: Keys are generated per session and not persisted (no long-term identity verification)
- **Message Persistence**: Cleared messages are removed from server memory but may persist in browser memory

## Future Security Enhancements

- **Onion Encryption for Mixnet**: Adding layered encryption to further enhance mixnet security
- **Homomorphic Encryption for Polls**: Allow secure, private voting with encrypted tallying
- **Private Information Retrieval**: Access information without revealing which data was accessed
- **Perfect Forward Secrecy**: Session key rotation for stronger security over time
- **Persistent Identity Verification**: Long-term identity verification through key continuity

## Project Structure

```
proj1/
├── app.py                   # Main Flask application with mixnet integration
├── crypto/                  # Cryptographic modules
│   ├── __init__.py
│   ├── elgamal.py           # ElGamal encryption implementation
│   ├── mixnet.py            # Three-node mixnet implementation for anonymity
│   └── pir.py               # Private Information Retrieval (future)
├── models/                  # Data models
│   ├── __init__.py
│   ├── user.py              # User model with encryption key management
│   ├── message.py           # Message models with encryption support
│   └── poll.py              # Poll model
├── public/                  # Static files
│   ├── index_python.html    # Enhanced UI with security indicators
│   ├── client_python.js     # Client with encryption and mixnet support
│   ├── crypto-utils.js      # OpenPGP implementation for browser
│   └── styles.css           # Styling including security indicators
└── requirements.txt         # Python dependencies
```

## Setup & Installation

### Prerequisites

- Python 3.9+ (recommended Python 3.11+)
- pip (Python package manager)
- Modern browser with Web Crypto API support

### Installation

1. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Linux/Mac
   # or
   venv\Scripts\activate     # On Windows
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running the Application

1. Start the server:
   ```bash
   python app.py
   ```

2. Open http://localhost:3001 in multiple tabs to simulate multiple users.

## Security Testing

1. **Verify End-to-End Encryption**:
   - Open the application in two different browsers
   - Exchange messages and verify the encryption icon (🔒) appears
   - Check browser console to observe encryption operations

2. **Verify Mixnet Processing**:
   - Send messages between users
   - Verify the mixnet icon (🔀) appears on successfully mixed messages
   - Observe server logs to see messages passing through all three mix nodes

3. **Verify Private Chat Security**:
   - Open private chats between users
   - Exchange messages and verify encryption
   - Close and reopen the chat to verify history clearing

## Notes

- This implementation runs on port 3001 by default (to avoid conflicts with the Node.js version)
- Uses in-memory storage: messages (capped), polls, users
- Room cap: 10 users (same as original)
- This is a development/demo application, not intended for production use

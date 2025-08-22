# Mini Chat + Polls (Python Version)

A Python implementation of the WhatsApp-style demo chat application with end-to-end encryption and privacy features.

## Features

Original features:
- Group **text chat**
- **Private one-to-one chat**
- **Create polls** and **vote** (one vote per user, re-vote changes your choice)
- Real-time updates (Socket.IO)

Planned security enhancements:
- **End-to-End Encrypted Messaging** - ElGamal encryption ensuring only the intended recipient can read messages
- **Anonymous & Unlinkable Voting** - Prevents anyone from linking votes to specific users
- **Metadata Protection** - Prevents user identification or profiling from metadata
- **Private Information Retrieval** - Access polls without revealing which one you're viewing

## Project Structure

```
proj1/
├── app.py                   # Main Flask application
├── crypto/                  # Cryptographic modules
│   ├── __init__.py
│   ├── elgamal.py           # ElGamal encryption implementation
│   ├── mixnet.py            # Mixnet implementation for anonymity
│   └── pir.py               # Private Information Retrieval implementation
├── models/                  # Data models
│   ├── __init__.py
│   ├── user.py              # User model
│   ├── message.py           # Message models
│   └── poll.py              # Poll model
├── public/                  # Static files (unchanged from original)
│   ├── index.html
│   ├── client.js
│   └── styles.css
└── requirements.txt         # Python dependencies
```

## Setup & Installation

### Prerequisites

- Python 3.9+ (recommended Python 3.11+)
- pip (Python package manager)

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

## Implementation Phases

1. **Phase 1: Python Server Rewrite** (Current)
   - Port Node.js server to Python with Flask + Socket.IO
   - Maintain the same functionality
   - Set up modular architecture for security extensions

2. **Phase 2: End-to-End Encryption for Messages**
   - Implement ElGamal encryption
   - Apply to group and private messages
   - Add mixnet for anonymity

3. **Phase 3: Secure Anonymous Voting**
   - Extend mixnet for voting
   - Implement homomorphic vote tallying
   - Ensure anonymity and unlinkability

4. **Phase 4: Private Information Retrieval**
   - Implement PIR algorithms
   - Apply to poll access
   - Complete metadata protection

## Notes

- This implementation runs on port 3001 by default (to avoid conflicts with the Node.js version)
- Uses in-memory storage: messages (capped), polls, users
- Room cap: 10 users (same as original)
- This is a development/demo application, not intended for production use

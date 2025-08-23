"""
Mixnet implementation for anonymous messaging.

This module provides mixnet functionality for anonymous message delivery,
using batching, shuffling, and random delays to enhance privacy.
"""
import random
import time


class MixNode:
    """
    Single node in a mixnet cascade.
    
    Each node collects messages into batches, shuffles them, and adds
    random delays to prevent timing analysis.
    """
    
    def __init__(self, name, batch_size=3, max_delay_ms=500):
        """
        Initialize a mix node.
        
        Args:
            name (str): Name of this mix node for identification
            batch_size (int): Minimum number of messages to process in a batch
            max_delay_ms (int): Maximum delay in milliseconds to add to each message
        """
        self.name = name
        self.batch_size = batch_size
        self.max_delay_ms = max_delay_ms
        self.message_pool = []
        
    def add_message(self, message):
        """
        Add a message to this node's pool.
        
        Args:
            message (dict): Message object containing encrypted content and metadata
            
        Returns:
            bool: True if message was added to the pool
        """
        self.message_pool.append(message)
        return True
           
    def process_batch(self):
        """
        Process a batch of messages with shuffling and delays.
        
        Returns:
            list: Processed messages or empty list if batch size not reached
        """
        if len(self.message_pool) < self.batch_size:
            return []
               
        # Take a batch of messages
        batch = self.message_pool[:self.batch_size]
        self.message_pool = self.message_pool[self.batch_size:]
           
        # Shuffle the batch to break correlation
        random.shuffle(batch)
           
        # Apply random delays with minimum base delay for privacy protection
        processed = []
        base_delay = 10  # Minimum 10ms base delay for all messages for minimal anonymity
        for message in batch:
            # Add processing metadata with base delay + small random component
            message['delay'] = base_delay + random.randint(0, self.max_delay_ms - base_delay)
            message['processed_by'] = self.name
            processed.append(message)
               
        return processed


class MixnetManager:
    """
    Manages a cascade of mix nodes for anonymous message delivery.
    
    Routes messages through multiple mix nodes in sequence, with each node
    shuffling and delaying messages to enhance anonymity.
    """
    
    def __init__(self, socketio_instance):
        """
        Initialize the mixnet manager.
        
        Args:
            socketio_instance: Flask-SocketIO instance for message delivery
        """
        self.nodes = []
        self.socketio = socketio_instance
        self.processing = False
           
    def add_node(self, node):
        """
        Add a mix node to the cascade.
        
        Args:
            node (MixNode): Node to add to the cascade
            
        Returns:
            bool: True if node was added
        """
        self.nodes.append(node)
        return True
           
    def add_message(self, encrypted_content, recipient_id, user_data, message_id, message_type='group'):
        """
        Add a message to the mixnet for anonymous delivery.
        
        Args:
            encrypted_content (str): Encrypted message content
            recipient_id (str): ID of the recipient
            user_data (dict): Data about the user sending the message
            message_id (str): Unique ID for this message
            message_type (str): 'group' or 'private'
            
        Returns:
            bool: True if message was added successfully
        """
        if not self.nodes:
            return False
               
        # Create message object
        message = {
            'encrypted': encrypted_content,
            'recipient': recipient_id,
            'timestamp': time.time(),
            'user_data': user_data,
            'message_id': message_id,
            'type': message_type
        }
           
        # Add to first node in cascade
        self.nodes[0].add_message(message)
        return True
           
    def process_messages(self):
        """
        Process messages through the cascade of mix nodes.
        
        For the first stage, this only processes through a single node.
        Later stages will implement full cascade mixing.
        """
        if not self.nodes or self.processing:
            return
           
        self.processing = True
           
        try:
            # Process through the first (and currently only) node
            messages = self.nodes[0].process_batch()
               
            # For future stages, additional nodes will be used here
               
            # Deliver processed messages
            self._deliver_messages(messages)
        except Exception as e:
            print(f"Error in mixnet processing: {e}")
        finally:
            self.processing = False
               
    def _deliver_messages(self, messages):
        """
        Deliver processed messages to recipients.
        
        Args:
            messages (list): List of processed messages to deliver
        """
        for msg in messages:
            # Add random delay before delivery based on mix node processing
            self.socketio.sleep(msg['delay'] / 1000.0)
               
            # Currently only handling group messages
            if msg['type'] == 'group':
                # Emit group message using existing format
                self.socketio.emit('encrypted_group_message', {
                    'encryptedContent': msg['encrypted'],
                    'user': msg['user_data'],
                    'messageId': msg['message_id'],
                    'ts': int(time.time() * 1000)
                }, room=msg['recipient'])


# Keep original classes for backward compatibility
class Mixnet:
    """Legacy Mixnet class for backward compatibility."""
    
    def __init__(self, batch_size=3, max_delay_ms=500):
        self.message_pool = []
        self.batch_size = batch_size
        self.max_delay_ms = max_delay_ms
        self.processing = False
        
    def add_message(self, encrypted_message, recipient_id):
        self.message_pool.append({
            'encrypted': encrypted_message,
            'recipient': recipient_id,
            'timestamp': time.time()
        })
        return True
        
    def process_batch(self):
        pass
        
    def get_messages_for_recipient(self, recipient_id):
        messages = []
        for msg in self.message_pool:
            if msg['recipient'] == recipient_id:
                messages.append(msg['encrypted'])
        return messages


class VoteMixnet(Mixnet):
    """Legacy VoteMixnet class for backward compatibility."""
    
    def __init__(self):
        super().__init__(batch_size=5, max_delay_ms=1000)
        self.votes = {}
        
    def add_vote(self, poll_id, encrypted_vote):
        if poll_id not in self.votes:
            self.votes[poll_id] = []
        self.votes[poll_id].append(encrypted_vote)
        return True
        
    def shuffle_votes(self, poll_id):
        if poll_id not in self.votes or not self.votes[poll_id]:
            return False
        random.shuffle(self.votes[poll_id])
        return True
        
    def get_votes(self, poll_id):
        return self.votes.get(poll_id, [])

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
        message_id = message.get('message_id', 'unknown')
        print(f"[{self.name}] Adding message {message_id} to pool (current pool size: {len(self.message_pool)})")
        self.message_pool.append(message)
        return True
           
    def process_batch(self):
        """
        Process a batch of messages with shuffling and delays.
        
        Returns:
            list: Processed messages or empty list if batch size not reached
        """
        if len(self.message_pool) < self.batch_size:
            # No logging for empty/insufficient message pools
            return []
               
        # Take a batch of messages
        batch = self.message_pool[:self.batch_size]
        self.message_pool = self.message_pool[self.batch_size:]
        
        message_ids = [msg.get('message_id', 'unknown') for msg in batch]
        print(f"[{self.name}] Processing batch of {len(batch)} messages: {message_ids}")
           
        # Shuffle the batch to break correlation
        random.shuffle(batch)
        print(f"[{self.name}] Batch shuffled")
           
        # Apply random delays with minimum base delay for privacy protection
        processed = []
        base_delay = 10  # Minimum 10ms base delay for all messages for minimal anonymity
        for message in batch:
            # Track node processing history
            if 'processed_by_nodes' not in message:
                message['processed_by_nodes'] = []
            message['processed_by_nodes'].append(self.name)
            
            # Add processing metadata with base delay + small random component
            message['delay'] = base_delay + random.randint(0, self.max_delay_ms - base_delay)
            message['processed_by'] = self.name
            processed.append(message)
            
            message_id = message.get('message_id', 'unknown')
            print(f"[{self.name}] Processed message {message_id} with delay {message['delay']}ms (node history: {message['processed_by_nodes']})")
               
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
        """
        if not self.nodes:
            print("ERROR: No mix nodes configured in mixnet")
            return
            
        if self.processing:
            return
        
        # Check if any node has messages to process
        has_messages = any(len(node.message_pool) > 0 for node in self.nodes)
        
        # Skip all logging if no messages to process
        if not has_messages:
            return
        
        self.processing = True
        
        try:
            print("\n--- Starting mixnet processing cycle ---")
            
            # Start with the first node
            print(f"Processing through first node ({self.nodes[0].name})...")
            messages = self.nodes[0].process_batch()
            if not messages:
                print(f"No messages from first node ({self.nodes[0].name}) meet batch size requirement")
                return
            
            print(f"First node processed {len(messages)} messages")
            
            # Pass through subsequent nodes in cascade
            for i, node in enumerate(self.nodes[1:], 1):
                print(f"Processing through node {i+1}/{len(self.nodes)} ({node.name})...")
                
                if not messages:  # No messages from previous node
                    print(f"No messages to process in node {node.name}, breaking cascade")
                    break
                    
                # Add all messages to next node
                for msg in messages:
                    node.add_message(msg)
                    
                # Process through this node
                messages = node.process_batch()
                print(f"Node {node.name} output {len(messages)} messages")
            
            if messages:
                print(f"Final output: {len(messages)} messages completed full mixnet cascade")
                # Deliver processed messages (only those that made it through all nodes)
                self._deliver_messages(messages)
            else:
                print("WARNING: No messages completed the full mixnet cascade")
                
            print("--- Mixnet processing cycle complete ---\n")
            
        except Exception as e:
            print(f"ERROR in mixnet processing: {e}")
            import traceback
            print(traceback.format_exc())  # Print full stack trace for debugging
        finally:
            self.processing = False
               
    def _deliver_messages(self, messages):
        """
        Deliver processed messages to recipients.
        
        Args:
            messages (list): List of processed messages to deliver
        """
        for msg in messages:
            message_id = msg.get('message_id', 'unknown')
            
            # Verify this message has gone through all nodes
            processed_nodes = msg.get('processed_by_nodes', [])
            all_node_names = [node.name for node in self.nodes]
            fully_mixed = all(node_name in processed_nodes for node_name in all_node_names)
            
            if not fully_mixed:
                print(f"WARNING: Message {message_id} did not pass through all mix nodes.")
                print(f"  - Processed by: {processed_nodes}")
                print(f"  - Required nodes: {all_node_names}")
                # Continue delivery but without mixed flag
            
            # Add random delay before delivery based on mix node processing
            self.socketio.sleep(msg['delay'] / 1000.0)
            
            message_type = msg['type']
            recipient_id = msg['recipient']
            
            print(f"Delivering {message_type} message {message_id} to recipient {recipient_id}")
            print(f"  - Processed by nodes: {processed_nodes}")
            print(f"  - Fully mixed: {fully_mixed}")
            
            # Handle group messages
            if message_type == 'group':
                self.socketio.emit('encrypted_group_message', {
                    'encryptedContent': msg['encrypted'],
                    'user': msg['user_data'],
                    'messageId': message_id,
                    'ts': int(time.time() * 1000),
                    'mixed': fully_mixed  # Only true if processed by all nodes
                }, room=recipient_id)
            
            # Handle private messages
            elif message_type == 'private':
                self.socketio.emit('encrypted_private_message', {
                    'encryptedContent': msg['encrypted'],
                    'from': msg['user_data']['from'],
                    'to': msg['user_data']['to'],
                    'messageId': message_id,
                    'ts': int(time.time() * 1000),
                    'mixed': fully_mixed  # Only true if processed by all nodes
                }, room=recipient_id)


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

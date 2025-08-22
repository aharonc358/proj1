"""
Message models for the chat application.

This module includes models for both regular and encrypted messages,
supporting both group and private communications.
"""
import uuid
import time


class Message:
    """
    Represents a message in the group chat.
    """
    
    def __init__(self, user, text):
        """
        Initialize a new message.
        
        Args:
            user (dict): The user who sent the message
            text (str): The content of the message
        """
        self.id = str(uuid.uuid4())
        self.user = user
        self.text = text
        self.ts = int(time.time() * 1000)
        self.encrypted = False  # Will be used in Phase 2
        
    def to_dict(self):
        """
        Convert the message to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the message
        """
        return {
            'id': self.id,
            'user': self.user,
            'text': self.text,
            'ts': self.ts,
            'encrypted': self.encrypted
        }
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a message from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a message
            
        Returns:
            Message: A new Message instance
        """
        msg = cls(data['user'], data['text'])
        msg.id = data.get('id', str(uuid.uuid4()))
        msg.ts = data.get('ts', int(time.time() * 1000))
        msg.encrypted = data.get('encrypted', False)
        return msg


class PrivateMessage:
    """
    Represents a private message between two users.
    """
    
    def __init__(self, from_user, to_user, text):
        """
        Initialize a new private message.
        
        Args:
            from_user (dict): The user who sent the message
            to_user (dict): The user who received the message
            text (str): The content of the message
        """
        self.id = str(uuid.uuid4())
        self.from_user = from_user
        self.to_user = to_user
        self.text = text
        self.ts = int(time.time() * 1000)
        self.encrypted = False  # Will be used in Phase 2
        
    def to_dict(self):
        """
        Convert the private message to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the private message
        """
        return {
            'id': self.id,
            'from': self.from_user,
            'to': self.to_user,
            'text': self.text,
            'ts': self.ts,
            'encrypted': self.encrypted
        }
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a private message from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a private message
            
        Returns:
            PrivateMessage: A new PrivateMessage instance
        """
        msg = cls(data['from'], data['to'], data['text'])
        msg.id = data.get('id', str(uuid.uuid4()))
        msg.ts = data.get('ts', int(time.time() * 1000))
        msg.encrypted = data.get('encrypted', False)
        return msg


class EncryptedMessage(Message):
    """
    Represents an encrypted message in the group chat.
    """
    
    def __init__(self, user, encrypted_content):
        """
        Initialize a new encrypted message.
        
        Args:
            user (dict): The user who sent the message
            encrypted_content (str): The encrypted content of the message
        """
        super().__init__(user, "[encrypted]")  # Placeholder text
        self.encrypted = True
        self.encrypted_content = encrypted_content
        
    def to_dict(self):
        """
        Convert the message to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the message
        """
        data = super().to_dict()
        data['encrypted'] = True
        data['encryptedContent'] = self.encrypted_content
        return data
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a message from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a message
            
        Returns:
            EncryptedMessage: A new EncryptedMessage instance
        """
        msg = cls(data['user'], data.get('encryptedContent', ''))
        msg.id = data.get('id', str(uuid.uuid4()))
        msg.ts = data.get('ts', int(time.time() * 1000))
        return msg


class EncryptedPrivateMessage(PrivateMessage):
    """
    Represents an encrypted private message between two users.
    """
    
    def __init__(self, from_user, to_user, encrypted_content):
        """
        Initialize a new encrypted private message.
        
        Args:
            from_user (dict): The user who sent the message
            to_user (dict): The user who received the message
            encrypted_content (str): The encrypted content
        """
        super().__init__(from_user, to_user, "[encrypted]")  # Placeholder text
        self.encrypted = True
        self.encrypted_content = encrypted_content
        
    def to_dict(self):
        """
        Convert the private message to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the private message
        """
        data = super().to_dict()
        data['encrypted'] = True
        data['encryptedContent'] = self.encrypted_content
        return data
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a private message from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a private message
            
        Returns:
            EncryptedPrivateMessage: A new EncryptedPrivateMessage instance
        """
        msg = cls(data['from'], data['to'], data.get('encryptedContent', ''))
        msg.id = data.get('id', str(uuid.uuid4()))
        msg.ts = data.get('ts', int(time.time() * 1000))
        return msg

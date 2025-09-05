"""
User model for the chat application.
"""
import time
from crypto.elgamal import ElGamalCrypto


class User:
    """
    Represents a user in the chat application.
    """
    
    def __init__(self, id, name, generate_keys=True):
        """
        Initialize a new user.
        
        Args:
            id (str): The user's ID (usually socket ID)
            name (str): The user's display name
            generate_keys (bool): Whether to generate encryption keys
        """
        self.id = id
        self.name = name
        self.in_room = True
        self.joined_at = int(time.time() * 1000)
        
        # Encryption keys
        self.keys = None
        self.public_key = None
        self.private_key = None
        
        if generate_keys:
            self.generate_encryption_keys()
        
    def generate_encryption_keys(self):
        """Generate ElGamal encryption keys for this user."""
        try:
            self.keys = ElGamalCrypto.generate_keypair()
            self.public_key = self.keys.get('public_key')
            self.private_key = self.keys.get('private_key')
            return True
        except Exception as e:
            print(f"Error generating keys for user {self.id}: {e}")
            return False
    
    def to_dict(self):
        """
        Convert the user to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the user
        """
        return {
            'id': self.id,
            'name': self.name,
            'in_room': self.in_room,
            'joinedAt': self.joined_at,
            'publicKey': self.public_key
            # Note: private_key is never included
        }
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a user from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a user
            
        Returns:
            User: A new User instance
        """
        user = cls(data['id'], data['name'], generate_keys=False)
        user.in_room = data.get('in_room', True)
        user.joined_at = data.get('joinedAt', int(time.time() * 1000))
        user.public_key = data.get('publicKey')
        return user
    
    def set_public_key(self, public_key):
        """
        Set the user's public key.
        
        Args:
            public_key (str): PEM-encoded public key
            
        Returns:
            bool: Whether the key was successfully set
        """
        if public_key:
            self.public_key = public_key
            return True
        return False

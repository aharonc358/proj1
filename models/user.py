"""
User model for the chat application.
"""
import time


class User:
    """
    Represents a user in the chat application.
    """
    
    def __init__(self, id, name):
        """
        Initialize a new user.
        
        Args:
            id (str): The user's ID (usually socket ID)
            name (str): The user's display name
        """
        self.id = id
        self.name = name
        self.in_room = True
        self.joined_at = int(time.time() * 1000)
        self.public_key = None  # Will be used for E2E encryption in Phase 2
        
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
        user = cls(data['id'], data['name'])
        user.in_room = data.get('in_room', True)
        user.joined_at = data.get('joinedAt', int(time.time() * 1000))
        user.public_key = data.get('publicKey')
        return user

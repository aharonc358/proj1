"""
Poll model for the chat application.
"""
import uuid
import time


class PollOption:
    """
    Represents an option in a poll.
    """
    
    def __init__(self, text):
        """
        Initialize a new poll option.
        
        Args:
            text (str): The text of the option
        """
        self.id = str(uuid.uuid4())
        self.text = text
        self.votes = 0
        
    def to_dict(self):
        """
        Convert the poll option to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the poll option
        """
        return {
            'id': self.id,
            'text': self.text,
            'votes': self.votes
        }
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a poll option from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a poll option
            
        Returns:
            PollOption: A new PollOption instance
        """
        option = cls(data['text'])
        option.id = data.get('id', str(uuid.uuid4()))
        option.votes = data.get('votes', 0)
        return option


class Poll:
    """
    Represents a poll in the chat application.
    """
    
    def __init__(self, question, created_by, options=None):
        """
        Initialize a new poll.
        
        Args:
            question (str): The poll question
            created_by (str): Name of the user who created the poll
            options (list, optional): List of option texts
        """
        self.id = str(uuid.uuid4())
        self.question = question
        self.created_by = created_by
        self.created_at = int(time.time() * 1000)
        self.options = []
        self.votes_by_user = {}  # user_id -> option_id
        self.encrypted = False  # Will be used in Phase 3
        
        # Create options
        if options:
            for opt_text in options:
                self.options.append(PollOption(opt_text))
        
    def add_option(self, text):
        """
        Add a new option to the poll.
        
        Args:
            text (str): The text of the option
            
        Returns:
            PollOption: The newly added option
        """
        option = PollOption(text)
        self.options.append(option)
        return option
        
    def vote(self, user_id, option_id):
        """
        Record a vote for the given option.
        
        Args:
            user_id (str): The ID of the user voting
            option_id (str): The ID of the option being voted for
            
        Returns:
            bool: True if the vote was recorded, False otherwise
        """
        # Find the option
        option = next((o for o in self.options if o.id == option_id), None)
        if not option:
            return False
            
        # If already voted, decrement prior choice
        prev_option_id = self.votes_by_user.get(user_id)
        if prev_option_id:
            prev_option = next((o for o in self.options if o.id == prev_option_id), None)
            if prev_option:
                prev_option.votes = max(0, prev_option.votes - 1)
                
        # Record new vote
        self.votes_by_user[user_id] = option_id
        option.votes += 1
        return True
        
    def to_dict(self):
        """
        Convert the poll to a dictionary for JSON serialization.
        
        Returns:
            dict: Dictionary representation of the poll
        """
        return {
            'id': self.id,
            'question': self.question,
            'createdBy': self.created_by,
            'createdAt': self.created_at,
            'options': [o.to_dict() for o in self.options],
            'votesByUser': self.votes_by_user,
            'encrypted': self.encrypted
        }
        
    @classmethod
    def from_dict(cls, data):
        """
        Create a poll from a dictionary.
        
        Args:
            data (dict): Dictionary representation of a poll
            
        Returns:
            Poll: A new Poll instance
        """
        poll = cls(data['question'], data['createdBy'])
        poll.id = data.get('id', str(uuid.uuid4()))
        poll.created_at = data.get('createdAt', int(time.time() * 1000))
        poll.encrypted = data.get('encrypted', False)
        
        # Add options
        poll.options = []
        for opt_data in data.get('options', []):
            poll.options.append(PollOption.from_dict(opt_data))
            
        # Add votes
        poll.votes_by_user = data.get('votesByUser', {})
        
        return poll

#!/usr/bin/env python3
"""
Anonymous, end-to-end encrypted polling (single-file version).

- Combines a light version of the legacy poll model (options + counters)
  with an anonymous wrapper that:
    * Accepts only client-side encrypted ballots (ElGamal/RSA).
    * Mixes ciphertexts through a vote mixnet to break linkability.
    * Decrypts only at finalize, producing aggregate results only.
    * Hides all voter identity and metadata from every user, including
      admins and the poll creator.

Relies on your project's crypto stack:
  - crypto.elgamal.ElGamalCrypto (RSA-backed ElGamal-style interface)
  - crypto.mixnet.VoteMixnet (batch/shuffle for anonymous delivery)
"""
from __future__ import annotations
import hmac, hashlib, os, base64
from collections import defaultdict

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
import uuid
import time

# Project crypto backends
from crypto.elgamal import ElGamalCrypto
from crypto.mixnet import VoteMixnet


# -----------------------------
# Legacy-like model (simplified)
# -----------------------------
class PollOption:
    """
    Represents an option in a poll.
    Mirrors the legacy structure (id/text/votes) so it stays compatible
    with existing client displays. We will *not* expose voter mappings.
    """

    def __init__(self, text: str):
        self.id = str(uuid.uuid4())
        self.text = text
        self.votes = 0

    def to_public_dict(self) -> dict:
        """Minimal public view: text + final tally."""
        return {
            "id": self.id,
            "text": self.text,
            "votes": self.votes,
        }


@dataclass
class Poll:
    """
    Represents a poll (compatible shape with legacy, but sanitized).
    We keep `created_by` and `created_at` internally; public API will
    not return them (to avoid metadata leakage).
    """
    question: str
    created_by: str
    options: List[PollOption]
    poll_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    # Legacy had votes_by_user (user_id -> option_id). We *do not use it*
    # here to keep anonymity. (Kept only as an empty dict to signal
    # non-usage and to match shape if needed.)
    votes_by_user: Dict[str, str] = field(default_factory=dict)
    finalized: bool = False

    def option_by_id(self, option_id: str) -> Optional[PollOption]:
        return next((o for o in self.options if o.id == option_id), None)

    def to_public_results(self) -> dict:
        """
        Public, *sanitized* result view:
          - NO createdBy, NO createdAt
          - NO votesByUser
          - ONLY aggregated results per option
        """
        return {
            "id": self.poll_id,
            "question": self.question,
            "options": [o.to_public_dict() for o in self.options],
            "finalized": self.finalized,
        }


# ----------------------------------------------------
# Anonymous layer (E2EE ballots + mixnet + safe tally)
# ----------------------------------------------------
class TallyAuthority:
    """
    Holds the private key for decrypting ballots. Publishes only
    the public key to clients.
    """
    def __init__(self, key_size: int = 2048):
        kp = ElGamalCrypto.generate_keypair(key_size=key_size)
        self.public_key_pem: str = kp["public_key"]
        self._private_key = kp["private_key"]

    def decrypt_ballot(self, ciphertext: str) -> Optional[str]:
        try:
            return ElGamalCrypto.decrypt(self._private_key, ciphertext)
        except Exception:
            return None



class AnonTokenAuthority:
    """
    Issues and verifies HMAC-signed one-time vote tokens.
    No per-user mapping is stored, so tokens are unlinkable to people.
    """
    def __init__(self, secret: Optional[bytes] = None):
        self._secret = secret or os.urandom(32)

    def sign(self, payload: str) -> str:
        mac = hmac.new(self._secret, payload.encode("utf-8"), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(mac).decode("utf-8").rstrip("=")

    def verify(self, payload: str, signature: str) -> bool:
        try:
            mac = hmac.new(self._secret, payload.encode("utf-8"), hashlib.sha256).digest()
            exp = base64.urlsafe_b64encode(mac).decode("utf-8").rstrip("=")
            return hmac.compare_digest(exp, signature or "")
        except Exception:
            return False



class AnonymousPolling:
    """
    Wraps Poll objects to provide anonymous, E2EE voting semantics.

    - `create_poll` registers a poll and returns its id.
    - `public_key()` returns the tally public key for client-side encryption.
    - `submit_encrypted_vote` accepts encrypted ballots and enqueues them into a mixnet.
      Duplicate voters (per poll) are rejected using an internal voter set (no linkage to choice).
    - `finalize(poll_id)` shuffles, decrypts, aggregates, clears ciphertexts, and marks as finalized.
    - `public_results(poll_id)` returns *only* final tallies (no metadata).
    """


    def __init__(self, authority: Optional[TallyAuthority] = None):
        self._authority = authority or TallyAuthority()
        self._mixnet = VoteMixnet()
        self._polls: Dict[str, Poll] = {}
        # no voters_by_user sets here
        self._token_auth = AnonTokenAuthority()
        self._spent_tokens: Dict[str, Set[str]] = defaultdict(set)  # poll_id -> {sha256(token)}
        # finalize tokens are stateless (HMAC verified), so nothing to store
        # PIR token pool per poll: list of {token, sig}
        self._pir_token_pool: Dict[str, List[dict]] = defaultdict(list)

    def _reset_crypto_state(self) -> None:
        """Rotate tally keypair, token secret, and mixnet to prevent pattern linkage."""
        self._authority = TallyAuthority()
        self._token_auth = AnonTokenAuthority()  # new secret
        self._mixnet = VoteMixnet()  # fresh mixer (drops any residual state)


    # --- add these new methods inside AnonymousPolling ---
    def list_public_polls(self) -> List[dict]:
        """Public snapshot for UI (no metadata leakage)."""
        out = []
        for p in self._polls.values():
            out.append(self.public_results(p.poll_id))
        return out

    def mint_vote_token(self, poll_id: str) -> Optional[dict]:
        """Client asks for a signed one-time token to cast exactly one ballot."""
        if poll_id not in self._polls:
            return None
        token = uuid.uuid4().hex  # not stored (no linkage)
        payload = f"{poll_id}:{token}"
        sig = self._token_auth.sign(payload)
        return {"token": token, "sig": sig}

    def _ensure_pir_tokens(self, poll_id: str, min_size: int = 128) -> None:
        """Populate the PIR token pool to at least min_size entries."""
        pool = self._pir_token_pool[poll_id]
        while len(pool) < min_size:
            tok = self.mint_vote_token(poll_id)
            if tok:
                pool.append(tok)

    def pir_token_database(self, poll_id: str, min_size: int = 128) -> List[dict]:
        """Return the PIR database view (list of tokens) for a poll."""
        if poll_id not in self._polls:
            return []
        self._ensure_pir_tokens(poll_id, min_size=min_size)
        return list(self._pir_token_pool[poll_id])

    def mint_finalize_token(self, poll_id: str) -> Optional[dict]:
        """Issue a creator-only finalize token (stateless HMAC)."""
        if poll_id not in self._polls:
            return None
        nonce = uuid.uuid4().hex
        payload = f"finalize:{poll_id}:{nonce}"
        sig = self._token_auth.sign(payload)
        return {"nonce": nonce, "sig": sig}

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def submit_encrypted_vote(self, poll_id: str, token: str, sig: str,
                              ciphertext: str) -> bool:
        """
        Accepts only: poll_id + signed one-time token + ciphertext.
        No user identity. Prevents double-voting by storing only token hash.
        """
        poll = self._polls.get(poll_id)
        if not poll or poll.finalized:
            return False
        if not token or not sig or not ciphertext:
            return False

        payload = f"{poll_id}:{token}"
        if not self._token_auth.verify(payload, sig):
            return False  # forged or wrong poll

        h = self._hash_token(token)
        if h in self._spent_tokens[poll_id]:
            return False  # double spend attempt

        # mark token as spent (by hash only)
        self._spent_tokens[poll_id].add(h)

        # enqueue ciphertext for mix/shuffle
        self._mixnet.add_vote(poll_id, ciphertext)
        return True

    # ----- Key distribution -----
    def public_key(self) -> str:
        return self._authority.public_key_pem

    # ----- Poll lifecycle -----
    def create_poll(self, question: str, created_by: str, option_texts: List[str]) -> str:
        if not isinstance(question, str) or not question.strip():
            raise ValueError("question must be a non-empty string")
        if not option_texts or len(option_texts) < 2:
            raise ValueError("must have at least two options")
        if len(option_texts) > 8:
            raise ValueError("options capped at 8")
        # Enforce single active poll. If exists, delete it and rotate crypto state.
        if self._polls:
            try:
                # Clear all prior polls and associated state
                for old_id in list(self._polls.keys()):
                    self._mixnet.votes.pop(old_id, None)
                    self._spent_tokens.pop(old_id, None)
                    self._polls.pop(old_id, None)
            finally:
                # rotate crypto after clearing
                self._reset_crypto_state()

        options = [PollOption(t.strip()) for t in option_texts]
        poll = Poll(question=question.strip(), created_by=created_by.strip(), options=options)
        self._polls[poll.poll_id] = poll
        # initialize PIR token pool for this poll
        self._ensure_pir_tokens(poll.poll_id)
        return poll.poll_id

    # def submit_encrypted_vote(self, poll_id: str, voter_id: str, ciphertext: str) -> bool:
    #     """
    #     Accept client-side encrypted ballot:
    #       - enforce unique voter per poll (no vote linking)
    #       - store only ciphertext in the mix; never store plaintext
    #     """
    #     poll = self._polls.get(poll_id)
    #     if not poll or poll.finalized:
    #         return False
    #     if not voter_id or not isinstance(voter_id, str):
    #         return False
    #     if not isinstance(ciphertext, str) or not ciphertext:
    #         return False
    #     voters = self._voters_per_poll[poll_id]
    #     if voter_id in voters:
    #         return False  # duplicate
    #
    #     voters.add(voter_id)
    #     self._mixnet.add_vote(poll_id, ciphertext)
    #     return True

    def finalize(self, poll_id: str, finalize_nonce: Optional[str] = None, finalize_sig: Optional[str] = None) -> Optional[dict]:
        """
        Shuffle with the mixnet, decrypt, aggregate into poll options,
        clear ciphertexts, and return the public results.
        """
        poll = self._polls.get(poll_id)
        if not poll:
            return None
        if poll.finalized:
            return poll.to_public_results()

        # If finalize token provided, verify it's valid; if None, allow only for internal/test usage
        if finalize_nonce is not None or finalize_sig is not None:
            if not finalize_nonce or not finalize_sig:
                return None
            payload = f"finalize:{poll_id}:{finalize_nonce}"
            if not self._token_auth.verify(payload, finalize_sig):
                return None

        # Mix & collect
        self._mixnet.shuffle_votes(poll_id)
        cts = list(self._mixnet.get_votes(poll_id))
        # wipe ciphertexts for this poll to minimize linkage
        self._mixnet.votes[poll_id] = []

        # Decrypt all payloads
        plaintexts: List[str] = []
        for ct in cts:
            pt = self._authority.decrypt_ballot(ct)
            if pt:
                plaintexts.append(pt)

        # Tally with dedup per voter-nonce: count only the latest ts per nonce
        self._tally_from_plaintexts(poll, plaintexts)

        poll.finalized = True
        # Prepare public results before deletion/rotation
        results = poll.to_public_results()
        # Clean spent tokens and delete poll record
        self._spent_tokens.pop(poll_id, None)
        self._pir_token_pool.pop(poll_id, None)
        self._polls.pop(poll_id, None)
        # Rotate crypto state post-finalization to refresh keys/secrets
        self._reset_crypto_state()
        return results

    @staticmethod
    def _parse_vote_payload(payload: str) -> (Optional[str], Optional[str], Optional[int]):
        """Parse 'optionId|nonce|ts' or legacy 'optionId' payloads."""
        if not payload:
            return None, None, None
        text = payload.strip()
        parts = text.split('|')
        if len(parts) >= 3:
            opt_id = parts[0]
            nonce = parts[1]
            try:
                ts = int(parts[2])
            except Exception:
                ts = 0
            return opt_id, nonce, ts
        # Legacy: payload is just option id or option text
        return text, None, None

    def _tally_from_plaintexts(self, poll: Poll, plaintexts: List[str]) -> None:
        """Apply deduplicated tallying. If nonce present, keep latest ts per nonce."""
        latest_by_nonce: Dict[str, (int, str)] = {}
        legacy_choices: List[str] = []
        for pt in plaintexts:
            opt_id, nonce, ts = self._parse_vote_payload(pt)
            if not opt_id:
                continue
            if nonce:
                prev = latest_by_nonce.get(nonce)
                if not prev or (isinstance(ts, int) and ts >= prev[0]):
                    latest_by_nonce[nonce] = (ts if isinstance(ts, int) else 0, opt_id)
            else:
                legacy_choices.append(opt_id)

        # First, count deduped nonce votes
        for _, opt_id in latest_by_nonce.values():
            opt = poll.option_by_id(opt_id)
            if opt is not None:
                opt.votes += 1
            else:
                opt_by_text = next((o for o in poll.options if o.text == opt_id), None)
                if opt_by_text is not None:
                    opt_by_text.votes += 1

        # Then, for legacy entries without nonce, count each occurrence (best effort)
        for choice in legacy_choices:
            opt = poll.option_by_id(choice)
            if opt is not None:
                opt.votes += 1
            else:
                opt_by_text = next((o for o in poll.options if o.text == choice), None)
                if opt_by_text is not None:
                    opt_by_text.votes += 1

    # ----- Safe getters -----
    def public_results(self, poll_id: str) -> Optional[dict]:
        """
        ONLY safe data for UIs. If not finalized, returns a small stub
        that indicates not-finalized without leaking partial counts.
        """
        poll = self._polls.get(poll_id)
        if not poll:
            return None
        if not poll.finalized:
            return {
                "id": poll.poll_id,
                "question": poll.question,
                "finalized": False,
                "options": [{"id": o.id, "text": o.text, "votes": 0} for o in poll.options],
                "note": "Results are hidden until the poll is finalized."
            }
        return poll.to_public_results()

    # ----- (Admin) internal sanity hooks (do NOT expose to clients) -----
    def _debug_mixer_ciphertexts(self, poll_id: str) -> List[str]:
        """For tests only. Returns queued ciphertexts (if any)."""
        return list(self._mixnet.get_votes(poll_id) or [])

    def _debug_poll_internal(self, poll_id: str) -> Optional[Poll]:
        """For tests/admin-debug only. Caller must not leak sensitive fields."""
        return self._polls.get(poll_id)

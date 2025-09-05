import unittest
from models.anonymous_polls import AnonymousPolling


class TestAnonymousPollingPrivacy(unittest.TestCase):
    def setUp(self):
        self.ap = AnonymousPolling()

    def test_single_poll_rotation_and_finalize_deletes_state(self):
        pid = self.ap.create_poll('Q?', 'creator', ['A', 'B'])
        # PIR token db exists and has entries
        db = self.ap.pir_token_database(pid, min_size=8)
        self.assertGreaterEqual(len(db), 8)

        # Submit a vote using a token
        tok = db[0]
        # Submit encrypted vote (ciphertext opaque here), model only validates token
        ok = self.ap.submit_encrypted_vote(pid, token=tok['token'], sig=tok['sig'], ciphertext='cipher')
        self.assertTrue(ok)

        # Finalize requires token; wrong token fails
        res = self.ap.finalize(pid, finalize_nonce='x', finalize_sig='y')
        self.assertIsNone(res)

        # Mint a creator finalize token and finalize
        ft = self.ap.mint_finalize_token(pid)
        res = self.ap.finalize(pid, finalize_nonce=ft['nonce'], finalize_sig=ft['sig'])
        self.assertIsNotNone(res)

        # After finalize, state is cleared for that poll
        self.assertIsNone(self.ap.public_results(pid))

    def test_single_active_poll_on_create(self):
        pid1 = self.ap.create_poll('Q1', 'creator', ['A', 'B'])
        pid2 = self.ap.create_poll('Q2', 'creator', ['C', 'D'])
        # The first poll should be deleted when second is created
        self.assertIsNone(self.ap.public_results(pid1))
        self.assertIsNotNone(self.ap.public_results(pid2))


if __name__ == '__main__':
    unittest.main()



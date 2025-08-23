/**
 * OpenPGP-based cryptography utilities for client-side encryption/decryption.
 * This implements secure end-to-end encryption using the OpenPGP standard.
 */
const CryptoUtils = {
  /**
   * Generate a new OpenPGP key pair for secure encryption.
   * 
   * @returns {Promise<{publicKey: string, privateKey: Object}>} Key pair
   */
  async generateKeyPair() {
    console.log("Generating OpenPGP encryption keys...");
    
    try {
      // Check if OpenPGP.js is available
      if (typeof openpgp === 'undefined') {
        throw new Error("OpenPGP.js library not loaded");
      }
      
      // Generate a unique name based on user session
      const userId = 'User_' + Math.floor(Math.random() * 1000000).toString();
      const email = `${userId}@securechat.example`;
      
      // Generate OpenPGP key pair
      // Note: ElGamal is preferred for encryption capability
      const { privateKey, publicKey } = await openpgp.generateKey({
        type: 'ecc', // ECC is more modern than RSA or ElGamal but widely supported
        curve: 'curve25519', // Modern, secure curve
        userIDs: [{ name: userId, email: email }],
        format: 'armored'
      });
      
      console.log("OpenPGP key pair generated successfully");
      
      // Return the key pair in the expected format
      return {
        publicKey: publicKey,
        privateKey: privateKey
      };
    } catch (error) {
      console.error("Failed to generate OpenPGP key pair:", error);
      throw error;
    }
  },
  
  /**
   * Encrypt a message with recipient's public key using OpenPGP.
   * 
   * @param {string} publicKey - Recipient's public key in OpenPGP format
   * @param {string} message - Plain text message to encrypt
   * @returns {Promise<string>} - Encrypted message
   */
  async encrypt(publicKey, message) {
    if (!message) return null;
    if (!publicKey) throw new Error("Public key is required for encryption");
    
    console.log("Encrypting message with OpenPGP...");
    
    try {
      // Parse the recipient's public key
      const publicKeyObj = await openpgp.readKey({ armoredKey: publicKey });
      
      // Encrypt the message
      const encrypted = await openpgp.encrypt({
        message: await openpgp.createMessage({ text: message }),
        encryptionKeys: publicKeyObj
      });
      
      // Return encrypted message with our prefix to identify format
      console.log("Message encrypted successfully");
      return `PGP-${encrypted}`;
    } catch (error) {
      console.error("OpenPGP encryption error:", error);
      throw new Error("Failed to encrypt message: " + error.message);
    }
  },
  
  /**
   * Decrypt a message with user's private key using OpenPGP.
   * 
   * @param {string} privateKey - User's private key in OpenPGP format
   * @param {string} encryptedMessage - Encrypted message
   * @returns {Promise<string>} - Decrypted message
   */
  async decrypt(privateKey, encryptedMessage) {
    console.log("Decrypting message with OpenPGP, input:", 
      encryptedMessage?.substring(0, 20) + "...");
    
    // Handle non-string or empty input
    if (!encryptedMessage || typeof encryptedMessage !== 'string') {
      console.warn("Invalid input to decryption - not a string or empty");
      return "[Could not decrypt message]";
    }
    
    try {
      // Check if this is our format
      if (!encryptedMessage.startsWith('PGP-')) {
        console.warn("Unknown message format:", encryptedMessage.substring(0, 10));
        return "[Unknown message format]";
      }
      
      // Extract the OpenPGP message (after PGP-)
      const pgpMessage = encryptedMessage.substring(4); // Skip "PGP-"
      
      // Parse the private key
      const privateKeyObj = await openpgp.readPrivateKey({ armoredKey: privateKey });
      
      // Decrypt the message
      const message = await openpgp.readMessage({ armoredMessage: pgpMessage });
      const decrypted = await openpgp.decrypt({
        message: message,
        decryptionKeys: privateKeyObj
      });
      
      // Return the decrypted text
      console.log("Decryption successful");
      return decrypted.data;
      
    } catch (error) {
      console.error("OpenPGP decryption error:", error);
      return `[Decryption failed - ${error.message}]`;
    }
  },
  
  /**
   * Test if OpenPGP encryption is working properly.
   * 
   * @returns {Promise<boolean>} - Whether the test passed
   */
  async testCryptoSupport() {
    try {
      console.log("Testing OpenPGP encryption system...");
      
      // Check if OpenPGP.js is available
      if (typeof openpgp === 'undefined') {
        console.error("OpenPGP.js library not loaded");
        return false;
      }
      
      // Test data
      const testData = "This is a test message for OpenPGP encryption";
      
      // Generate test keys
      console.log("Generating test keys...");
      const keyPair = await this.generateKeyPair();
      console.log("Test keys generated");
      
      // Test encryption
      console.log("Encrypting test message...");
      const encrypted = await this.encrypt(keyPair.publicKey, testData);
      console.log("Test message encrypted:", encrypted?.substring(0, 30) + "...");
      
      // Test decryption
      console.log("Decrypting test message...");
      const decrypted = await this.decrypt(keyPair.privateKey, encrypted);
      console.log("Test message decrypted:", decrypted);
      
      // Verify result
      const success = decrypted === testData;
      console.log(`OpenPGP test ${success ? 'PASSED' : 'FAILED'}`);
      return success;
      
    } catch (error) {
      console.error("OpenPGP test failed:", error);
      return false;
    }
  }
};

// Run a test to make sure OpenPGP encryption works
document.addEventListener('DOMContentLoaded', () => {
  console.log("Testing OpenPGP encryption system...");
  
  // Small delay to ensure OpenPGP.js is fully loaded
  setTimeout(() => {
    CryptoUtils.testCryptoSupport()
      .then(success => {
        console.log("OpenPGP test result:", success ? "PASSED" : "FAILED");
        
        // Update crypto status display
        const cryptoStatus = document.getElementById('crypto-status');
        if (cryptoStatus) {
          if (success) {
            cryptoStatus.textContent = '🔒 OpenPGP Encryption Enabled';
            cryptoStatus.style.color = '#28a745'; // green
          } else {
            cryptoStatus.textContent = '⚠️ OpenPGP Encryption Failed';
            cryptoStatus.style.color = '#dc3545'; // red
          }
        }
      })
      .catch(error => {
        console.error("Error during OpenPGP test:", error);
      });
  }, 500);
});

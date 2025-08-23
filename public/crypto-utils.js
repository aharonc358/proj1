/**
 * Simple cryptography utilities for client-side encryption/decryption.
 * This implements a very basic encryption system for demonstration.
 */
const CryptoUtils = {
  /**
   * Generate a simple key pair (NOT secure!)
   */
  async generateKeyPair() {
    console.log("Using simple key generation");
    // Simple key generation - just a random string for demonstration
    const randomKey = Math.random().toString(36).substring(2, 15);
    
    return {
      publicKey: `SIMPLE-${randomKey}`,
      privateKey: randomKey
    };
  },
  
  /**
   * Simple "encryption" using Base64 encoding
   * This is NOT real encryption - just for demonstration
   */
  async encrypt(publicKey, message) {
    if (!message) return null;
    
    console.log("Using simple encryption");
    
    // Simple encoding - NOT secure!
    try {
      const encoded = btoa(message);
      return `ENC-${encoded}`;
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt message");
    }
  },
  
  /**
   * Simple "decryption" using Base64 decoding
   * This is NOT real decryption - just for demonstration
   */
  async decrypt(privateKey, encryptedMessage) {
    console.log("Using simple decryption, input:", encryptedMessage?.substring(0, 20) + "...");
    
    // Handle non-string or empty input
    if (!encryptedMessage || typeof encryptedMessage !== 'string') {
      console.warn("Invalid input to decryption - not a string or empty");
      return "[Could not decrypt message]";
    }
    
    try {
      // Check if this is our format
      if (!encryptedMessage.startsWith('ENC-')) {
        console.warn("Unknown message format:", encryptedMessage.substring(0, 10));
        return "[Unknown message format]";
      }
      
      // Extract the Base64 part (after ENC-)
      const base64 = encryptedMessage.substring(4); // Skip "ENC-"
      
      // Simple decoding
      const decoded = atob(base64);
      console.log("Decryption successful:", decoded);
      return decoded;
    } catch (error) {
      console.error("Decryption error:", error);
      return "[Could not decrypt message]";
    }
  },
  
  /**
   * Test if encryption is working
   */
  async testCryptoSupport() {
    try {
      const testData = "test data for encryption";
      console.log("Testing simple crypto");
      
      // Generate test keys
      const keyPair = await this.generateKeyPair();
      console.log("Generated keys:", keyPair);
      
      // Test encryption
      const encrypted = await this.encrypt(keyPair.publicKey, testData);
      console.log("Encryption result:", encrypted);
      
      // Test decryption
      const decrypted = await this.decrypt(keyPair.privateKey, encrypted);
      console.log("Decryption result:", decrypted);
      
      // Verify result
      const success = decrypted === testData;
      console.log(`Simple crypto test ${success ? 'PASSED' : 'FAILED'}`);
      return success;
    } catch (error) {
      console.error("Crypto test failed:", error);
      return false;
    }
  }
};

// Run a test to make sure encryption works
document.addEventListener('DOMContentLoaded', () => {
  console.log("Testing encryption system...");
  CryptoUtils.testCryptoSupport()
    .then(success => {
      console.log("Encryption test result:", success ? "PASSED" : "FAILED");
    })
    .catch(error => {
      console.error("Error during encryption test:", error);
    });
});

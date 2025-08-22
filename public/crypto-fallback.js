/**
 * Fallback cryptography utilities for browsers with limited Web Crypto API support.
 * 
 * This provides a simplified encryption mechanism when full Web Crypto isn't available.
 * WARNING: This is NOT secure and should ONLY be used for debugging/testing.
 */
const CryptoFallback = {
  /**
   * Generate a simple key pair (NOT secure!)
   */
  generateKeyPair() {
    console.log("Using fallback key generation");
    // Simple key generation - just a random string for demonstration
    const randomKey = Math.random().toString(36).substring(2, 15);
    
    return {
      publicKey: `DEMO-${randomKey}`,
      privateKey: randomKey
    };
  },
  
  /**
   * Simple "encryption" using Base64 encoding with a prefix based on the key
   * This is NOT real encryption - just for demonstration
   */
  encrypt(publicKey, message) {
    if (!message) return null;
    
    console.log("Using fallback encryption");
    // Extract the key suffix (after DEMO-)
    const key = publicKey.startsWith('DEMO-') ? publicKey.substring(5) : publicKey;
    
    // Simple encoding - NOT secure!
    return `ENC-${key.substring(0, 3)}-${btoa(message)}`;
  },
  
  /**
   * Simple "decryption" using Base64 decoding
   * This is NOT real decryption - just for demonstration
   */
  decrypt(privateKey, encryptedMessage) {
    if (!encryptedMessage || !encryptedMessage.startsWith('ENC-')) {
      return null;
    }
    
    console.log("Using fallback decryption");
    // Extract the Base64 part (after ENC-XXX-)
    const base64 = encryptedMessage.substring(encryptedMessage.indexOf('-', 4) + 1);
    
    // Simple decoding
    try {
      return atob(base64);
    } catch (error) {
      console.error("Fallback decryption error:", error);
      return null;
    }
  },
  
  /**
   * Test if the fallback crypto is working
   */
  testCryptoSupport() {
    try {
      const testData = "test data for fallback encryption";
      console.log("Testing fallback crypto");
      
      // Generate test keys
      const keyPair = this.generateKeyPair();
      console.log("Generated fallback keys:", keyPair);
      
      // Test encryption
      const encrypted = this.encrypt(keyPair.publicKey, testData);
      console.log("Fallback encryption result:", encrypted);
      
      // Test decryption
      const decrypted = this.decrypt(keyPair.privateKey, encrypted);
      console.log("Fallback decryption result:", decrypted);
      
      // Verify result
      return decrypted === testData;
    } catch (error) {
      console.error("Fallback crypto test failed:", error);
      return false;
    }
  }
};

/**
 * Enable fallback mode by patching the CryptoUtils object
 */
function enableCryptoFallback() {
  console.warn("⚠️ ENABLING CRYPTO FALLBACK MODE - NOT SECURE!");
  
  // Store original methods
  const originalMethods = {
    generateKeyPair: CryptoUtils.generateKeyPair,
    encrypt: CryptoUtils.encrypt,
    decrypt: CryptoUtils.decrypt,
    testCryptoSupport: CryptoUtils.testCryptoSupport
  };
  
  // Replace with fallback methods
  CryptoUtils.generateKeyPair = async function() {
    console.warn("Using fallback key generation instead of Web Crypto API");
    return CryptoFallback.generateKeyPair();
  };
  
  CryptoUtils.encrypt = async function(publicKey, message) {
    console.warn("Using fallback encryption instead of Web Crypto API");
    return CryptoFallback.encrypt(publicKey, message);
  };
  
  CryptoUtils.decrypt = async function(privateKey, encryptedMessage) {
    console.warn("Using fallback decryption instead of Web Crypto API");
    return CryptoFallback.decrypt(privateKey, encryptedMessage);
  };
  
  CryptoUtils.testCryptoSupport = async function() {
    console.warn("Using fallback crypto test instead of Web Crypto API");
    return CryptoFallback.testCryptoSupport();
  };
  
  // Add way to restore original methods
  CryptoUtils.disableFallback = function() {
    Object.assign(CryptoUtils, originalMethods);
    console.log("Restored original Web Crypto API methods");
  };
  
  return true;
}

// For easy debugging in console
window.enableCryptoFallback = enableCryptoFallback;
window.CryptoFallback = CryptoFallback;

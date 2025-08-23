/**
 * This file is now deprecated - functionality moved to crypto-utils.js
 * Keeping this file for backward compatibility
 */
console.log("Encryption is now implemented directly in crypto-utils.js");

// Define a no-op fallback for backward compatibility
const CryptoFallback = {
  // No-op methods
  generateKeyPair() {
    console.warn("Using crypto-utils.js implementation instead");
    return CryptoUtils.generateKeyPair();
  },
  
  encrypt(publicKey, message) {
    console.warn("Using crypto-utils.js implementation instead");
    return CryptoUtils.encrypt(publicKey, message);
  },
  
  decrypt(privateKey, encryptedMessage) {
    console.warn("Using crypto-utils.js implementation instead");
    return CryptoUtils.decrypt(privateKey, encryptedMessage);
  },
  
  testCryptoSupport() {
    console.warn("Using crypto-utils.js implementation instead");
    return CryptoUtils.testCryptoSupport();
  }
};

// Expose for backward compatibility
window.CryptoFallback = CryptoFallback;

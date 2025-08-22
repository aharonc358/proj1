/**
 * Cryptography utilities for client-side encryption/decryption.
 * This file implements the browser-side of the E2E encryption.
 */
const CryptoUtils = {
  /**
   * Generate a new RSA key pair for E2E encryption.
   * 
   * @returns {Promise<{publicKey: string, privateKey: CryptoKey}>}
   */
  async generateKeyPair() {
    try {
      console.log("Generating RSA key pair...");
      
      // Verify Web Crypto API is available
      if (!window.crypto || !window.crypto.subtle) {
        throw new Error("Web Crypto API not available in this browser");
      }
      
      // Generate RSA key pair using Web Crypto API
      console.log("Calling crypto.subtle.generateKey...");
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),  // 65537
          hash: "SHA-256",
        },
        true,  // extractable
        ["encrypt", "decrypt"]  // usages
      );
      
      // Export public key to a format we can transmit
      const publicKeyExported = await window.crypto.subtle.exportKey(
        "spki", keyPair.publicKey
      );
      
      // Convert to base64 and PEM format
      const pemHeader = "-----BEGIN PUBLIC KEY-----\n";
      const pemFooter = "\n-----END PUBLIC KEY-----";
      const base64Key = btoa(String.fromCharCode(...new Uint8Array(publicKeyExported)));
      const formattedBase64 = base64Key.match(/.{1,64}/g).join('\n');
      const publicKeyPem = pemHeader + formattedBase64 + pemFooter;
      
      console.log("Key pair successfully generated");
      
      return {
        publicKey: publicKeyPem,
        privateKey: keyPair.privateKey  // Keep as CryptoKey object
      };
    } catch (error) {
      console.error("Failed to generate key pair:", error);
      throw error;
    }
  },
  
  /**
   * Import a public key from PEM format for encryption.
   * 
   * @param {string} pemKey - PEM formatted public key
   * @returns {Promise<CryptoKey>}
   */
  async importPublicKey(pemKey) {
    try {
      // Remove header/footer and newlines
      const pemContents = pemKey
        .replace("-----BEGIN PUBLIC KEY-----", "")
        .replace("-----END PUBLIC KEY-----", "")
        .replace(/\n/g, "");
      
      // Base64 decode
      const binaryString = atob(pemContents);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Import as crypto key
      return window.crypto.subtle.importKey(
        "spki",
        bytes.buffer,
        {
          name: "RSA-OAEP",
          hash: "SHA-256",
        },
        true,
        ["encrypt"]
      );
    } catch (error) {
      console.error("Failed to import public key:", error);
      throw error;
    }
  },
  
  /**
   * Encrypt a message for a recipient.
   * 
   * @param {string} publicKeyPem - Recipient's public key in PEM format
   * @param {string} message - Message to encrypt
   * @returns {Promise<string>} - Base64 encoded encrypted message
   */
  async encrypt(publicKeyPem, message) {
    try {
      // Import public key
      const publicKey = await this.importPublicKey(publicKeyPem);
      
      // Convert message to bytes
      const messageBytes = new TextEncoder().encode(message);
      
      // Encrypt
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
          name: "RSA-OAEP"
        },
        publicKey,
        messageBytes
      );
      
      // Convert to Base64
      return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
    } catch (error) {
      console.error("Encryption error:", error);
      throw error;
    }
  },
  
  /**
   * Decrypt a message with private key.
   * 
   * @param {CryptoKey} privateKey - User's private key object
   * @param {string} encryptedBase64 - Base64 encoded encrypted message
   * @returns {Promise<string>} - Decrypted message
   */
  async decrypt(privateKey, encryptedBase64) {
    try {
      // Convert from Base64 to ArrayBuffer
      const binaryString = atob(encryptedBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Decrypt
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: "RSA-OAEP"
        },
        privateKey,
        bytes.buffer
      );
      
      // Convert to string
      return new TextDecoder().decode(decryptedBuffer);
    } catch (error) {
      console.error("Decryption error:", error);
      throw error;
    }
  },
  
  /**
   * Test if the Web Crypto API is available and working.
   * 
   * @returns {Promise<boolean>}
   */
  async testCryptoSupport() {
    try {
      console.log("Crypto test step 1: Checking Web Crypto API availability");
      if (!window.crypto || !window.crypto.subtle) {
        console.error("Web Crypto API not available in this browser");
        return false;
      }
      console.log("Web Crypto API is available");
      
      const testData = "test data for encryption";
      console.log("Crypto test step 2: Generating key pair...");
      
      // Generate a test key
      const keyPair = await this.generateKeyPair();
      if (!keyPair || !keyPair.publicKey || !keyPair.privateKey) {
        console.error("Key pair generation failed:", keyPair);
        return false;
      }
      console.log("Key pair generated:", keyPair.publicKey.substring(0, 50) + "...");
      
      // Try encrypting
      console.log("Crypto test step 3: Encrypting test data...");
      const encrypted = await this.encrypt(keyPair.publicKey, testData);
      if (!encrypted) {
        console.error("Encryption failed - no data returned");
        return false;
      }
      console.log("Data encrypted successfully:", encrypted.substring(0, 20) + "...");
      
      // Try decrypting
      console.log("Crypto test step 4: Decrypting test data...");
      const decrypted = await this.decrypt(keyPair.privateKey, encrypted);
      if (!decrypted) {
        console.error("Decryption failed - no data returned");
        return false;
      }
      console.log("Data decrypted successfully:", decrypted);
      
      // Verify we got back the original data
      console.log("Crypto test step 5: Verifying decrypted data...");
      const success = decrypted === testData;
      
      if (!success) {
        console.error("Verification failed - expected:", testData, "got:", decrypted);
      }
      
      console.log(`Crypto test ${success ? 'PASSED' : 'FAILED'}`);
      return success;
    } catch (error) {
      console.error("Crypto support test failed with exception:", error);
      // Log additional browser information
      console.log("Browser info:", {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language
      });
      return false;
    }
  }
};

// Check for crypto support when loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("Starting crypto support test...");
  CryptoUtils.testCryptoSupport()
    .then(supported => {
      console.log("Crypto test result:", supported ? "PASSED" : "FAILED");
      if (!supported) {
        console.error("Warning: E2E encryption may not work in this browser");
        
        // Show a detailed warning to the user
        const warning = document.createElement('div');
        warning.className = 'crypto-warning';
        warning.textContent = '⚠️ Warning: Your browser may not support secure messaging. See console for details.';
        warning.style.backgroundColor = '#fff3cd';
        warning.style.color = '#856404';
        warning.style.padding = '8px';
        warning.style.margin = '5px 0';
        warning.style.borderRadius = '4px';
        warning.style.textAlign = 'center';
        warning.style.cursor = 'pointer';
        warning.title = 'Click for more details';
        warning.onclick = () => {
          console.log("Debug info - User Agent:", navigator.userAgent);
          console.log("Debug info - Web Crypto API available:", typeof window.crypto !== 'undefined' && typeof window.crypto.subtle !== 'undefined');
          console.log("Debug info - window.crypto:", window.crypto);
          console.log("Debug info - window.crypto.subtle:", window.crypto?.subtle);
          alert('Crypto test failed. Check browser console for detailed error information.');
        };
        
        const app = document.querySelector('.app');
        if (app) {
          app.prepend(warning);
        }
      }
    })
    .catch(error => {
      console.error("Critical error during crypto test:", error);
      // Show an error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'crypto-error';
      errorMsg.textContent = '❌ Error: Crypto test threw an exception. See console for details.';
      errorMsg.style.backgroundColor = '#f8d7da';
      errorMsg.style.color = '#721c24';
      errorMsg.style.padding = '8px';
      errorMsg.style.margin = '5px 0';
      errorMsg.style.borderRadius = '4px';
      errorMsg.style.textAlign = 'center';
      
      const app = document.querySelector('.app');
      if (app) {
        app.prepend(errorMsg);
      }
    });
});

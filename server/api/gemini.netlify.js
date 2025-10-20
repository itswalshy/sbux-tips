/**
 * Gemini API integration for Netlify functions with rate limiting
 */

// Import libraries needed for Gemini API
import fetch from 'node-fetch';

// Rate limiting configuration
const RATE_LIMIT = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2
};

// Simple in-memory rate limiter for serverless functions
class RateLimiter {
  constructor(maxRequests = 15, windowMs = 60000) { // 15 requests per minute
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  canMakeRequest() {
    const now = Date.now();
    // Remove requests older than the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }

  getTimeUntilNextRequest() {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }
    
    const oldestRequest = Math.min(...this.requests);
    return Math.max(0, this.windowMs - (Date.now() - oldestRequest));
  }
}

const rateLimiter = new RateLimiter();

const GEMINI_API_ENDPOINTS = [
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent",
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent",
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
];

// Sleep utility function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Analyzes an image using Google's Gemini API with rate limiting and retry logic
 * @param {string} imageBase64 - Base64 encoded image data
 * @returns {Promise<{text: string|null, error: string|null}>} - Extracted text or error
 */
export async function analyzeImage(imageBase64) {
  // Check rate limit before making request
  if (!rateLimiter.canMakeRequest()) {
    const waitTime = rateLimiter.getTimeUntilNextRequest();
    return {
      text: null,
      error: `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds before uploading another image.`
    };
  }

  for (let attempt = 0; attempt <= RATE_LIMIT.maxRetries; attempt++) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error("No Gemini API key provided");
        return { text: null, error: "API key missing. Please configure the Gemini API key in environment variables." };
      }
      
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `
                  Extract ALL TEXT from this image first. Then identify and extract ALL partner names and their tippable hours from the text.

                  Look for patterns indicating partner names followed by hours, such as:
                  - "Name: X hours" or "Name: Xh"
                  - "Name - X hours"
                  - "Name (X hours)"
                  - Any text that includes names with numeric values that could represent hours

                  Return EACH partner's full name followed by their hours, with one partner per line.
                  Format the output exactly like this:
                  John Smith: 32
                  Maria Garcia: 24.5
                  Alex Johnson: 18.75

                  Make sure to include ALL partners mentioned in the image, not just the first one.
                  If hours are not explicitly labeled, look for numeric values near names that could represent hours.
                `
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        }
      };

      let lastModelError = null;
      let lastGeneralError = null;
      let retriedForRateLimit = false;

      for (const endpoint of GEMINI_API_ENDPOINTS) {
        const response = await fetch(`${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const responseText = await response.text();
        let responseData = null;
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          // ignore JSON parse issues and fall back to status codes
        }

        if (response.ok) {
          const extractedText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!extractedText) {
            return { text: null, error: 'No text extracted from image' };
          }
          return { text: extractedText, error: null };
        }

        let errorMessage = responseData?.error?.message || response.statusText || 'Error processing image with Gemini API';
        errorMessage = errorMessage.replace(/api_key:[a-zA-Z0-9-_]+/, 'api_key:[REDACTED]');

        const notFound = response.status === 404 ||
          responseData?.error?.status === 'NOT_FOUND' ||
          /not found/i.test(errorMessage) ||
          /not supported/i.test(errorMessage);

        if (notFound) {
          lastModelError = errorMessage;
          continue;
        }

        const shouldRetry = response.status === 429 ||
          errorMessage.toLowerCase().includes('quota') ||
          errorMessage.toLowerCase().includes('rate limit') ||
          errorMessage.toLowerCase().includes('requests per minute');

        if (shouldRetry && attempt < RATE_LIMIT.maxRetries) {
          const delay = Math.min(
            RATE_LIMIT.baseDelay * Math.pow(RATE_LIMIT.backoffMultiplier, attempt),
            RATE_LIMIT.maxDelay
          );
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT.maxRetries + 1})`);
          await sleep(delay);
          retriedForRateLimit = true;
          break;
        }

        console.error('Gemini API error:', responseData || response.statusText || response.status);
        lastGeneralError = errorMessage;
        break;
      }

      if (retriedForRateLimit) {
        continue;
      }

      if (lastGeneralError) {
        return {
          text: null,
          error: lastGeneralError
        };
      }

      if (lastModelError) {
        return {
          text: null,
          error: `Gemini could not find an available "gemini-1.5-flash" model for this API key. (${lastModelError})`
        };
      }

      return {
        text: null,
        error: 'Failed to process image with Gemini API'
      };
      
    } catch (error) {
      // If this is the last attempt, return the error
      if (attempt === RATE_LIMIT.maxRetries) {
        console.error("Gemini API error (final attempt):", error);
        return { 
          text: null, 
          error: error.message || "Failed to process image with Gemini API"
        };
      }
      
      // For network errors, wait and retry
      const delay = Math.min(
        RATE_LIMIT.baseDelay * Math.pow(RATE_LIMIT.backoffMultiplier, attempt),
        RATE_LIMIT.maxDelay
      );
      console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT.maxRetries + 1}):`, error);
      await sleep(delay);
    }
  }
  
  // This should never be reached, but just in case
  return { 
    text: null,
    error: "Maximum retry attempts exceeded."
  };
}
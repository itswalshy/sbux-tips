// Gemini API implementation
import fetch from 'node-fetch';
import { GEMINI_RATE_LIMIT_CONFIG, isRateLimitError } from '../config/rate-limit';

// Simple in-memory rate limiter
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = GEMINI_RATE_LIMIT_CONFIG.maxRequests, windowMs: number = GEMINI_RATE_LIMIT_CONFIG.windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove requests older than the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }

  getTimeUntilNextRequest(): number {
    if (this.requests.length < this.maxRequests) {
      return 0;
    }
    
    const oldestRequest = Math.min(...this.requests);
    return Math.max(0, this.windowMs - (Date.now() - oldestRequest));
  }
}

const rateLimiter = new RateLimiter();

// Sleep utility function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text?: string;
      }[];
    };
  }[];
}

interface GeminiError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  }
}

/**
 * Analyze an image using Google Gemini API to extract text with rate limiting and retry logic
 * @param imageBase64 The base64-encoded image data
 * @returns An object with extracted text or error details
 */
export async function analyzeImage(imageBase64: string): Promise<{text: string | null; error?: string}> {
  // Check rate limit before making request
  if (!rateLimiter.canMakeRequest()) {
    const waitTime = rateLimiter.getTimeUntilNextRequest();
    return {
      text: null,
      error: GEMINI_RATE_LIMIT_CONFIG.messages.rateLimitExceeded(waitTime)
    };
  }

  for (let attempt = 0; attempt <= GEMINI_RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    try {
      const apiKey = process.env.GEMINI_API_KEY || "";
      
      if (!apiKey) {
        console.error("No Gemini API key provided");
        return { 
          text: null,
          error: "API key missing. Please configure the Gemini API key." 
        };
      }
      
      const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
    
    const promptText = `
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
    `;
    
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: promptText
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
    
      const response = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to call Gemini API";
        let shouldRetry = false;
        
        try {
          const errorData = JSON.parse(errorText) as GeminiError;
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
            // Hide the API key if it's in the error message
            errorMessage = errorMessage.replace(/api_key:[a-zA-Z0-9-_]+/, "api_key:[REDACTED]");
            
            // Check if this is a rate limit error that we should retry
            shouldRetry = isRateLimitError(errorData.error);
          }
        } catch (e) {
          // If error parsing fails, check status code for rate limiting
          shouldRetry = isRateLimitError({ code: response.status });
        }
        
        // If this is a rate limit error and we have retries left, wait and retry
        if (shouldRetry && attempt < GEMINI_RATE_LIMIT_CONFIG.maxRetries) {
          const delay = Math.min(
            GEMINI_RATE_LIMIT_CONFIG.baseDelay * Math.pow(GEMINI_RATE_LIMIT_CONFIG.backoffMultiplier, attempt),
            GEMINI_RATE_LIMIT_CONFIG.maxDelay
          );
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${GEMINI_RATE_LIMIT_CONFIG.maxRetries + 1})`);
          await sleep(delay);
          continue; // Retry the request
        }
        
        console.error("Gemini API error:", response.status, errorText);
        
        // Provide user-friendly error messages for quota issues
        if (isRateLimitError({ code: response.status, message: errorMessage })) {
          return { 
            text: null, 
            error: GEMINI_RATE_LIMIT_CONFIG.messages.quotaExceeded
          };
        }
        
        return { 
          text: null, 
          error: `API Error (${response.status}): ${errorMessage}`
        };
      }
    
      const data = await response.json() as GeminiResponse;
      
      if (!data.candidates || data.candidates.length === 0) {
        console.error("No candidates in Gemini response");
        return { 
          text: null,
          error: "No text extracted from the image. Try a clearer image or manual entry."
        };
      }
      
      const extractedText = data.candidates[0].content.parts
        .map(part => part.text)
        .filter(Boolean)
        .join("\n");
      
      if (!extractedText) {
        return { 
          text: null,
          error: "No text extracted from the image. Try a clearer image or manual entry."
        };
      }
      
      return { text: extractedText };
      
    } catch (error) {
      // If this is the last attempt, return the error
      if (attempt === GEMINI_RATE_LIMIT_CONFIG.maxRetries) {
        console.error("Error calling Gemini API (final attempt):", error);
        return { 
          text: null,
          error: "An unexpected error occurred while processing the image."
        };
      }
      
      // For network errors, wait and retry
      const delay = Math.min(
        GEMINI_RATE_LIMIT_CONFIG.baseDelay * Math.pow(GEMINI_RATE_LIMIT_CONFIG.backoffMultiplier, attempt),
        GEMINI_RATE_LIMIT_CONFIG.maxDelay
      );
      console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${GEMINI_RATE_LIMIT_CONFIG.maxRetries + 1}):`, error);
      await sleep(delay);
    }
  }
  
  // This should never be reached, but just in case
  return { 
    text: null,
    error: GEMINI_RATE_LIMIT_CONFIG.messages.maxRetriesExceeded
  };
}
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

// Sleep utility function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function buildJsonPrompt() {
  return `You are an OCR and schedule parsing assistant. Carefully transcribe every legible character in the provided image.

Return **only** a JSON object that matches this schema exactly:
{
  "extracted_text": "<full transcription with line breaks>",
  "partners": [
    {
      "name": "Full Name",
      "hours": 0
    }
  ]
}

Guidelines:
- Preserve the order of the names as they appear from top to bottom or left to right.
- Use decimal hours where necessary (e.g. 23.5 for 23 hours 30 minutes).
- Include every partner or employee that has associated hours. If none exist, return an empty array.
- Do not include commentary, code fences, or additional fields.
- Ensure the JSON is valid and parsable.`;
}

function extractPartnerHoursFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const colonIndex = trimmed.lastIndexOf(':');
  if (colonIndex > 0) {
    const name = trimmed.substring(0, colonIndex).trim();
    const hoursText = trimmed.substring(colonIndex + 1).trim();
    const hours = parseFloat(hoursText);
    if (name && !Number.isNaN(hours)) {
      return { name, hours };
    }
  }

  const patterns = [
    /^(.+?)\s+-\s+(\d+(?:\.\d+)?)$/,
    /^(.+?)\s+\((\d+(?:\.\d+)?)\)$/,
    /^(.+?)\s+(\d+(?:\.\d+)?)$/
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const name = match[1].trim();
      const hours = parseFloat(match[2]);
      if (name && !Number.isNaN(hours)) {
        return { name, hours };
      }
    }
  }

  return null;
}

function extractMultiplePartnersFromText(text) {
  const result = [];
  const cleanedText = text.replace(/[•·]\s*/g, '\n').replace(/\s{2,}/g, ' ').trim();
  const patterns = [
    /([A-Za-z][A-Za-z\s\.\-']+?)[\s\-:]+(\d+(?:\.\d+)?)\s*(?:hours|hrs?|h)/gi,
    /([A-Za-z][A-Za-z\s\.\-']+?)\s*\((\d+(?:\.\d+)?)\s*(?:hours|hrs?|h)\)/gi,
    /([A-Za-z][A-Za-z\s\.\-']+?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:hours|hrs?|h)/gi,
    /([A-Za-z][A-Za-z\s\.\-']+?)\s+(\d+(?:\.\d+)?)\s*h(?:\b|ours|rs)/gi,
    /([A-Za-z][A-Za-z\s\.\-']+?)[\s\-:]+(\d+(?:\.\d+)?)/gi,
    /([A-Za-z][A-Za-z\s\.\-']+?)\s+(\d+(?:\.\d+)?)/gi
  ];

  for (const pattern of patterns) {
    const temp = [];
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(cleanedText)) !== null) {
      const name = match[1].trim();
      const hours = parseFloat(match[2]);
      if (name && !Number.isNaN(hours)) {
        temp.push({ name, hours });
      }
    }

    if (temp.length > 0) {
      return temp;
    }
  }

  return result;
}

function fallbackExtractPartners(text) {
  if (!text) {
    return [];
  }

  const normalized = text.replace(/\r\n?/g, '\n');

  if (normalized.includes('\n')) {
    const partners = [];
    for (const line of normalized.split('\n')) {
      const parsed = extractPartnerHoursFromLine(line);
      if (parsed) {
        partners.push(parsed);
      }
    }
    if (partners.length > 0) {
      return partners;
    }
  }

  const items = extractMultiplePartnersFromText(normalized);
  if (items.length > 0) {
    const map = new Map();
    for (const item of items) {
      const key = item.name.replace(/\s+/g, ' ').trim();
      if (!key) {
        continue;
      }
      map.set(key, item.hours);
    }
    return Array.from(map.entries()).map(([name, hours]) => ({ name, hours }));
  }

  return [];
}

function parseModelResponse(rawText) {
  if (!rawText) {
    return { extractedText: '', partners: [] };
  }

  try {
    const parsed = JSON.parse(rawText);
    const extractedText = typeof parsed.extracted_text === 'string' ? parsed.extracted_text.trim() : '';
    const partners = Array.isArray(parsed.partners)
      ? parsed.partners.map(entry => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const name = typeof entry.name === 'string' ? entry.name.trim() : '';
          const hoursValue = typeof entry.hours === 'number'
            ? entry.hours
            : typeof entry.hours === 'string'
              ? parseFloat(entry.hours)
              : NaN;

          if (!name || Number.isNaN(hoursValue)) {
            return null;
          }

          return { name, hours: hoursValue };
        }).filter(Boolean)
      : [];

    return { extractedText, partners };
  } catch (error) {
    const cleaned = rawText.trim();
    return {
      extractedText: cleaned,
      partners: cleaned ? fallbackExtractPartners(cleaned) : []
    };
  }
}

/**
 * Analyzes an image using Google's Gemini API with rate limiting and retry logic
 * @param {string} imageBase64 - Base64 encoded image data
 * @returns {Promise<{text: string|null, partners: Array<{name: string, hours: number}>, error: string|null}>}
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
        return { text: null, partners: [], error: "API key missing. Please configure the Gemini API key in environment variables." };
      }
      
      // Google Gemini API endpoint - Updated to use the latest Flash alias
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

      // Construct the request body with the image and prompt
      const requestBody = {
        contents: [
          {
            parts: [
              { text: buildJsonPrompt() },
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
          responseMimeType: "application/json"
        }
      };
      
      // Make the API call
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      // Parse the response
      const responseData = await response.json();
      
      if (!response.ok) {
        let shouldRetry = false;
        let errorMessage = responseData.error?.message || "Error processing image with Gemini API";
        
        // Check if this is a rate limit error that we should retry
        if (response.status === 429 || 
            errorMessage.includes('quota') || 
            errorMessage.includes('rate limit') ||
            errorMessage.includes('requests per minute')) {
          shouldRetry = true;
        }
        
        // If this is a rate limit error and we have retries left, wait and retry
        if (shouldRetry && attempt < RATE_LIMIT.maxRetries) {
          const delay = Math.min(
            RATE_LIMIT.baseDelay * Math.pow(RATE_LIMIT.backoffMultiplier, attempt),
            RATE_LIMIT.maxDelay
          );
          console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${RATE_LIMIT.maxRetries + 1})`);
          await sleep(delay);
          continue; // Retry the request
        }
        
        console.error("Gemini API error:", responseData);
        return {
          text: null,
          partners: [],
          error: errorMessage
        };
      }

      const parts = responseData.candidates?.[0]?.content?.parts || [];
      const combined = parts.map(part => part?.text).filter(Boolean).join("\n");
      const parsed = parseModelResponse(combined);

      if (!parsed.extractedText && parsed.partners.length === 0) {
        return { text: null, partners: [], error: "No text extracted from image" };
      }

      const partners = parsed.partners.length > 0
        ? parsed.partners
        : fallbackExtractPartners(parsed.extractedText);

      return {
        text: parsed.extractedText || partners.map(partner => `${partner.name}: ${partner.hours}`).join("\n"),
        partners,
        error: null
      };

    } catch (error) {
      // If this is the last attempt, return the error
      if (attempt === RATE_LIMIT.maxRetries) {
        console.error("Gemini API error (final attempt):", error);
        return {
          text: null,
          partners: [],
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
    partners: [],
    error: "Maximum retry attempts exceeded."
  };
}
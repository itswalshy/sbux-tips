/**
 * DEPRECATED: This file has been replaced by ocr.ts
 * 
 * Reason for replacement:
 * - Starbucks requires privacy-compliant OCR without AI training
 * - Gemini AI trains on submitted data, violating privacy requirements
 * - Replaced with Tesseract OCR (traditional, non-learning OCR)
 * 
 * See: server/api/ocr.ts for the new implementation
 * Documentation: OCR_IMPLEMENTATION.md
 */

// This file is kept for reference only and is no longer used in the application.
// All OCR functionality now uses Tesseract via server/api/ocr.ts

export function analyzeImage(): never {
  throw new Error(
    'Gemini API has been deprecated. Please use the new Tesseract OCR implementation in server/api/ocr.ts'
  );
}

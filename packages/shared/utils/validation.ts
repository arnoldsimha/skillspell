/**
 * Shared validation utilities.
 */

/**
 * Basic email format validation.
 *
 * Rejects values that are clearly not emails (XSS payloads, empty strings, etc.)
 * without being overly strict about valid RFC 5322 edge cases.
 *
 * Rules:
 * - Max 254 characters (RFC 5321 limit)
 * - Exactly one `@` separating local and domain parts
 * - Domain has at least one dot
 * - No whitespace or angle brackets
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  return emailRegex.test(email);
}

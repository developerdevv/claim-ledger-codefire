/**
 * Shared client-side limits (Round 3, F6). One source of truth so the Check
 * input rules and the PDF-import truncated confirmation always quote the
 * same number.
 */

/** Hard cap on draft text sent to Check — matches the server contract. */
export const CHECK_CHAR_LIMIT = 12000

/** Past this many characters the composer shows a live character counter. */
export const CHAR_COUNTER_FROM = 10000

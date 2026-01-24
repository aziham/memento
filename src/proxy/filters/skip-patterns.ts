/**
 * Skip Patterns
 *
 * Patterns that indicate internal client requests that should NOT
 * trigger memory retrieval. Organized by client for maintainability.
 *
 * Add new patterns here as we discover issues with other clients.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Continue.dev
// ═══════════════════════════════════════════════════════════════════════════════

/** Continue.dev title generation request */
const CONTINUE_PATTERNS = ['reply with a title'];

// ═══════════════════════════════════════════════════════════════════════════════
// Future Clients
// ══════════════���════════════════════════════════════════════════════════════════

// const CURSOR_PATTERNS: string[] = [];
// const CODY_PATTERNS: string[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════════

export const SKIP_PATTERNS = [...CONTINUE_PATTERNS];

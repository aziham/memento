/**
 * Sanitizes headers by removing restricted headers that can interfere with upstream requests.
 *
 * Restricted headers:
 * - host: Can cause Bun/Node to connect to the wrong hostname
 * - connection: Managed by the runtime/protocol
 * - content-length: Recalculated based on the modified body
 * - content-encoding: Managed by the runtime/protocol
 * - cookie: Should not be forwarded to upstream providers for security
 */
export function sanitizeHeaders(headers: Headers): Headers {
  const sanitized = new Headers(headers);
  const restricted = [
    'host',
    'connection',
    'content-length',
    'content-encoding',
    'cookie',
    'proxy-authorization'
  ];

  for (const header of restricted) {
    sanitized.delete(header);
  }

  return sanitized;
}

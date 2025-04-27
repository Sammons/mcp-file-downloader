/**
 * Get the content type from the Content-Type header
 * @param contentType The Content-Type header value
 * @returns The normalized content type
 */
export function getContentType(contentType: string | null): string {
  if (!contentType) {
    return 'text/plain';
  }
  // Remove charset and other parameters
  return contentType.split(';')[0].toLowerCase().trim();
}

/**
 * Convert content type to MIME type
 * @param contentType The content type
 * @returns The MIME type
 */
export function contentTypeToMimeType(contentType: string): string {
  // For now, just return the content type as is
  // In a more complete implementation, we might want to normalize or map to specific MIME types
  return contentType;
}

/**
 * Check if the content type represents text content
 * @param contentType The content type
 * @returns True if the content type represents text content
 */
export function isTextContent(contentType: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType === 'application/json' ||
    contentType === 'application/xml' ||
    contentType === 'application/javascript' ||
    contentType === 'application/x-www-form-urlencoded'
  );
} 
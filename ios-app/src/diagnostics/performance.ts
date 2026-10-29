export function recordPerformance(
  operation: 'photo_selection' | 'photo_preparation_upload' | 'story_generation' | 'book_preview' | 'pdf_export',
  startedAt: number,
  details: Record<string, string | number | boolean> = {},
): void {
  console.info('[trailogue.performance]', {
    operation,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...details,
  });
}

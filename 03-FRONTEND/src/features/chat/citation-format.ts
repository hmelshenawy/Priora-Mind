import type { AssistantSourceDto } from '@priora/shared-types';

export interface CitationDisplay {
  id: string;
  title: string;
  location: string | null;
  detail: string | null;
}

export function formatCitation(source: AssistantSourceDto, index: number): CitationDisplay {
  const title = source.sourceTitle || source.sourceFile || `Source ${index + 1}`;
  const location = formatLocation(source);
  const detail = source.citationHeading || source.citationSection || source.sourceType || null;
  return { id: `${source.sourceId}-${source.chunkId}-${source.displayOrder}`, title, location, detail };
}

export function formatLocation(source: AssistantSourceDto): string | null {
  if (source.pageStart && source.pageEnd && source.pageStart !== source.pageEnd) {
    return `Pages ${source.pageStart}-${source.pageEnd}`;
  }
  const page = source.citationPage ?? source.pageStart ?? source.pageEnd;
  return page ? `Page ${page}` : null;
}

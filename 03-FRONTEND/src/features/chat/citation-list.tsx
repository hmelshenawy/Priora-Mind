'use client';

import type { AssistantSourceDto } from '@priora/shared-types';
import { formatCitation } from './citation-format';

export function CitationList({ sources, label }: { sources: AssistantSourceDto[]; label: string }) {
  if (sources.length === 0) return null;
  return (
    <section className="mt-4 border-t border-slate-200 pt-3" aria-label={label}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <ol className="mt-2 space-y-2">
        {sources
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((source, index) => {
            const citation = formatCitation(source, index);
            return (
              <li key={citation.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="block font-medium text-slate-950">{citation.title}</span>
                {citation.location ? <span className="block text-slate-600">{citation.location}</span> : null}
                {citation.detail ? <span className="block text-slate-500">{citation.detail}</span> : null}
              </li>
            );
          })}
      </ol>
    </section>
  );
}

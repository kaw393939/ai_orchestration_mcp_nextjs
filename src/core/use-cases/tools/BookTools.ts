import { ToolCommand } from "../ToolCommand";
import type { BookRepository } from "../BookRepository";
import { LibrarySearchInteractor } from "../LibrarySearchInteractor";
import { GetChapterInteractor } from "../GetChapterInteractor";
import { ChecklistInteractor } from "../ChecklistInteractor";
import { PractitionerInteractor } from "../PractitionerInteractor";
import { BookSummaryInteractor } from "../BookSummaryInteractor";

export class SearchBooksCommand implements ToolCommand<{ query: string; max_results?: number }, string> {
  private readonly search: LibrarySearchInteractor;
  constructor(repo: BookRepository) { this.search = new LibrarySearchInteractor(repo); }

  async execute({ query, max_results = 5 }: { query: string; max_results?: number }) {
    const results = await this.search.execute({ query, maxResults: Math.min(max_results, 15) });
    if (results.length === 0) return `No results found for "${query}".`;
    return JSON.stringify(results.map(r => ({
      book: `${r.bookNumber}. ${r.bookTitle}`,
      bookNumber: r.bookNumber,
      chapter: r.chapterTitle,
      chapterSlug: r.chapterSlug,
      bookSlug: r.bookSlug,
      matchContext: r.matchContext,
      relevance: r.relevance,
    })), null, 2);
  }
}

export class GetChapterCommand implements ToolCommand<{ book_slug: string; chapter_slug: string }, string> {
  private readonly getChapter: GetChapterInteractor;
  constructor(repo: BookRepository) { this.getChapter = new GetChapterInteractor(repo); }

  async execute({ book_slug, chapter_slug }: { book_slug: string; chapter_slug: string }) {
    const chapter = await this.getChapter.execute({ bookSlug: book_slug, chapterSlug: chapter_slug });
    if (!chapter) return `Chapter not found: ${book_slug}/${chapter_slug}.`;
    
    const content = chapter.content.length > 4000 
      ? chapter.content.slice(0, 4000) + "\n\n[... truncated ...]" 
      : chapter.content;
      
    return `# ${chapter.bookTitle} — ${chapter.title}\n\n${content}`;
  }
}

export class GetChecklistCommand implements ToolCommand<{ book_slug?: string }, string> {
  private readonly checklists: ChecklistInteractor;
  constructor(repo: BookRepository) { this.checklists = new ChecklistInteractor(repo); }

  async execute({ book_slug }: { book_slug?: string }) {
    const results = await this.checklists.execute({ bookSlug: book_slug });
    if (results.length === 0) return "No checklists found.";
    return results.map(cl => `## ${cl.bookTitle} — ${cl.chapterTitle}\n${cl.items.map(i => `- ${i}`).join("\n")}`).join("\n\n");
  }
}

export class ListPractitionersCommand implements ToolCommand<{ query?: string }, string> {
  private readonly practitioners: PractitionerInteractor;
  constructor(repo: BookRepository) { this.practitioners = new PractitionerInteractor(repo); }

  async execute({ query }: { query?: string }) {
    const results = await this.practitioners.execute({ query });
    if (results.length === 0) return "No practitioners found.";
    return results.slice(0, 30).map(p => `**${p.name}** — appears in ${p.books.map(b => `${b.number}. ${b.title}`).join(", ")} (${p.chapters.map(c => c.title).join("; ")})`).join("\n");
  }
}

export class GetBookSummaryCommand implements ToolCommand<{}, string> {
  private readonly summaries: BookSummaryInteractor;
  constructor(repo: BookRepository) { this.summaries = new BookSummaryInteractor(repo); }

  async execute() {
    const results = await this.summaries.execute();
    return results.map(s => {
      const chapterList = s.chapters.map((title, i) => {
        const slug = s.chapterSlugs?.[i];
        return slug ? `- ${title} (slug: \`${slug}\`)` : `- ${title}`;
      }).join("\n");
      return `### Book ${s.number}: ${s.title} (book_slug: \`${s.slug}\`)\n${s.chapterCount} chapters:\n${chapterList}`;
    }).join("\n\n");
  }
}

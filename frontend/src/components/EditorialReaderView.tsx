import { useMemo, useState } from "react";
import { BookOpen, Check, Copy, Sparkles } from "lucide-react";
import type { Note } from "../types";
import { CustomSelect } from "./CustomSelect";
import { QuizPanel } from "./QuizPanel";
import { MENTORION_COPY, type MentorionLang } from "../i18n";

interface EditorialReaderViewProps {
  notes: Note[];
  lang: MentorionLang;
  onCopyQuizPrompt: (note: Note) => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:var(--ed-accent);text-decoration:underline">$1</a>');
}

function renderSimpleMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${renderInline(hMatch[2])}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${renderInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${renderInline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeList();
  if (inCode && codeLines.length > 0) {
    out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  return out.join("\n");
}

export function EditorialReaderView({
  notes,
  lang,
  onCopyQuizPrompt,
}: EditorialReaderViewProps) {
  const t = MENTORION_COPY[lang];
  const [selectedId, setSelectedId] = useState<number | null>(notes[0]?.id ?? null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [quizOpen, setQuizOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(notes.map((n) => n.category))).sort(),
    [notes],
  );

  const visibleNotes = useMemo(
    () =>
      categoryFilter === "all"
        ? notes
        : notes.filter((n) => n.category === categoryFilter),
    [notes, categoryFilter],
  );

  const activeNote =
    visibleNotes.find((n) => n.id === selectedId) ?? visibleNotes[0] ?? null;

  const renderedHtml = useMemo(
    () => (activeNote ? renderSimpleMarkdown(activeNote.content || "") : ""),
    [activeNote],
  );

  const handleCopyPrompt = (note: Note) => {
    onCopyQuizPrompt(note);
    setCopiedId(note.id);
    window.setTimeout(() => setCopiedId((curr) => (curr === note.id ? null : curr)), 2000);
  };

  if (notes.length === 0) {
    return (
      <div
        className="max-w-4xl mx-auto rounded-2xl px-10 py-16 text-center"
        style={{
          background: "var(--ed-bg-elevated)",
          border: "1px solid var(--ed-border-subtle)",
          color: "var(--ed-text-secondary)",
        }}
      >
        <BookOpen size={36} className="mx-auto mb-4 opacity-50" />
        <p className="text-xl font-semibold mb-2 text-zinc-950">{t.readingEmptyTitle}</p>
        <p className="text-base text-zinc-500">{t.readingEmptyDesc}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
      {/* Left Note List (Focused on Reading & Quiz — no Terminology or KG) */}
      <div
        className="rounded-2xl p-4 space-y-3"
        style={{
          background: "var(--ed-bg-elevated)",
          border: "1px solid var(--ed-border-subtle)",
        }}
      >
        <div className="space-y-2.5">
          <span
            className="text-xs font-semibold uppercase tracking-wider block"
            style={{ color: "var(--ed-text-muted)" }}
          >
            Notes ({visibleNotes.length})
          </span>
          {categories.length > 1 && (
            <CustomSelect
              compact
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All Categories" },
                ...categories.map((cat) => ({ value: cat, label: cat })),
              ]}
            />
          )}
        </div>

        <div className="space-y-1 max-h-[68vh] overflow-y-auto pr-1">
          {visibleNotes.map((note) => {
            const isActive = activeNote?.id === note.id;
            return (
              <button
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg transition-colors"
                style={{
                  background: isActive ? "var(--ed-bg-active)" : "transparent",
                  color: isActive ? "var(--ed-text-primary)" : "var(--ed-text-secondary)",
                }}
              >
                <div className="text-sm font-medium truncate">{note.title}</div>
                <div
                  className="text-[11px] flex items-center gap-1.5 mt-0.5"
                  style={{ color: "var(--ed-text-muted)" }}
                >
                  <span className="truncate">{note.category}</span>
                  <span>·</span>
                  <span>SM-2: {note.interval_days}d</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Editorial Minimal Reading Column */}
      {activeNote && (
        <article
          className="rounded-2xl px-8 py-9 md:px-12 md:py-11"
          style={{
            background: "var(--ed-bg-elevated)",
            border: "1px solid var(--ed-border-subtle)",
          }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-7"
            style={{ borderBottom: "1px solid var(--ed-border-subtle)" }}
          >
            <div>
              <div
                className="text-xs font-medium mb-1.5 flex items-center gap-2"
                style={{ color: "var(--ed-text-muted)" }}
              >
                <span>{activeNote.category}</span>
                <span>·</span>
                <span>Ease {activeNote.ease_factor.toFixed(2)}</span>
                <span>·</span>
                <span>Interval {activeNote.interval_days}d</span>
                <span>·</span>
                <span>Reps {activeNote.repetitions}</span>
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight"
                style={{
                  fontFamily: "var(--font-serif)",
                  color: "var(--ed-text-primary)",
                }}
              >
                {activeNote.title}
              </h1>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setQuizOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors cursor-pointer bg-zinc-950 hover:bg-zinc-800 text-white"
              >
                <Sparkles size={15} />
                <span>{quizOpen ? "Hide Quiz" : "Start Quiz"}</span>
              </button>

              <button
                onClick={() => handleCopyPrompt(activeNote)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors cursor-pointer bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-200"
              >
                {copiedId === activeNote.id ? (
                  <>
                    <Check size={15} />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy Prompt</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div
            className="editorial-prose max-w-[700px]"
            dangerouslySetInnerHTML={{
              __html:
                renderedHtml ||
                `<p style="color:var(--ed-text-muted)">此筆記尚無內文。</p>`,
            }}
          />

          {quizOpen && <QuizPanel note={activeNote} onClose={() => setQuizOpen(false)} />}
        </article>
      )}
    </div>
  );
}

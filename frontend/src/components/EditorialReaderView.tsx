import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Menu,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Note, Task } from "../types";
import { QuizPanel } from "./QuizPanel";
import { ManualQuestionComposer } from "./ManualQuestionComposer";
import { MENTORION_COPY, type MentorionLang } from "../i18n";
import { renderMentorionMarkdown } from "../utils/markdown";

interface EditorialReaderViewProps {
  notes: Note[];
  tasks: Task[];
  lang: MentorionLang;
  onCopyQuizPrompt: (note: Note) => void;
  onNoteCreated: () => void;
}

export function EditorialReaderView({
  notes,
  tasks,
  lang,
  onCopyQuizPrompt,
  onNoteCreated,
}: EditorialReaderViewProps) {
  const t = MENTORION_COPY[lang];
  // Default to null -> Library Index view (never auto-jumps into the first article)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"review_date" | "alphabetical">("review_date");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [quizOpen, setQuizOpen] = useState(false);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState("General");
  const [draftContent, setDraftContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Map each note_id to its earliest pending review task date (fallback to note.next_review_date)
  const nextReviewDateByNote = useMemo(() => {
    const map = new Map<number, string>();
    for (const tk of tasks) {
      if (tk.is_completed) continue;
      const existing = map.get(tk.note_id);
      if (!existing || tk.scheduled_date < existing) {
        map.set(tk.note_id, tk.scheduled_date);
      }
    }
    for (const n of notes) {
      if (!map.has(n.id) && n.next_review_date) {
        map.set(n.id, n.next_review_date);
      }
    }
    return map;
  }, [tasks, notes]);

  const sortedNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = !q
      ? [...notes]
      : notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.category.toLowerCase().includes(q) ||
            (n.content || "").toLowerCase().includes(q),
        );

    if (sortBy === "alphabetical") {
      return filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    // Default: review_date (earliest scheduled review first; unscheduled last, then alphabetical)
    return filtered.sort((a, b) => {
      const da = nextReviewDateByNote.get(a.id);
      const db = nextReviewDateByNote.get(b.id);
      if (da && db) {
        const cmp = da.localeCompare(db);
        return cmp !== 0 ? cmp : a.title.localeCompare(b.title);
      }
      if (da) return -1;
      if (db) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [notes, searchQuery, sortBy, nextReviewDateByNote]);

  // Priority pending review tasks: deduplicated by note_id (keeps earliest pending task per note)
  const priorityTasks = useMemo(() => {
    const noteIds = new Set(notes.map((n) => n.id));
    const sorted = tasks
      .filter((tk) => !tk.is_completed && noteIds.has(tk.note_id))
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    const seen = new Set<number>();
    const deduped: Task[] = [];
    for (const tk of sorted) {
      if (seen.has(tk.note_id)) continue;
      seen.add(tk.note_id);
      deduped.push(tk);
      if (deduped.length >= 6) break;
    }
    return deduped;
  }, [tasks, notes]);

  const activeIndex = sortedNotes.findIndex((n) => n.id === selectedId);
  const activeNote =
    activeIndex >= 0
      ? sortedNotes[activeIndex]
      : notes.find((n) => n.id === selectedId) ?? null;
  const prevNote = activeIndex > 0 ? sortedNotes[activeIndex - 1] : null;
  const nextNote =
    activeIndex >= 0 && activeIndex < sortedNotes.length - 1
      ? sortedNotes[activeIndex + 1]
      : null;

  const renderedHtml = useMemo(
    () => (activeNote ? renderMentorionMarkdown(activeNote.content || "") : ""),
    [activeNote],
  );

  const handleCopyPrompt = (note: Note) => {
    onCopyQuizPrompt(note);
    setCopiedId(note.id);
    window.setTimeout(() => setCopiedId((curr) => (curr === note.id ? null : curr)), 2000);
  };

  const handleDeleteNoteFromLibrary = async (note: Note) => {
    const msg =
      lang === "zh-Hant"
        ? `確定要從筆記庫移除「${note.title}」及其相關複習排程嗎？（外部原始檔案不會被刪除）`
        : `Remove "${note.title}" and its scheduled tasks from Library? (External Markdown files are never deleted.)`;
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/library/notes/${note.id}`, { method: "DELETE" });
    if (res.ok) {
      setSelectedId(null);
      setDrawerOpen(false);
      onNoteCreated();
    }
  };

  const handleCreateLibraryNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/library/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          category: draftCategory.trim() || "General",
          content: draftContent,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as { id: number };
        setDraftTitle("");
        setDraftContent("");
        setCreatingNote(false);
        setSelectedId(created.id);
        onNoteCreated();
      }
    } finally {
      setSavingNote(false);
    }
  };

  // --- NEW NOTE COMPOSER ---
  if (creatingNote) {
    return (
      <form
        onSubmit={handleCreateLibraryNote}
        className="max-w-4xl mx-auto rounded-2xl px-8 py-9 md:px-12 md:py-11 space-y-5 bg-white border border-zinc-200"
      >
        <h2 className="text-2xl font-bold font-display text-zinc-950">
          {lang === "zh-Hant" ? "新增筆記至筆記庫" : "Create Library Note"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              {lang === "zh-Hant" ? "標題" : "Title"}
            </label>
            <input
              type="text"
              required
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={lang === "zh-Hant" ? "例如：Transformer Attention" : "e.g. Transformer Attention"}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              {lang === "zh-Hant" ? "分類路徑" : "Category Path"}
            </label>
            <input
              type="text"
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
              placeholder="AI / Deep Learning"
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
            Markdown (LaTeX $...$ / $$...$$ supported)
          </label>
          <textarea
            rows={10}
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder="# Heading..."
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm font-mono leading-relaxed"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setCreatingNote(false)}
            className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-sm font-medium cursor-pointer"
          >
            {lang === "zh-Hant" ? "取消" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={savingNote}
            className="px-6 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-medium cursor-pointer"
          >
            {lang === "zh-Hant" ? "儲存至筆記庫" : "Save to Library"}
          </button>
        </div>
      </form>
    );
  }

  // --- LIBRARY INDEX PAGE (Default when no article is selected) ---
  if (!activeNote) {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
              MENTORION · LIBRARY INDEX
            </div>
            <h1 className="text-3xl md:text-4xl font-bold font-display text-zinc-950 mt-2">
              {t.navReading}
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5">
              {lang === "zh-Hant"
                ? `共收錄 ${notes.length} 篇筆記，點擊任一篇進入全寬無干擾閱讀模式。`
                : `${notes.length} notes indexed. Select any note for full-width distraction-free reading.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreatingNote(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-medium cursor-pointer"
          >
            <Plus size={16} />
            <span>{lang === "zh-Hant" ? "新增筆記" : "New Note"}</span>
          </button>
        </div>

        {/* Search filter + Simple Sort Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === "zh-Hant" ? "篩選標題或分類..." : "Filter by title or category..."}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white border border-zinc-200 focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 border border-zinc-200">
            <button
              type="button"
              onClick={() => setSortBy("review_date")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                sortBy === "review_date"
                  ? "bg-zinc-950 text-white"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {lang === "zh-Hant" ? "依複習日期" : "Review Date"}
            </button>
            <button
              type="button"
              onClick={() => setSortBy("alphabetical")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                sortBy === "alphabetical"
                  ? "bg-zinc-950 text-white"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {lang === "zh-Hant" ? "依字母順序" : "Alphabetical"}
            </button>
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-10 py-16 text-center space-y-3">
            <BookOpen size={36} className="mx-auto text-zinc-400" />
            <p className="text-xl font-semibold text-zinc-950">{t.readingEmptyTitle}</p>
            <p className="text-sm text-zinc-500">{t.readingEmptyDesc}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
            {sortedNotes.map((note) => {
              const reviewDate = nextReviewDateByNote.get(note.id);
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(note.id);
                    setQuizOpen(false);
                  }}
                  className="w-full text-left px-6 py-4 hover:bg-zinc-50 transition-colors cursor-pointer flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-base font-semibold text-zinc-950 truncate">
                      {note.title}
                    </div>
                    <div className="text-xs font-mono text-zinc-400 flex flex-wrap items-center gap-2">
                      <span>{note.category || "General"}</span>
                      <span>·</span>
                      <span>SM-2 · {note.interval_days}d</span>
                      <span>·</span>
                      <span>Reps {note.repetitions}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {reviewDate ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950 text-white text-xs font-mono">
                        <Clock size={12} />
                        <span>{reviewDate}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full border border-zinc-200 text-zinc-400 text-xs font-mono">
                        {lang === "zh-Hant" ? "未排程" : "Unscheduled"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- FULL-WIDTH ARTICLE VIEW + LEFT HOVER UTILITY DRAWER ---
  return (
    <div className="relative min-h-[82vh]">
      {/* Subtle Left-Edge Hover Trigger Zone */}
      <div
        onMouseEnter={() => setDrawerOpen(true)}
        className="fixed left-0 md:left-72 top-0 bottom-0 w-7 z-30 flex items-center justify-start group cursor-pointer"
        title={lang === "zh-Hant" ? "移入開啟複習工具列" : "Hover to open review dock"}
      >
        <div className="ml-1.5 px-1 py-4 rounded-r-lg bg-zinc-900/10 group-hover:bg-zinc-900 group-hover:text-white text-zinc-500 transition-all">
          <Menu size={14} />
        </div>
      </div>

      {/* Left Hover Overlay Drawer (Priority Review Tasks + Prev/Next + Utilities) */}
      <div
        onMouseLeave={() => setDrawerOpen(false)}
        className={`fixed left-0 md:left-72 top-0 bottom-0 w-80 z-40 bg-white/95 backdrop-blur-md border-r border-zinc-200 shadow-2xl p-6 flex flex-col justify-between transition-all duration-200 ease-out ${
          drawerOpen
            ? "opacity-100 translate-x-0 visible"
            : "opacity-0 -translate-x-4 invisible pointer-events-none"
        }`}
      >
        <div className="space-y-6 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setDrawerOpen(false);
            }}
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>{lang === "zh-Hant" ? "返回筆記庫目錄" : "Back to Library Index"}</span>
          </button>

          {/* Priority Review Tasks Queue */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              {lang === "zh-Hant" ? "優先複習任務" : "Priority Review Queue"}
            </div>
            {priorityTasks.length === 0 ? (
              <p className="text-xs text-zinc-400">
                {lang === "zh-Hant" ? "目前沒有待辦複習任務。" : "No pending review tasks."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {priorityTasks.map((tk) => (
                  <button
                    key={tk.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(tk.note_id);
                      setQuizOpen(false);
                      setDrawerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                      tk.note_id === activeNote.id
                        ? "bg-zinc-950 text-white border-zinc-950"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border-zinc-200"
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">{tk.note_title}</div>
                    <div
                      className={`text-[11px] font-mono flex items-center gap-1 mt-0.5 ${
                        tk.note_id === activeNote.id ? "text-zinc-300" : "text-zinc-400"
                      }`}
                    >
                      <Clock size={10} />
                      <span>{tk.scheduled_date}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Utilities: Prev/Next + Quick Quiz + Copy Prompt */}
        <div className="pt-5 border-t border-zinc-200 space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
            {lang === "zh-Hant" ? "工具與導覽" : "Utilities"}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!prevNote}
              onClick={() => {
                if (prevNote) {
                  setSelectedId(prevNote.id);
                  setQuizOpen(false);
                }
              }}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-35 text-xs font-medium text-zinc-800 cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>{lang === "zh-Hant" ? "上一篇" : "Prev"}</span>
            </button>
            <button
              type="button"
              disabled={!nextNote}
              onClick={() => {
                if (nextNote) {
                  setSelectedId(nextNote.id);
                  setQuizOpen(false);
                }
              }}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-35 text-xs font-medium text-zinc-800 cursor-pointer"
            >
              <span>{lang === "zh-Hant" ? "下一篇" : "Next"}</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setQuizOpen((v) => !v);
              setDrawerOpen(false);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
          >
            <Sparkles size={14} />
            <span>{quizOpen ? t.hideQuiz : t.startQuiz}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddQuestionOpen((v) => !v);
              setDrawerOpen(false);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-900 bg-white hover:bg-zinc-950 hover:text-white text-zinc-950 text-xs font-medium cursor-pointer transition-colors"
          >
            <Plus size={14} />
            <span>{lang === "zh-Hant" ? "新增題目" : "Add Question"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleCopyPrompt(activeNote)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800 text-xs font-medium cursor-pointer"
          >
            {copiedId === activeNote.id ? (
              <>
                <Check size={14} />
                <span>{t.copied}</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>{t.copyPrompt}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleDeleteNoteFromLibrary(activeNote)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 text-xs font-medium cursor-pointer transition-colors"
          >
            <Trash2 size={13} />
            <span>{lang === "zh-Hant" ? "從筆記庫移除" : "Remove from Library"}</span>
          </button>
        </div>
      </div>

      {/* Full-Width Distraction-Free Article Surface */}
      <article className="max-w-4xl mx-auto rounded-2xl px-8 py-10 md:px-14 md:py-12 bg-white border border-zinc-200">
        <div className="flex items-center justify-between gap-3 pb-6 mb-8 border-b border-zinc-200">
          <div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-900 mb-3 cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>{lang === "zh-Hant" ? "返回筆記庫" : "Back to Library"}</span>
            </button>
            <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-zinc-950">
              {activeNote.title}
            </h1>
            <div className="text-xs font-mono text-zinc-500 flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-3">
              <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-700 font-sans font-medium">
                {activeNote.category || "General"}
              </span>
              <span>
                {lang === "zh-Hant" ? "上次複習" : "Last Reviewed"}:{" "}
                <strong className="text-zinc-900">
                  {activeNote.last_reviewed_at
                    ? activeNote.last_reviewed_at.slice(0, 10)
                    : lang === "zh-Hant"
                      ? "尚未複習"
                      : "Never"}
                </strong>
              </span>
              <span>·</span>
              <span>
                {lang === "zh-Hant" ? "下次排程" : "Next"}:{" "}
                <strong className="text-zinc-900">
                  {nextReviewDateByNote.get(activeNote.id) || (lang === "zh-Hant" ? "未排程" : "None")}
                </strong>
              </span>
              <span>·</span>
              <span>
                {lang === "zh-Hant" ? "累計複習" : "Reps"}{" "}
                <strong className="text-zinc-900">{activeNote.repetitions}</strong>
              </span>
              <span>·</span>
              <span>Ease {activeNote.ease_factor.toFixed(2)}</span>
              <span>·</span>
              <span>Interval {activeNote.interval_days}d</span>
            </div>
          </div>
        </div>

        <div
          className="editorial-prose max-w-none"
          dangerouslySetInnerHTML={{
            __html:
              renderedHtml ||
              `<p style="color:var(--ed-text-muted)">此筆記尚無內文。</p>`,
          }}
        />

        {addQuestionOpen && (
          <ManualQuestionComposer
            note={activeNote}
            lang={lang}
            onCreated={() => {
              onNoteCreated();
            }}
            onClose={() => setAddQuestionOpen(false)}
          />
        )}

        {quizOpen && <QuizPanel note={activeNote} onClose={() => setQuizOpen(false)} />}
      </article>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { Note, Task } from "../types";
import type { MentorionLang } from "../i18n";
import { renderMentorionMarkdown } from "../utils/markdown";
import { QuizPanel, type QuizQuestion } from "./QuizPanel";

interface RevisionCardModalProps {
  task: Task;
  note: Note;
  lang: MentorionLang;
  anchorOption: "A" | "B";
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onUpdateEaseFactor: (noteId: number, nextEf: number) => Promise<void>;
}

const TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  mcq: { zh: "選擇題", en: "MCQ" },
  fill_in_blank: { zh: "填空題", en: "Fill in Blanks" },
  true_false: { zh: "是非題", en: "True / False" },
  short_answer: { zh: "簡答題", en: "Short Answer" },
  short_essay: { zh: "短申論", en: "Short Essay" },
  essay: { zh: "申論題", en: "Essay" },
  open: { zh: "開放題", en: "Open" },
};

function defaultCountForEaseFactor(ef: number, maxAvail: number): number {
  if (maxAvail <= 1) return maxAvail;
  if (ef < 2.0) return Math.min(maxAvail, Math.max(3, Math.ceil(maxAvail * 0.8)));
  if (ef <= 2.6) return Math.min(maxAvail, Math.max(2, Math.ceil(maxAvail * 0.5)));
  return Math.min(maxAvail, Math.max(1, Math.ceil(maxAvail * 0.3)));
}

export function RevisionCardModal({
  task,
  note,
  lang,
  anchorOption,
  onClose,
  onRefresh,
  onUpdateEaseFactor,
}: RevisionCardModalProps) {
  const zh = lang === "zh-Hant";
  const [mode, setMode] = useState<"note" | "setup" | "quiz">("note");
  const [scheduleMode, setScheduleMode] = useState<"sm2" | "custom">("sm2");
  const [customDays, setCustomDays] = useState<number>(7);
  const [ef, setEf] = useState<number>(task.ease_factor || note.ease_factor || 2.5);
  const [rating, setRating] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);

  // Owned questions loaded for this note (read-only check; never auto-generates)
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [loadingQs, setLoadingQs] = useState(true);

  // Quiz setup gate state
  const [enabledTypes, setEnabledTypes] = useState<string[]>([]);
  const [selectedCount, setSelectedCount] = useState<number>(1);
  const [activeQuizSlice, setActiveQuizSlice] = useState<QuizQuestion[]>([]);

  // Custom Monochrome Delete Scope Modal (replaces native browser confirm)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingScope, setDeletingScope] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setEf(task.ease_factor || note.ease_factor || 2.5);
  }, [task.ease_factor, note.ease_factor]);

  useEffect(() => {
    let cancelled = false;
    setLoadingQs(true);
    fetch("/api/quiz/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note_id: note.id,
        title: note.title,
        content: note.content,
        generate_if_empty: false,
      }),
    })
      .then((res) => (res.ok ? res.json() : { questions: [] }))
      .then((data) => {
        if (cancelled) return;
        const qs = (data.questions || []) as QuizQuestion[];
        setAllQuestions(qs);
        const typesPresent = Array.from(new Set(qs.map((q) => q.type)));
        setEnabledTypes(typesPresent);
        setSelectedCount(defaultCountForEaseFactor(ef, qs.length));
      })
      .catch(() => {
        if (!cancelled) setAllQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingQs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [note.id, note.title, note.content]);

  const availableTypes = useMemo(
    () => Array.from(new Set(allQuestions.map((q) => q.type))),
    [allQuestions],
  );

  const filteredQuestions = useMemo(
    () => allQuestions.filter((q) => enabledTypes.includes(q.type)),
    [allQuestions, enabledTypes],
  );

  // Clamp selectedCount dynamically whenever type filters change
  useEffect(() => {
    const maxAvail = filteredQuestions.length;
    if (maxAvail === 0) {
      setSelectedCount(0);
    } else {
      setSelectedCount((curr) => {
        if (curr <= 0) return defaultCountForEaseFactor(ef, maxAvail);
        return Math.min(curr, maxAvail);
      });
    }
  }, [filteredQuestions.length, ef]);

  const renderedNoteHtml = useMemo(
    () => renderMentorionMarkdown(note.content || ""),
    [note.content],
  );

  const handleToggleType = (typeId: string) => {
    setEnabledTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId],
    );
  };

  const handleEfChange = (nextEf: number) => {
    const clamped = Math.max(1.3, Math.min(3.0, Math.round(nextEf * 100) / 100));
    setEf(clamped);
    void onUpdateEaseFactor(note.id, clamped);
  };

  // Mark THIS task completed and schedule next review in +X days
  const handleQuickCompleteDays = async (days: number) => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          nextIntervalDays: days,
          anchorOption,
          actualDate: new Date().toISOString().split("T")[0],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Failed (${res.status})`);
      }
      onClose();
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Mark THIS task completed with SM-2 rating (0-5) and auto-schedule next review
  const handleCompleteWithSm2 = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          anchorOption,
          actualDate: new Date().toISOString().split("T")[0],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Failed (${res.status})`);
      }
      onClose();
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteWithScope = async (scope: "single" | "future" | "all") => {
    setDeletingScope(scope);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}?scope=${scope}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Delete failed (${res.status})`);
      }
      setDeleteDialogOpen(false);
      onClose();
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingScope(null);
    }
  };

  const handleStartQuizSession = () => {
    if (filteredQuestions.length === 0 || selectedCount <= 0) return;
    setActiveQuizSlice(filteredQuestions.slice(0, selectedCount));
    setMode("quiz");
  };

  const hasQuestions = allQuestions.length > 0;

  const SM2_HINTS = zh
    ? ["完全遺忘", "幾乎忘記", "模糊有印象", "吃力想起", "稍作思考想起", "輕鬆精熟"]
    : ["Blackout", "Barely recalled", "Familiar gap", "Hard recall", "Good recall", "Mastered"];

  const CUSTOM_INTERVALS = [
    { days: 1, label: "+1d" },
    { days: 3, label: "+3d" },
    { days: 7, label: "+7d" },
    { days: 21, label: "+21d" },
    { days: 80, label: "+80d" },
    { days: 240, label: "+240d" },
  ];

  const renderCompletionFooter = () => (
    <div className="pt-4 border-t border-zinc-200 space-y-3">
      {scheduleMode === "sm2" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900">
              {zh
                ? "根據本次複習狀況評分（SM-2 自動計算下次間隔）"
                : "Rate this review session (SM-2 schedules next interval)"}
            </span>
            <span className="text-xs font-mono text-zinc-500">
              {rating} / 5 · {SM2_HINTS[rating]}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5">
              <span>{zh ? "← 完全遺忘" : "← Blackout"}</span>
              <span>{zh ? "完全精熟 →" : "Mastered →"}</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {[0, 1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setRating(score)}
                  title={SM2_HINTS[score]}
                  className={`py-2 rounded-xl border text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    rating === score
                      ? "bg-zinc-950 text-white border-zinc-950"
                      : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-500"
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900">
              {zh ? "安排下一次複習時間（指定間隔）" : "Schedule next review (custom interval)"}
            </span>
            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-600">
              <span>+</span>
              <input
                type="number"
                min={1}
                max={730}
                value={customDays}
                onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 px-2 py-0.5 rounded-md border border-zinc-300 bg-white text-center font-mono text-xs text-zinc-950 focus:border-zinc-900 focus:outline-none"
              />
              <span>{zh ? "天" : "days"}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5">
              <span>{zh ? "← 短期強化" : "← Short-term"}</span>
              <span>{zh ? "長期鞏固 →" : "Long-term →"}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {CUSTOM_INTERVALS.map((item) => (
                <button
                  key={item.days}
                  type="button"
                  onClick={() => setCustomDays(item.days)}
                  className={`py-2 rounded-xl border text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    customDays === item.days
                      ? "bg-zinc-950 text-white border-zinc-950"
                      : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-500"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end gap-2.5 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium cursor-pointer"
        >
          {zh ? "關閉" : "Close"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() =>
            void (scheduleMode === "sm2"
              ? handleCompleteWithSm2()
              : handleQuickCompleteDays(customDays))
          }
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          <span>
            {scheduleMode === "sm2"
              ? zh
                ? "完成本次複習並更新下次排程"
                : "Complete Review & Schedule Next"
              : zh
                ? `完成複習並於 +${customDays} 天後再次複習`
                : `Complete & Review in +${customDays}d`}
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-4 md:p-8 bg-black/50 backdrop-blur-xs">
      <div className="relative bg-white text-zinc-950 rounded-2xl shadow-2xl border border-zinc-200 max-w-3xl w-full my-auto overflow-hidden text-left">
        {/* Header */}
        <div className="flex justify-between items-start gap-4 px-6 py-5 border-b border-zinc-200">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
              <span>{task.note_category}</span>
              <span>·</span>
              <span>{task.scheduled_date}</span>
              <span>·</span>
              <span>Reps {task.repetitions || 0}</span>
              <span>·</span>
              <span>Interval {task.interval_days || 0}d</span>
              {task.is_completed ? (
                <span className="px-2 py-0.5 rounded bg-zinc-950 text-white text-[10px]">
                  {zh ? "已完成" : "Completed"}
                </span>
              ) : null}
            </div>
            <h3 className="text-xl font-bold font-display text-zinc-950 leading-snug">
              {task.note_title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-900 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Compact SM-2 Ease Factor + Quick Complete (+1d/+3d/+7d) + Quiz Trigger + Delete */}
        <div className="px-6 py-3.5 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className="text-xs font-medium text-zinc-700"
              title={
                zh
                  ? "SM-2 記憶成長倍率：越低複習越頻繁（難），越高間隔拉越長（簡單）。"
                  : "SM-2 interval multiplier: lower = harder (more frequent), higher = easier."
              }
            >
              {zh ? "難易度 (EF)" : "Ease"}:{" "}
              <span className="font-mono font-bold text-zinc-950">{ef.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={1.3}
              max={3.0}
              step={0.05}
              value={ef}
              onChange={(e) => handleEfChange(Number(e.target.value))}
              className="w-24 accent-zinc-950 cursor-pointer"
            />
            <div className="inline-flex items-center gap-1.5">
              {[
                { label: zh ? "難" : "Hard", val: 1.7 },
                { label: zh ? "標準" : "Normal", val: 2.5 },
                { label: zh ? "簡單" : "Easy", val: 2.8 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => handleEfChange(preset.val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    Math.abs(ef - preset.val) < 0.08
                      ? "bg-zinc-950 text-white border-zinc-950"
                      : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-500"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Schedule Mode Switch: SM-2 vs Custom */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/75 border border-zinc-200">
              <button
                type="button"
                onClick={() => setScheduleMode("sm2")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  scheduleMode === "sm2"
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-600 hover:text-zinc-950"
                }`}
              >
                SM-2
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode("custom")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  scheduleMode === "custom"
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-600 hover:text-zinc-950"
                }`}
              >
                {zh ? "指定" : "Custom"}
              </button>
            </div>

            {/* Quiz Trigger Button (locked when 0 questions exist for this note) */}
            <button
              type="button"
              disabled={loadingQs || !hasQuestions}
              onClick={() => {
                setSelectedCount(defaultCountForEaseFactor(ef, filteredQuestions.length || allQuestions.length));
                setMode(mode === "note" ? "setup" : "note");
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                !hasQuestions
                  ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                  : mode !== "note"
                    ? "bg-zinc-950 text-white border-zinc-950 cursor-pointer"
                    : "bg-white hover:bg-zinc-950 hover:text-white text-zinc-900 border-zinc-900 cursor-pointer"
              }`}
              title={
                !hasQuestions
                  ? zh
                    ? "此筆記尚無題目（請先至筆記庫新增或生成題目）"
                    : "No questions available for this note yet"
                  : zh
                    ? `開啟複習解題（共 ${allQuestions.length} 題可選）`
                    : `Start quiz (${allQuestions.length} questions available)`
              }
            >
              {!hasQuestions ? <Lock size={11} /> : <Sparkles size={11} />}
              <span>
                {zh ? "複習解題" : "Quiz"}
                {hasQuestions ? ` (${allQuestions.length})` : ""}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-950 hover:text-white text-zinc-600 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <Trash2 size={12} />
              <span>{zh ? "刪除" : "Delete"}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-800">
            {errorMsg}
          </div>
        )}

        {/* STAGE 1: NOTE CONTENT (Unified Markdown + KaTeX Renderer) + Direct Rating Bar */}
        {mode === "note" && (
          <div className="px-6 py-5 space-y-5">
            <div className="bg-zinc-50/70 border border-zinc-200 rounded-xl px-6 py-5 max-h-[44vh] overflow-y-auto">
              <div
                className="editorial-prose max-w-none"
                dangerouslySetInnerHTML={{
                  __html:
                    renderedNoteHtml ||
                    `<p style="color:var(--ed-text-muted)">${zh ? "此筆記尚無內文。" : "No content yet."}</p>`,
                }}
              />
            </div>

            {/* Direct Completion Bar (SM-2 Rating OR Custom Interval) */}
            {renderCompletionFooter()}
          </div>
        )}

        {/* STAGE 2: QUIZ SETUP GATE (Type Trigger Buttons + Dynamic Count Slider based on EF) */}
        {mode === "setup" && (
          <div className="px-6 py-6 space-y-6">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMode("note")}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-950 cursor-pointer"
              >
                ← {zh ? "返回筆記內容" : "Back to Note"}
              </button>
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                QUIZ SETUP
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-zinc-700">
                {zh ? "選擇本次測驗題型（點選開關）" : "Select Question Types"}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableTypes.map((typeId) => {
                  const active = enabledTypes.includes(typeId);
                  const countForType = allQuestions.filter((q) => q.type === typeId).length;
                  const label = TYPE_LABELS[typeId]?.[zh ? "zh" : "en"] || typeId;
                  return (
                    <button
                      key={typeId}
                      type="button"
                      onClick={() => handleToggleType(typeId)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? "bg-zinc-950 text-white border-zinc-950"
                          : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-500"
                      }`}
                    >
                      {label} ({countForType})
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-zinc-900">
                  {zh ? "本次練習題數" : "Number of Questions"}
                </div>
                <div className="text-sm font-mono font-bold text-zinc-950">
                  {selectedCount} / {filteredQuestions.length}
                </div>
              </div>
              <input
                type="range"
                min={filteredQuestions.length > 0 ? 1 : 0}
                max={filteredQuestions.length}
                step={1}
                disabled={filteredQuestions.length === 0}
                value={selectedCount}
                onChange={(e) => setSelectedCount(Number(e.target.value))}
                className="w-full accent-zinc-950 cursor-pointer"
              />
              <p className="text-xs text-zinc-500">
                {zh
                  ? `已依目前難易度因子 (EF ${ef.toFixed(2)}) 預設推薦題數，可自由拖曳調整（最多 ${filteredQuestions.length} 題）。`
                  : `Default count suggested from Ease Factor (${ef.toFixed(2)}). Max ${filteredQuestions.length} matching questions.`}
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMode("note")}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium cursor-pointer"
              >
                {zh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={selectedCount <= 0 || filteredQuestions.length === 0}
                onClick={handleStartQuizSession}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
              >
                <Sparkles size={14} />
                <span>
                  {zh ? `開始解題（${selectedCount} 題）` : `Start Quiz (${selectedCount})`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3: ACTIVE RECALL QUIZ + SM-2 COMPLETION */}
        {mode === "quiz" && (
          <div className="px-6 pb-6 space-y-5">
            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMode("setup")}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-950 cursor-pointer"
              >
                ← {zh ? "返回題目設定" : "Back to Quiz Setup"}
              </button>
              <button
                type="button"
                onClick={() => setMode("note")}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-950 cursor-pointer"
              >
                {zh ? "查看原筆記" : "View Note"}
              </button>
            </div>

            <div className="max-h-[46vh] overflow-y-auto pr-1">
              <QuizPanel
                note={note}
                initialQuestions={activeQuizSlice}
                onClose={() => setMode("note")}
              />
            </div>

            {renderCompletionFooter()}
          </div>
        )}

        {/* CUSTOM MONOCHROME 3-MODE DELETE DIALOG (Zero native window.confirm) */}
        {deleteDialogOpen && (
          <div className="absolute inset-0 z-20 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold font-display text-zinc-950">
                    {zh ? "選擇刪除排程範圍" : "Delete Review Schedule"}
                  </h4>
                  <p className="text-xs text-zinc-500 mt-1">
                    {zh
                      ? "以下操作只會移除行事曆排程，筆記庫原檔與題庫皆會保留。"
                      : "Only scheduled tasks are removed. The note in Library and its questions are preserved."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteDialogOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={!!deletingScope}
                  onClick={() => void handleDeleteWithScope("single")}
                  className="w-full text-left px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-950 hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-zinc-950">
                    {zh ? "1. 只刪除此特定排程" : "1. Delete only this task"}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {zh
                      ? `僅移除 ${task.scheduled_date} 這一筆，不影響同系列其他任務。`
                      : `Removes only the task on ${task.scheduled_date}.`}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!!deletingScope}
                  onClick={() => void handleDeleteWithScope("future")}
                  className="w-full text-left px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-950 hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-zinc-950">
                    {zh ? "2. 刪除此後所有未完成排程" : "2. Delete this & future pending tasks"}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {zh
                      ? "移除此筆及後續待複習排程，完整保留過往已完成歷史紀錄。"
                      : "Removes this and upcoming pending tasks while preserving completed history."}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!!deletingScope}
                  onClick={() => void handleDeleteWithScope("all")}
                  className="w-full text-left px-4 py-3 rounded-xl border border-zinc-900 bg-zinc-950 hover:bg-zinc-800 text-white transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold">
                    {zh ? "3. 刪除此系列所有排程" : "3. Delete all tasks in this series"}
                  </div>
                  <div className="text-[11px] text-zinc-300 mt-0.5">
                    {zh
                      ? "清空此筆記的所有已完成與未完成排程（筆記本身仍留在筆記庫）。"
                      : "Clears all past and future tasks for this note (keeps the Library note)."}
                  </div>
                </button>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteDialogOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium cursor-pointer"
                >
                  {zh ? "取消" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

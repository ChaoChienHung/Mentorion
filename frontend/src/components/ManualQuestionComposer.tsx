import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, Scissors, Trash2, X } from "lucide-react";
import type { Note } from "../types";
import type { MentorionLang } from "../i18n";

type ComposerQuestionType =
  | "mcq"
  | "fill_in_blank"
  | "true_false"
  | "short_answer"
  | "short_essay"
  | "essay";

interface ManualQuestionComposerProps {
  note: Note;
  lang?: MentorionLang;
  onCreated: () => void;
  onClose: () => void;
}

const QUESTION_TYPES: { id: ComposerQuestionType; zh: string; en: string }[] = [
  { id: "mcq", zh: "選擇題", en: "MCQ" },
  { id: "fill_in_blank", zh: "填空題", en: "Fill in the Blanks" },
  { id: "true_false", zh: "是非題", en: "True / False" },
  { id: "short_answer", zh: "簡答題", en: "Short Answer" },
  { id: "short_essay", zh: "短申論", en: "Short Essay" },
  { id: "essay", zh: "申論題", en: "Essay" },
];

export function ManualQuestionComposer({
  note,
  lang = "zh-Hant",
  onCreated,
  onClose,
}: ManualQuestionComposerProps) {
  const zh = lang === "zh-Hant";
  const [qType, setQType] = useState<ComposerQuestionType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");

  // MCQ state (2 to 6 dynamic options + selected correct index)
  const [mcqOptions, setMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [mcqCorrectIdx, setMcqCorrectIdx] = useState<number>(0);

  // Fill-in-the-blank state: supports selecting text to wrap as {{answer}} or typing {{answer}} directly
  const [fibRawText, setFibRawText] = useState("");
  const fibTextareaRef = useRef<HTMLTextAreaElement>(null);

  // True/False state
  const [tfAnswer, setTfAnswer] = useState<boolean>(true);

  // Short answer / Essay state
  const [shortAnswer, setShortAnswer] = useState("");
  const [referencePointsText, setReferencePointsText] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Parse {{answer}} markers from fibRawText into prompt (with ___) and ordered blanks[]
  const fibParsed = useMemo(() => {
    const blanks: string[] = [];
    const displayPrompt = fibRawText.replace(/\{\{([^}]+)\}\}/g, (_full, inner: string) => {
      const cleaned = inner.trim();
      if (!cleaned) return "";
      blanks.push(cleaned);
      return "___";
    });
    return { displayPrompt, blanks };
  }, [fibRawText]);

  const handleBlankSelection = () => {
    const el = fibTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
      setError(
        zh
          ? "請先在句子中反白選取要挖空的文字片段。"
          : "Highlight the phrase you want to blank out first.",
      );
      return;
    }
    const selected = fibRawText.slice(start, end);
    if (selected.includes("{{") || selected.includes("}}")) return;
    setError(null);
    const updated =
      fibRawText.slice(0, start) + `{{${selected.trim()}}}` + fibRawText.slice(end);
    setFibRawText(updated);
  };

  const handleRestoreBlank = (blankIdx: number) => {
    let current = 0;
    const updated = fibRawText.replace(/\{\{([^}]+)\}\}/g, (full, inner: string) => {
      if (current === blankIdx) {
        current += 1;
        return inner;
      }
      current += 1;
      return full;
    });
    setFibRawText(updated);
  };

  const handleAddMcqOption = () => {
    if (mcqOptions.length >= 6) return;
    setMcqOptions((prev) => [...prev, ""]);
  };

  const handleRemoveMcqOption = (idx: number) => {
    if (mcqOptions.length <= 2) return;
    setMcqOptions((prev) => prev.filter((_, i) => i !== idx));
    if (mcqCorrectIdx === idx) setMcqCorrectIdx(0);
    else if (mcqCorrectIdx > idx) setMcqCorrectIdx((c) => c - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const payload: Record<string, unknown> = {
      note_id: note.id,
      type: qType,
      explanation: explanation.trim() || undefined,
    };

    if (qType === "fill_in_blank") {
      if (!fibParsed.displayPrompt.trim() || fibParsed.blanks.length === 0) {
        setError(
          zh
            ? "請輸入完整句子，並反白選取至少一處挖空（或使用 {{答案}} 標記）。"
            : "Enter a sentence and blank out at least one phrase using selection or {{answer}}.",
        );
        return;
      }
      payload.prompt = fibParsed.displayPrompt.trim();
      payload.blanks = fibParsed.blanks;
    } else {
      if (!prompt.trim()) {
        setError(zh ? "請輸入題目內容。" : "Please enter a question prompt.");
        return;
      }
      payload.prompt = prompt.trim();
    }

    if (qType === "mcq") {
      const cleaned = mcqOptions.map((o) => o.trim()).filter(Boolean);
      const chosenAns = (mcqOptions[mcqCorrectIdx] || "").trim();
      if (cleaned.length < 2) {
        setError(zh ? "選擇題至少需要 2 個非空選項。" : "MCQ requires at least 2 non-empty options.");
        return;
      }
      if (!chosenAns || !cleaned.includes(chosenAns)) {
        setError(zh ? "請確認已勾選一個非空的正確答案選項。" : "Select a non-empty option as the correct answer.");
        return;
      }
      payload.options = cleaned;
      payload.answer = chosenAns;
    } else if (qType === "true_false") {
      payload.answer = tfAnswer;
    } else if (qType === "short_answer") {
      if (!shortAnswer.trim()) {
        setError(zh ? "請輸入簡答題參考答案。" : "Please enter a reference answer.");
        return;
      }
      payload.answer = shortAnswer.trim();
      const pts = referencePointsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (pts.length > 0) payload.rubric = pts;
    } else if (qType === "short_essay" || qType === "essay") {
      const pts = referencePointsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      payload.reference_points = pts;
      payload.rubric = pts;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/questions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save question");
      setSuccessMsg(zh ? "已新增題目至集中題庫！" : "Question added to question bank!");
      setPrompt("");
      setFibRawText("");
      setShortAnswer("");
      setReferencePointsText("");
      setExplanation("");
      setMcqOptions(["", "", "", ""]);
      setMcqCorrectIdx(0);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 space-y-5 shadow-2xl"
      >
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            MANUAL QUESTION AUTHORING
          </div>
          <h3 className="text-lg font-bold font-display text-zinc-950 mt-0.5">
            {zh ? "新增題目" : "Add Question"} · {note.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Type Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
          {zh ? "題目類型" : "Question Type"}
        </label>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQType(item.id);
                setError(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                qType === item.id
                  ? "bg-zinc-950 text-white border-zinc-950"
                  : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-500"
              }`}
            >
              {zh ? item.zh : item.en}
            </button>
          ))}
        </div>
      </div>

      {/* Fill in the Blanks Interactive Editor */}
      {qType === "fill_in_blank" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {zh
                ? "完整句子（反白選取文字後點擊「挖空選取文字」，或直接輸入 {{答案}}）"
                : "Full Sentence (highlight text and click Blank Selection, or wrap with {{answer}})"}
            </label>
            <button
              type="button"
              onClick={handleBlankSelection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
            >
              <Scissors size={13} />
              <span>{zh ? "挖空選取文字" : "Blank Selection"}</span>
            </button>
          </div>
          <textarea
            ref={fibTextareaRef}
            rows={3}
            value={fibRawText}
            onChange={(e) => setFibRawText(e.target.value)}
            placeholder={
              zh
                ? "例如：Scaled Dot-Product Attention 會將內積除以 {{sqrt(d_k)}} 來維持 {{variance}} 穩定。"
                : "e.g. Scaled Dot-Product Attention divides by {{sqrt(d_k)}} to stabilize {{variance}}."
            }
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm leading-relaxed"
          />

          {/* Live Preview + Removable Blank Chips */}
          {fibRawText.trim() && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                {zh ? "題目預覽" : "Live Preview"}
              </div>
              <p className="text-sm text-zinc-900 leading-relaxed">{fibParsed.displayPrompt}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {fibParsed.blanks.length === 0 ? (
                  <span className="text-xs text-zinc-400">
                    {zh ? "尚未挖空任何片段。" : "No blanks selected yet."}
                  </span>
                ) : (
                  fibParsed.blanks.map((ans, idx) => (
                    <span
                      key={`${ans}-${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-zinc-300 text-xs font-mono text-zinc-900"
                    >
                      <span className="text-zinc-400">#{idx + 1}</span>
                      <span>{ans}</span>
                      <button
                        type="button"
                        onClick={() => handleRestoreBlank(idx)}
                        className="text-zinc-400 hover:text-zinc-900 cursor-pointer"
                        title={zh ? "還原此挖空" : "Restore this blank"}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Standard Prompt Input */
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
            {zh ? "題目內容" : "Question Prompt"}
          </label>
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={zh ? "輸入題目敘述..." : "Enter your question prompt..."}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm leading-relaxed"
          />
        </div>
      )}

      {/* Dynamic MCQ Options */}
      {qType === "mcq" && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {zh ? `選項設定（${mcqOptions.length} 個，點擊圓點設為正解）` : `Options (${mcqOptions.length}, mark correct)`}
            </label>
            {mcqOptions.length < 6 && (
              <button
                type="button"
                onClick={handleAddMcqOption}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:border-zinc-900 text-xs font-medium text-zinc-800 cursor-pointer"
              >
                <Plus size={12} />
                <span>{zh ? "新增選項" : "Add Option"}</span>
              </button>
            )}
          </div>
          <div className="space-y-2">
            {mcqOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMcqCorrectIdx(idx)}
                  className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    mcqCorrectIdx === idx
                      ? "bg-zinc-950 border-zinc-950 text-white"
                      : "bg-white border-zinc-300 text-transparent hover:border-zinc-600"
                  }`}
                  title={zh ? "設為正確答案" : "Mark as correct"}
                >
                  <Check size={12} />
                </button>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) =>
                    setMcqOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  placeholder={`${zh ? "選項" : "Option"} ${String.fromCharCode(65 + idx)}`}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
                />
                {mcqOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMcqOption(idx)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                    title={zh ? "移除此選項" : "Remove option"}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* True / False Selector */}
      {qType === "true_false" && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
            {zh ? "正確答案" : "Correct Answer"}
          </label>
          <div className="flex gap-2.5">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setTfAnswer(val)}
                className={`px-5 py-2 rounded-xl border text-xs font-medium cursor-pointer ${
                  tfAnswer === val
                    ? "bg-zinc-950 text-white border-zinc-950"
                    : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-500"
                }`}
              >
                {val ? (zh ? "正確 (True)" : "True") : zh ? "錯誤 (False)" : "False"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Short Answer */}
      {qType === "short_answer" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
              {zh ? "參考答案" : "Reference Answer"}
            </label>
            <input
              type="text"
              value={shortAnswer}
              onChange={(e) => setShortAnswer(e.target.value)}
              placeholder={zh ? "簡潔明確的標準答案..." : "Concise reference answer..."}
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
            />
          </div>
        </div>
      )}

      {/* Reference Points / Rubric for Short Answer, Short Essay, Essay */}
      {(qType === "short_answer" || qType === "short_essay" || qType === "essay") && (
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
            {zh ? "評分要點 / 參考關鍵點（每行一點，可選）" : "Key Reference Points / Rubric (one per line, optional)"}
          </label>
          <textarea
            rows={3}
            value={referencePointsText}
            onChange={(e) => setReferencePointsText(e.target.value)}
            placeholder={zh ? "要點 1...\n要點 2..." : "Key point 1...\nKey point 2..."}
            className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
          />
        </div>
      )}

      {/* Optional Explanation */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
          {zh ? "解析補充（可選）" : "Explanation (optional)"}
        </label>
        <input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder={zh ? "答完題後顯示的補充說明..." : "Optional explanation shown after answering..."}
          className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
        />
      </div>

      {error && (
        <div className="px-4 py-2.5 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-800">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="px-4 py-2.5 rounded-xl border border-zinc-900 bg-zinc-50 text-xs font-medium text-zinc-950">
          {successMsg}
        </div>
      )}

      <div className="flex justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium cursor-pointer"
        >
          {zh ? "關閉" : "Close"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          <span>{zh ? "儲存題目至題庫" : "Save Question"}</span>
        </button>
      </div>
    </form>
    </div>
  );
}

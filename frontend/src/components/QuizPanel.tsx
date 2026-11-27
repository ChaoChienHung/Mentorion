import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Lock, Plus, Send, Sparkles, X } from "lucide-react";
import type { Note } from "../types";
import type { MentorionLang } from "../i18n";
import { ManualQuestionComposer } from "./ManualQuestionComposer";

export interface QuizQuestion {
  id?: string;
  type:
    | "mcq"
    | "short_answer"
    | "true_false"
    | "open"
    | "short_essay"
    | "essay"
    | "fill_in_blank";
  bloom_level?: "recall" | "understand" | "apply" | "analyze" | null;
  prompt: string;
  options?: string[];
  answer?: string | boolean;
  blanks?: string[];
  rubric?: string[];
  reference_points?: string[];
  explanation?: string;
  source: "sidecar" | "inline_schema" | "llm" | "bank" | "manual";
}

interface SocraticState {
  round: number;
  action: "hint" | "commit";
  hint?: string | null;
  followup_question?: string | null;
  missing_points: string[];
  sm2_rating?: number | null;
  summary: string;
  strengths: string[];
}

interface EssayGrade {
  score: number;
  correct_points: string[];
  corrections: string[];
  suggestions: string[];
  summary_feedback: string;
}

interface QuizPanelProps {
  note: Note;
  lang?: MentorionLang;
  initialQuestions?: QuizQuestion[];
  onClose: () => void;
}

function getSavedSourceDir(): string | null {
  try {
    const raw = window.localStorage.getItem("mentorion-schema-config");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { source_dir?: string };
    return parsed.source_dir || null;
  } catch {
    return null;
  }
}

export function QuizPanel({ note, lang = "zh-Hant", initialQuestions, onClose }: QuizPanelProps) {
  const zh = lang === "zh-Hant";
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [essayDrafts, setEssayDrafts] = useState<Record<number, string>>({});
  const [fibDrafts, setFibDrafts] = useState<Record<number, string[]>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [essayGrades, setEssayGrades] = useState<Record<number, EssayGrade>>({});
  const [gradingIdx, setGradingIdx] = useState<number | null>(null);
  const [socraticByIdx, setSocraticByIdx] = useState<Record<number, SocraticState>>({});
  const [socraticLoadingIdx, setSocraticLoadingIdx] = useState<number | null>(null);
  const [remediatingIdx, setRemediatingIdx] = useState<number | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState<boolean>(true);
  const [llmLockReason, setLlmLockReason] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/llm/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setLlmAvailable(Boolean(data.available));
        setLlmLockReason(data.lock_reasons?.llm || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const loadQuestions = useCallback(
    async (forceLlmOnly: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const endpoint = forceLlmOnly ? "/api/quiz/generate" : "/api/quiz/load";
        const body = forceLlmOnly
          ? {
              note_id: note.id,
              title: note.title,
              content: note.content,
              count: 3,
              question_types: ["mcq", "short_answer", "short_essay"],
              language: lang,
            }
          : {
              note_id: note.id,
              title: note.title,
              content: note.content,
              source_dir: getSavedSourceDir(),
              generate_if_empty: true,
              count: 3,
              question_types: ["mcq", "short_answer", "short_essay"],
              language: lang,
            };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load questions");
        setQuestions(data.questions || []);
        setSelectedAnswers({});
        setRevealed({});
        setLoadedOnce(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [note.content, note.id, note.title],
  );

  useEffect(() => {
    if (initialQuestions && initialQuestions.length > 0) {
      setQuestions(initialQuestions);
      setLoadedOnce(true);
      return;
    }
    void loadQuestions(false);
  }, [initialQuestions, loadQuestions]);

  const handleGradeEssay = async (idx: number, q: QuizQuestion) => {
    const answerText = (essayDrafts[idx] || "").trim();
    if (!answerText) return;
    setGradingIdx(idx);
    setError(null);
    try {
      const res = await fetch("/api/quiz/grade-essay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: note.id,
          title: note.title,
          content: note.content,
          prompt: q.prompt,
          user_answer: answerText,
          reference_points: q.reference_points || q.rubric || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to grade essay");
      setEssayGrades((prev) => ({ ...prev, [idx]: data as EssayGrade }));
      setRevealed((prev) => ({ ...prev, [idx]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGradingIdx(null);
    }
  };

  const handleSocraticProbe = async (idx: number, q: QuizQuestion) => {
    const answerText = (essayDrafts[idx] || "").trim();
    if (!answerText) return;
    setSocraticLoadingIdx(idx);
    setError(null);
    const nextRound = (socraticByIdx[idx]?.round || 0) + 1;
    try {
      const res = await fetch("/api/coach/socratic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: note.id,
          title: note.title,
          content: note.content,
          prompt: q.prompt,
          user_answer: answerText,
          reference_points: q.reference_points || q.rubric || [],
          round_number: Math.min(3, nextRound),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to run Socratic probe");
      setSocraticByIdx((prev) => ({
        ...prev,
        [idx]: {
          round: nextRound,
          action: data.action,
          hint: data.hint,
          followup_question: data.followup_question,
          missing_points: data.missing_points || [],
          sm2_rating: data.sm2_rating,
          summary: data.summary || "",
          strengths: data.strengths || [],
        },
      }));
      if (data.action === "commit") {
        setRevealed((prev) => ({ ...prev, [idx]: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSocraticLoadingIdx(null);
    }
  };

  const handleRemediate = async (idx: number, q: QuizQuestion, userAnswer: string, gapNotes = "") => {
    setRemediatingIdx(idx);
    setError(null);
    try {
      const res = await fetch("/api/coach/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: note.id,
          missed_prompt: q.prompt,
          user_answer: userAnswer,
          gap_notes: gapNotes,
          count: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate remediation questions");
      const added = (data.added_questions || []) as QuizQuestion[];
      if (added.length > 0) {
        setQuestions((prev) => [...prev, ...added]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemediatingIdx(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold font-display text-zinc-950">
            {zh ? "主動回憶測驗" : "Active Recall Quiz"}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {zh
              ? "集中題庫 + 去重 AI 出題 + 申論自動批改"
              : "Centralized question bank + deduplicated LLM Function Calling + Essay grading."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-zinc-300 bg-white hover:border-zinc-900 text-zinc-900 transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>{zh ? "新增題目" : "Add Question"}</span>
          </button>
          <button
            type="button"
            disabled={loading || !llmAvailable}
            onClick={() => void loadQuestions(true)}
            title={llmAvailable ? undefined : llmLockReason || (zh ? "未設定 LLM API Key" : "LLM API key not configured")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : !llmAvailable ? (
              <Lock size={13} />
            ) : (
              <Sparkles size={13} />
            )}
            <span>{zh ? "AI 生成新題目" : "Generate New Questions (LLM)"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
            title={zh ? "關閉" : "Close"}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {composerOpen && (
        <ManualQuestionComposer
          note={note}
          lang={lang}
          onCreated={() => void loadQuestions(false)}
          onClose={() => setComposerOpen(false)}
        />
      )}

      {!llmAvailable && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-600">
          <Lock size={13} className="shrink-0 text-zinc-500" />
          <span>{zh ? "未偵測到任何 LLM API Key" : "No LLM API key detected"}</span>
        </div>
      )}

      {error && !(!llmAvailable && /api key/i.test(error)) && (
        <div className="px-4 py-3 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-700">
          {error}
        </div>
      )}

      {(loadedOnce || (!llmAvailable && Boolean(error && /api key/i.test(error)))) &&
        questions.length === 0 &&
        !loading && (
          <div className="px-5 py-6 rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
            {zh ? (
              <>
                目前尚無已儲存的題目。請點擊 <strong className="text-zinc-900">+ 新增題目</strong> 手動出題
                {llmAvailable ? (
                  <>
                    ，或點擊 <strong className="text-zinc-900">AI 生成新題目</strong>。
                  </>
                ) : (
                  "。"
                )}
              </>
            ) : (
              <>
                No questions saved yet. Click <strong className="text-zinc-900">+ Add Question</strong> to author one manually
                {llmAvailable ? (
                  <>
                    {" "}or <strong className="text-zinc-900">Generate New Questions (LLM)</strong>.
                  </>
                ) : (
                  "."
                )}
              </>
            )}
          </div>
        )}

      {questions.length > 0 && (
        <div className="space-y-4">
          {questions.map((q, idx) => {
            const chosen = selectedAnswers[idx];
            const isRevealed = !!revealed[idx];
            const isEssay = q.type === "short_essay" || q.type === "essay";
            const grade = essayGrades[idx];

            return (
              <div
                key={q.id || idx}
                className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  <span>
                    Q{idx + 1} · {q.type.replace("_", " ")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {q.bloom_level && (
                      <span className="px-2 py-0.5 rounded border border-zinc-300 bg-white text-zinc-700">
                        {q.bloom_level}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-zinc-200/70 text-zinc-600">
                      {q.source}
                    </span>
                  </div>
                </div>

                <p className="text-[15.5px] font-medium text-zinc-950 leading-relaxed">
                  {q.prompt}
                </p>

                {q.type === "mcq" && q.options && (
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isPicked = chosen === opt;
                      const isCorrect = opt === String(q.answer);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setSelectedAnswers((prev) => ({ ...prev, [idx]: opt }));
                            setRevealed((prev) => ({ ...prev, [idx]: true }));
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left text-[14px] transition-colors cursor-pointer ${
                            isRevealed && isCorrect
                              ? "bg-zinc-950 border-zinc-950 text-white font-medium"
                              : isPicked && isRevealed && !isCorrect
                                ? "bg-zinc-200 border-zinc-400 text-zinc-700 line-through"
                                : "bg-white border-zinc-200 hover:border-zinc-400 text-zinc-800"
                          }`}
                        >
                          <span>{opt}</span>
                          {isRevealed && isCorrect && <Check size={15} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === "fill_in_blank" && q.blanks && q.blanks.length > 0 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.blanks.map((expected, bIdx) => {
                        const val = (fibDrafts[idx] || [])[bIdx] || "";
                        const isCorrect =
                          isRevealed &&
                          val.trim().toLowerCase() === expected.trim().toLowerCase();
                        return (
                          <div key={bIdx} className="space-y-1">
                            <label className="text-[11px] font-mono text-zinc-400 block">
                              Blank #{bIdx + 1}
                            </label>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => {
                                const nextArr = [...(fibDrafts[idx] || [])];
                                nextArr[bIdx] = e.target.value;
                                setFibDrafts((prev) => ({ ...prev, [idx]: nextArr }));
                              }}
                              placeholder={`Fill blank #${bIdx + 1}...`}
                              className={`w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none ${
                                isRevealed
                                  ? isCorrect
                                    ? "bg-zinc-950 text-white border-zinc-950"
                                    : "bg-zinc-100 text-zinc-700 border-zinc-400"
                                  : "bg-white border-zinc-200 focus:border-zinc-900 text-zinc-900"
                              }`}
                            />
                            {isRevealed && !isCorrect && (
                              <div className="text-xs font-mono text-zinc-600">
                                → <strong className="text-zinc-950">{expected}</strong>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {!isRevealed && (
                      <button
                        type="button"
                        onClick={() => setRevealed((prev) => ({ ...prev, [idx]: true }))}
                        className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
                      >
                        Check Blanks
                      </button>
                    )}
                  </div>
                )}

                {q.type === "true_false" && (
                  <div className="flex gap-3">
                    {(["true", "false"] as const).map((val) => {
                      const isCorrect = String(q.answer) === val;
                      const isPicked = chosen === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setSelectedAnswers((prev) => ({ ...prev, [idx]: val }));
                            setRevealed((prev) => ({ ...prev, [idx]: true }));
                          }}
                          className={`px-5 py-2.5 rounded-xl border text-sm font-medium capitalize transition-colors cursor-pointer ${
                            isRevealed && isCorrect
                              ? "bg-zinc-950 border-zinc-950 text-white"
                              : isPicked && isRevealed && !isCorrect
                                ? "bg-zinc-200 border-zinc-400 text-zinc-600 line-through"
                                : "bg-white border-zinc-200 hover:border-zinc-400 text-zinc-800"
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                )}

                {isEssay && (
                  <div className="space-y-3">
                    <textarea
                      rows={q.type === "essay" ? 5 : 3}
                      value={essayDrafts[idx] || ""}
                      onChange={(e) =>
                        setEssayDrafts((prev) => ({ ...prev, [idx]: e.target.value }))
                      }
                      placeholder="Write your explanation here for LLM grading & feedback..."
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white focus:border-zinc-900 focus:outline-none text-sm leading-relaxed"
                    />
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={!llmAvailable || gradingIdx === idx || !(essayDrafts[idx] || "").trim()}
                        onClick={() => void handleGradeEssay(idx, q)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer"
                      >
                        {gradingIdx === idx ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : !llmAvailable ? (
                          <Lock size={13} />
                        ) : (
                          <Send size={13} />
                        )}
                        <span>Grade with LLM</span>
                      </button>
                      <button
                        type="button"
                        disabled={!llmAvailable || socraticLoadingIdx === idx || !(essayDrafts[idx] || "").trim()}
                        onClick={() => void handleSocraticProbe(idx, q)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white hover:border-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-800 text-xs font-medium cursor-pointer"
                      >
                        {socraticLoadingIdx === idx ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : !llmAvailable ? (
                          <Lock size={13} />
                        ) : (
                          <Sparkles size={13} />
                        )}
                        <span>Socratic Hint</span>
                      </button>
                      {!isRevealed && (
                        <button
                          type="button"
                          onClick={() => setRevealed((prev) => ({ ...prev, [idx]: true }))}
                          className="px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:border-zinc-400 text-xs font-medium text-zinc-700 cursor-pointer"
                        >
                          Show Reference Points
                        </button>
                      )}
                    </div>

                    {socraticByIdx[idx] && (
                      <div className="rounded-xl border border-zinc-300 bg-white p-4 space-y-2 text-sm">
                        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-zinc-500">
                          <span>Socratic Round {socraticByIdx[idx].round}</span>
                          {socraticByIdx[idx].action === "commit" &&
                            socraticByIdx[idx].sm2_rating !== null &&
                            socraticByIdx[idx].sm2_rating !== undefined && (
                              <span className="px-2.5 py-0.5 rounded-full bg-zinc-950 text-white font-semibold">
                                SM-2: {socraticByIdx[idx].sm2_rating} / 5
                              </span>
                            )}
                        </div>
                        <p className="text-zinc-800">{socraticByIdx[idx].summary}</p>
                        {socraticByIdx[idx].hint && (
                          <p className="text-xs text-zinc-600">
                            <strong className="text-zinc-900">Hint: </strong>
                            {socraticByIdx[idx].hint}
                          </p>
                        )}
                        {socraticByIdx[idx].followup_question && (
                          <p className="text-xs font-medium text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                            Follow-up: {socraticByIdx[idx].followup_question}
                          </p>
                        )}
                      </div>
                    )}

                    {grade && (
                      <div className="rounded-xl border border-zinc-300 bg-white p-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-950">LLM Evaluation</span>
                          <span className="px-2.5 py-1 rounded-full bg-zinc-950 text-white font-mono text-xs font-semibold">
                            Score: {grade.score} / 5
                          </span>
                        </div>
                        <p className="text-zinc-700 leading-relaxed">{grade.summary_feedback}</p>
                        {grade.correct_points.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                              Correct Points
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5 text-zinc-700">
                              {grade.correct_points.map((pt, i) => (
                                <li key={i}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {grade.corrections.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                              Corrections & Gaps
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5 text-zinc-700">
                              {grade.corrections.map((pt, i) => (
                                <li key={i}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {grade.suggestions.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                              Suggestions
                            </div>
                            <ul className="list-disc pl-5 space-y-0.5 text-zinc-600">
                              {grade.suggestions.map((pt, i) => (
                                <li key={i}>{pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(q.type === "short_answer" || q.type === "open") && !isRevealed && (
                  <button
                    type="button"
                    onClick={() => setRevealed((prev) => ({ ...prev, [idx]: true }))}
                    className="px-4 py-2 rounded-lg border border-zinc-300 bg-white hover:border-zinc-500 text-xs font-medium text-zinc-800 cursor-pointer"
                  >
                    Reveal Reference Answer
                  </button>
                )}

                {isRevealed && (
                  <div className="pt-3 border-t border-zinc-200 space-y-2 text-[14px] text-zinc-700">
                    {q.type === "short_answer" && q.answer && (
                      <p>
                        <strong className="text-zinc-950">Answer: </strong>
                        {String(q.answer)}
                      </p>
                    )}
                    {q.reference_points && q.reference_points.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1">
                        {q.reference_points.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    )}
                    {q.explanation && (
                      <p className="text-zinc-500 leading-relaxed">{q.explanation}</p>
                    )}
                    {((q.type === "mcq" && chosen && chosen !== String(q.answer)) ||
                      (q.type === "true_false" && chosen && chosen !== String(q.answer)) ||
                      (grade && grade.score <= 2)) && (
                      <div className="pt-2">
                        <button
                          type="button"
                          disabled={!llmAvailable || remediatingIdx === idx}
                          onClick={() =>
                            void handleRemediate(
                              idx,
                              q,
                              isEssay ? essayDrafts[idx] || "" : chosen || "",
                              grade ? grade.corrections.join("; ") : "",
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-900 bg-white hover:bg-zinc-950 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-zinc-900 text-xs font-medium transition-colors cursor-pointer"
                        >
                          {remediatingIdx === idx ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : !llmAvailable ? (
                            <Lock size={13} />
                          ) : (
                            <Sparkles size={13} />
                          )}
                          <span>Generate Weak-Spot Remediation Questions</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Send, Sparkles, X } from "lucide-react";
import type { Note } from "../types";

export interface QuizQuestion {
  id?: string;
  type: "mcq" | "short_answer" | "true_false" | "open" | "short_essay" | "essay";
  prompt: string;
  options?: string[];
  answer?: string | boolean;
  rubric?: string[];
  reference_points?: string[];
  explanation?: string;
  source: "sidecar" | "inline_schema" | "llm" | "bank" | "manual";
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

export function QuizPanel({ note, onClose }: QuizPanelProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [essayDrafts, setEssayDrafts] = useState<Record<number, string>>({});
  const [essayGrades, setEssayGrades] = useState<Record<number, EssayGrade>>({});
  const [gradingIdx, setGradingIdx] = useState<number | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

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
            }
          : {
              note_id: note.id,
              title: note.title,
              content: note.content,
              source_dir: getSavedSourceDir(),
              generate_if_empty: true,
              count: 3,
              question_types: ["mcq", "short_answer", "short_essay"],
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
    void loadQuestions(false);
  }, [loadQuestions]);

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

  return (
    <div className="mt-8 pt-7 border-t border-zinc-200 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold font-display text-zinc-950">
            Active Recall Quiz
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Centralized question bank + deduplicated LLM Function Calling + Essay grading.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadQuestions(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-950 hover:bg-zinc-800 text-white transition-colors cursor-pointer"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>Generate New Questions (LLM)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-700">
          {error}
        </div>
      )}

      {loadedOnce && questions.length === 0 && !error && !loading && (
        <div className="px-5 py-6 rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
          No questions saved yet. Click <strong className="text-zinc-900">Generate New Questions (LLM)</strong>.
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
                  <span className="px-2 py-0.5 rounded bg-zinc-200/70 text-zinc-600">
                    {q.source}
                  </span>
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
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        disabled={gradingIdx === idx || !(essayDrafts[idx] || "").trim()}
                        onClick={() => void handleGradeEssay(idx, q)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
                      >
                        {gradingIdx === idx ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        <span>Grade with LLM</span>
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

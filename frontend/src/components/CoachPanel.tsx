import { useState } from "react";
import {
  Activity,
  CalendarClock,
  Check,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { Note } from "../types";
import type { MentorionLang } from "../i18n";
import { CustomSelect } from "./CustomSelect";

interface RescheduleMove {
  task_id: number;
  note_title?: string;
  old_date?: string;
  new_date: string;
  reason: string;
}

interface LeechNoteItem {
  note_id: number;
  title: string;
  ease_factor: number;
  repetitions: number;
  reason: string;
}

interface ProposedCramTask {
  note_id: number;
  title?: string;
  scheduled_date: string;
  reason: string;
}

interface WeeklyDiagnosis {
  headline: string;
  diagnosis: string;
  leech_notes: LeechNoteItem[];
  proposed_tasks: ProposedCramTask[];
}

interface AuditResult {
  note_id: number;
  bloom_tags: Record<string, string>;
  dropped_duplicate_ids: string[];
  summary: string;
}

interface CoachPanelProps {
  notes: Note[];
  lang: MentorionLang;
  onRefreshData: () => Promise<void>;
}

export function CoachPanel({ notes, lang, onRefreshData }: CoachPanelProps) {
  const zh = lang === "zh-Hant";

  // 1. Smart Rescheduler
  const [instruction, setInstruction] = useState("");
  const [planning, setPlanning] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [planMoves, setPlanMoves] = useState<RescheduleMove[]>([]);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  // 2. Weekly Diagnosis
  const [diagnosing, setDiagnosing] = useState(false);
  const [applyingCram, setApplyingCram] = useState(false);
  const [diagnosis, setDiagnosis] = useState<WeeklyDiagnosis | null>(null);
  const [cramNotice, setCramNotice] = useState<string | null>(null);

  // 3. Bloom Audit
  const [auditNoteId, setAuditNoteId] = useState<string>(notes[0] ? String(notes[0].id) : "");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const [error, setError] = useState<string | null>(null);

  const handlePlanReschedule = async () => {
    if (!instruction.trim()) return;
    setPlanning(true);
    setError(null);
    setPlanNotice(null);
    try {
      const res = await fetch("/api/coach/reschedule/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim(), horizon_days: 14 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to plan reschedule");
      setPlanSummary(data.summary || "");
      setPlanMoves(data.moves || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  };

  const handleApplyReschedule = async () => {
    if (planMoves.length === 0) return;
    setApplyingPlan(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/reschedule/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moves: planMoves }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to apply reschedule");
      setPlanNotice(
        zh ? `已套用 ${data.updated} 筆任務排程調整。` : `Applied ${data.updated} task date updates.`,
      );
      setPlanMoves([]);
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingPlan(false);
    }
  };

  const handleWeeklyDiagnosis = async () => {
    setDiagnosing(true);
    setError(null);
    setCramNotice(null);
    try {
      const res = await fetch("/api/coach/weekly-diagnosis", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to run diagnosis");
      setDiagnosis(data as WeeklyDiagnosis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiagnosing(false);
    }
  };

  const handleApplyCramTasks = async () => {
    if (!diagnosis || diagnosis.proposed_tasks.length === 0) return;
    setApplyingCram(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/weekly-diagnosis/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: diagnosis.proposed_tasks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to schedule remedial tasks");
      setCramNotice(
        zh ? `已新增 ${data.created} 筆補強複習任務。` : `Scheduled ${data.created} remedial review tasks.`,
      );
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingCram(false);
    }
  };

  const handleAuditQuestions = async () => {
    const nid = Number(auditNoteId || notes[0]?.id);
    if (!nid) return;
    setAuditing(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/audit-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: nid, apply_changes: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to audit questions");
      setAuditResult(data as AuditResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-zinc-200 pb-5">
        <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
          MENTORION · LLM FUNCTION CALLING
        </div>
        <h1 className="text-3xl font-bold font-display text-zinc-950 mt-2">
          {zh ? "AI 複習教練" : "AI Study Coach"}
        </h1>
        <p className="text-sm text-zinc-500 mt-1.5">
          {zh
            ? "透過結構化 Function Calling 執行自然語言重排、頑固筆記診斷與題庫 Bloom 難度治理（僅操作 Mentorion SQLite 與集中題庫）。"
            : "Structured LLM Function Calling for natural-language rescheduling, leech-note diagnosis, and Bloom's taxonomy question curation."}
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-800">
          {error}
        </div>
      )}

      {/* 1. Smart Rescheduler */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <CalendarClock size={18} className="text-zinc-900" />
          <h2 className="text-lg font-semibold text-zinc-950">
            {zh ? "智慧排程重排（先預覽後套用）" : "Smart Rescheduler (Dry-Run Preview)"}
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              zh
                ? "例如：把這兩天沒做完的複習分散到週末，難度高的優先排週六"
                : "e.g. Spread overdue reviews across this weekend, hardest notes on Saturday"
            }
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
          />
          <button
            type="button"
            disabled={planning || !instruction.trim()}
            onClick={() => void handlePlanReschedule()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-sm font-medium cursor-pointer shrink-0"
          >
            {planning ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            <span>{zh ? "產生重排預覽" : "Preview Plan"}</span>
          </button>
        </div>

        {planSummary && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <p className="text-sm text-zinc-800 font-medium">{planSummary}</p>
            {planMoves.length > 0 && (
              <>
                <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white overflow-hidden">
                  {planMoves.map((m) => (
                    <div key={m.task_id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-zinc-900">{m.note_title || `Task #${m.task_id}`}</div>
                        <div className="text-zinc-500">{m.reason}</div>
                      </div>
                      <div className="font-mono text-zinc-700">
                        {m.old_date} → <strong className="text-zinc-950">{m.new_date}</strong>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={applyingPlan}
                  onClick={() => void handleApplyReschedule()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
                >
                  {applyingPlan ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  <span>{zh ? "確認套用排程" : "Confirm & Apply"}</span>
                </button>
              </>
            )}
          </div>
        )}
        {planNotice && <p className="text-xs font-medium text-zinc-700">{planNotice}</p>}
      </section>

      {/* 2. Weekly Study Health & Leech Diagnosis */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Activity size={18} className="text-zinc-900" />
            <h2 className="text-lg font-semibold text-zinc-950">
              {zh ? "學習週報與頑固筆記診斷" : "Weekly Health & Leech Diagnosis"}
            </h2>
          </div>
          <button
            type="button"
            disabled={diagnosing}
            onClick={() => void handleWeeklyDiagnosis()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
          >
            {diagnosing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>{zh ? "執行健康診斷" : "Run Diagnosis"}</span>
          </button>
        </div>

        {diagnosis && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-4">
            <div>
              <div className="text-base font-semibold text-zinc-950">{diagnosis.headline}</div>
              <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{diagnosis.diagnosis}</p>
            </div>

            {diagnosis.leech_notes.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                  {zh ? "需加強的頑固筆記" : "Leech Notes"}
                </div>
                <div className="space-y-1.5">
                  {diagnosis.leech_notes.map((n) => (
                    <div key={n.note_id} className="px-3.5 py-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-zinc-900">{n.title}</span>
                        <span className="text-zinc-500 ml-2">{n.reason}</span>
                      </div>
                      <span className="font-mono text-zinc-500 shrink-0">
                        Ease {n.ease_factor.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diagnosis.proposed_tasks.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                  {zh ? "建議補救複習排程" : "Proposed Remedial Tasks"}
                </div>
                <div className="space-y-1.5">
                  {diagnosis.proposed_tasks.map((tk, i) => (
                    <div key={`${tk.note_id}-${i}`} className="px-3.5 py-2.5 rounded-lg bg-white border border-zinc-200 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-zinc-900">{tk.title || `Note #${tk.note_id}`}</span>
                        <span className="text-zinc-500 ml-2">{tk.reason}</span>
                      </div>
                      <span className="font-mono font-semibold text-zinc-900 shrink-0">{tk.scheduled_date}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={applyingCram}
                  onClick={() => void handleApplyCramTasks()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
                >
                  {applyingCram ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  <span>{zh ? "一鍵加入補強任務" : "Schedule Proposed Tasks"}</span>
                </button>
              </div>
            )}
          </div>
        )}
        {cramNotice && <p className="text-xs font-medium text-zinc-700">{cramNotice}</p>}
      </section>

      {/* 3. Bloom's Taxonomy Question Audit */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Layers size={18} className="text-zinc-900" />
          <h2 className="text-lg font-semibold text-zinc-950">
            {zh ? "題庫 Bloom 認知難度標記與去重" : "Question Bank Bloom Audit & Deduplication"}
          </h2>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1">
            <CustomSelect
              value={auditNoteId || (notes[0] ? String(notes[0].id) : "")}
              onChange={(val) => setAuditNoteId(val)}
              options={notes.map((n) => ({
                value: String(n.id),
                label: n.title,
                description: n.category,
              }))}
            />
          </div>
          <button
            type="button"
            disabled={auditing || notes.length === 0}
            onClick={() => void handleAuditQuestions()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-sm font-medium cursor-pointer shrink-0"
          >
            {auditing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            <span>{zh ? "執行題庫治理" : "Audit Questions"}</span>
          </button>
        </div>

        {auditResult && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-2 text-xs text-zinc-700">
            <p className="font-medium text-zinc-950">{auditResult.summary}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="px-2.5 py-1 rounded-md bg-white border border-zinc-200 font-mono">
                {zh ? "已標記題數" : "Tagged"}: {Object.keys(auditResult.bloom_tags).length}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white border border-zinc-200 font-mono">
                {zh ? "已移除重複題" : "Dropped Duplicates"}: {auditResult.dropped_duplicate_ids.length}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

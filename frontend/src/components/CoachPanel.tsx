import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Bookmark,
  BookOpen,
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Layers,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { Note } from "../types";
import type { MentorionLang } from "../i18n";
import { CustomSelect } from "./CustomSelect";

interface LLMProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  model: string;
  supports_function_calling: boolean;
  supports_web_search: boolean;
}

export interface LLMStatus {
  available: boolean;
  active_provider: string | null;
  active_provider_name: string | null;
  active_model: string | null;
  providers: LLMProviderInfo[];
  capabilities: {
    quiz_generation: boolean;
    essay_grading: boolean;
    study_mentor: boolean;
    resource_discovery: boolean;
    resource_summarize: boolean;
  };
  lock_reasons: {
    llm: string | null;
    resource_discovery: string | null;
  };
}

interface DiscoveredResource {
  title: string;
  url: string;
  source_type: "paper" | "docs" | "video" | "blog" | "web";
  relevance_note: string;
}

interface SavedResource {
  id: number;
  note_id: number | null;
  topic: string | null;
  title: string;
  url: string;
  source_type: string;
  relevance_note: string;
  summary: string | null;
  created_at: string;
}

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

const SOURCE_TYPE_LABELS: Record<string, { zh: string; en: string }> = {
  paper: { zh: "論文", en: "Paper" },
  docs: { zh: "官方文件", en: "Docs" },
  video: { zh: "影片", en: "Video" },
  blog: { zh: "技術文章", en: "Blog" },
  web: { zh: "網頁", en: "Web" },
};

export function CoachPanel({ notes, lang, onRefreshData }: CoachPanelProps) {
  const zh = lang === "zh-Hant";

  // 0. LLM Status & Provider Switcher
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [switchingProvider, setSwitchingProvider] = useState(false);

  const fetchLlmStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/llm/status");
      if (res.ok) {
        const data = (await res.json()) as LLMStatus;
        setLlmStatus(data);
      }
    } catch {
      // Ignore transient network errors
    }
  }, []);

  useEffect(() => {
    void fetchLlmStatus();
  }, [fetchLlmStatus]);

  const llmAvailable = llmStatus ? llmStatus.available : false;
  const canUseMentor = llmStatus ? llmStatus.capabilities.study_mentor : false;
  const canDiscoverResources = llmStatus ? llmStatus.capabilities.resource_discovery : false;
  const canSummarize = llmStatus ? llmStatus.capabilities.resource_summarize : false;
  const canGenerateQuiz = llmStatus ? llmStatus.capabilities.quiz_generation : false;

  const handleSwitchProvider = async (providerId: string) => {
    setSwitchingProvider(true);
    setError(null);
    try {
      const res = await fetch("/api/llm/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to switch LLM provider");
      setLlmStatus(data as LLMStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitchingProvider(false);
    }
  };

  // 1. NotebookLM-style Resource Research (Discover + Bookmark + Scrape/Summarize + Cross-Source Quiz)
  const [researchMode, setResearchMode] = useState<"note" | "topic">(notes.length > 0 ? "note" : "topic");
  const [researchNoteId, setResearchNoteId] = useState<string>(notes[0] ? String(notes[0].id) : "");
  const [researchTopic, setResearchTopic] = useState("");
  const [researchQuery, setResearchQuery] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverySynthesis, setDiscoverySynthesis] = useState<string | null>(null);
  const [discoveredItems, setDiscoveredItems] = useState<DiscoveredResource[]>([]);
  const [savedResources, setSavedResources] = useState<SavedResource[]>([]);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [summarizingId, setSummarizingId] = useState<number | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [generatingCrossQuiz, setGeneratingCrossQuiz] = useState(false);
  const [crossQuizNotice, setCrossQuizNotice] = useState<string | null>(null);

  // Manual bookmark form (works even without LLM API key)
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualNote, setManualNote] = useState("");

  const activeResearchNoteId =
    researchMode === "note" ? Number(researchNoteId || notes[0]?.id || 0) || null : null;

  const fetchSavedResources = useCallback(async () => {
    try {
      const query = activeResearchNoteId ? `?note_id=${activeResearchNoteId}` : "";
      const res = await fetch(`/api/resources${query}`);
      if (res.ok) {
        const data = (await res.json()) as SavedResource[];
        setSavedResources(data);
      }
    } catch {
      // Ignore transient errors
    }
  }, [activeResearchNoteId]);

  useEffect(() => {
    void fetchSavedResources();
    setSelectedResourceIds([]);
    setCrossQuizNotice(null);
  }, [fetchSavedResources]);

  const handleDiscoverResources = async () => {
    if (!canDiscoverResources) return;
    if (researchMode === "note" && !activeResearchNoteId) return;
    if (researchMode === "topic" && !researchTopic.trim()) return;

    setDiscovering(true);
    setError(null);
    setCrossQuizNotice(null);
    try {
      const res = await fetch("/api/resources/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: researchMode === "note" ? activeResearchNoteId : null,
          topic: researchMode === "topic" ? researchTopic.trim() : null,
          query: researchQuery.trim(),
          max_results: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to discover resources");
      setDiscoverySynthesis(data.synthesis || "");
      setDiscoveredItems((data.resources || []) as DiscoveredResource[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  };

  const handleBookmarkResource = async (item: DiscoveredResource) => {
    setSavingUrl(item.url);
    setError(null);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: activeResearchNoteId,
          topic: researchMode === "topic" ? researchTopic.trim() || null : null,
          title: item.title,
          url: item.url,
          source_type: item.source_type,
          relevance_note: item.relevance_note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save resource");
      await fetchSavedResources();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingUrl(null);
    }
  };

  const handleManualSaveResource = async () => {
    if (!manualTitle.trim() || !manualUrl.trim()) return;
    setSavingUrl(manualUrl.trim());
    setError(null);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: activeResearchNoteId,
          topic: researchMode === "topic" ? researchTopic.trim() || null : null,
          title: manualTitle.trim(),
          url: manualUrl.trim(),
          source_type: "web",
          relevance_note: manualNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save manual resource");
      setManualTitle("");
      setManualUrl("");
      setManualNote("");
      setManualOpen(false);
      await fetchSavedResources();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingUrl(null);
    }
  };

  const handleDeleteResource = async (id: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/resources/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete resource");
      }
      setSelectedResourceIds((prev) => prev.filter((rid) => rid !== id));
      await fetchSavedResources();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSummarizeResource = async (id: number) => {
    if (!canSummarize) return;
    setSummarizingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/resources/${id}/summarize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to scrape and summarize resource");
      await fetchSavedResources();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizingId(null);
    }
  };

  const toggleSelectResource = (id: number) => {
    setSelectedResourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerateCrossSourceQuiz = async () => {
    if (!canGenerateQuiz || !activeResearchNoteId) return;
    setGeneratingCrossQuiz(true);
    setError(null);
    setCrossQuizNotice(null);
    try {
      const res = await fetch("/api/resources/cross-source-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note_id: activeResearchNoteId,
          resource_ids: selectedResourceIds,
          count: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to generate cross-source quiz");
      const count = Array.isArray(data.questions) ? data.questions.length : 0;
      setCrossQuizNotice(
        zh
          ? `已結合外部資源生成 ${count} 題跨來源進階題目並存入集中題庫（原筆記保持只讀）。`
          : `Generated ${count} cross-source questions and saved to the centralized question bank.`,
      );
      await onRefreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingCrossQuiz(false);
    }
  };

  // 2. Smart Rescheduler
  const [instruction, setInstruction] = useState("");
  const [planning, setPlanning] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [planMoves, setPlanMoves] = useState<RescheduleMove[]>([]);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  // 3. Weekly Diagnosis
  const [diagnosing, setDiagnosing] = useState(false);
  const [applyingCram, setApplyingCram] = useState(false);
  const [diagnosis, setDiagnosis] = useState<WeeklyDiagnosis | null>(null);
  const [cramNotice, setCramNotice] = useState<string | null>(null);

  // 4. Bloom Audit
  const [auditNoteId, setAuditNoteId] = useState<string>(notes[0] ? String(notes[0].id) : "");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const [error, setError] = useState<string | null>(null);

  const handlePlanReschedule = async () => {
    if (!canUseMentor || !instruction.trim()) return;
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
    if (!canUseMentor) return;
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
    if (!canUseMentor) return;
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

  const savedUrls = new Set(savedResources.map((r) => r.url));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="border-b border-zinc-200 pb-5 space-y-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
            MENTORION · MULTI-LLM AI MENTOR
          </div>
          <h1 className="text-3xl font-bold font-display text-zinc-950 mt-2">
            {zh ? "AI 導師" : "AI Mentor"}
          </h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            {zh
              ? "統一多 LLM 介面（Gemini / OpenAI / Claude），提供外部資源探索與跨來源出題、智慧排程重排、頑固筆記診斷與題庫治理；所有筆記維持只讀，衍生資料僅存於 Mentorion SQLite。"
              : "Unified multi-LLM interface (Gemini / OpenAI / Claude) for resource discovery, cross-source quizzes, smart rescheduling, leech diagnosis, and Bloom curation — keeping all notes strictly read-only."}
          </p>
        </div>

        {/* LLM Provider Detection & Capability Switcher */}
        {llmStatus && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-zinc-700 flex items-center gap-2">
                {llmAvailable ? (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-zinc-900" />
                    <span>
                      {zh ? "目前啟用引擎：" : "Active LLM:"}{" "}
                      <strong className="text-zinc-950">
                        {llmStatus.active_provider_name}
                      </strong>{" "}
                      <span className="font-mono text-zinc-500">({llmStatus.active_model})</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Lock size={14} className="text-zinc-500" />
                    <span className="text-zinc-700">
                      {zh
                        ? "未偵測到任何 LLM API Key — 所有 AI 功能已鎖定"
                        : "No LLM API key detected — all AI features are locked"}
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {llmStatus.providers.map((p) => {
                  const isActive = llmStatus.active_provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!p.configured || switchingProvider || isActive}
                      onClick={() => void handleSwitchProvider(p.id)}
                      title={
                        p.configured
                          ? `${p.name} (${p.model})`
                          : zh
                            ? `未設定 ${p.name} API Key`
                            : `${p.name} API key not configured`
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        isActive
                          ? "bg-zinc-950 text-white border-zinc-950"
                          : p.configured
                            ? "bg-white text-zinc-800 border-zinc-300 hover:border-zinc-900 cursor-pointer"
                            : "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                      }`}
                    >
                      {!p.configured && <Lock size={10} />}
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {!llmAvailable && (
              <p className="text-xs text-zinc-500">
                {zh
                  ? "請在後端 .env 或環境變數設定 GEMINI_API_KEY、OPENAI_API_KEY 或 ANTHROPIC_API_KEY 後重啟後端（僅 Gemini 原生支援 Google Search 探索外部資源）。"
                  : "Set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY and restart backend (Gemini unlocks Google Search resource discovery)."}
              </p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-800">
          {error}
        </div>
      )}

      {/* 1. NotebookLM-Style Resource Discovery, Summarization & Cross-Source Quiz */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Globe size={18} className="text-zinc-900" />
              <h2 className="text-lg font-semibold text-zinc-950">
                {zh ? "外部資源探索與跨來源研究（NotebookLM 模式）" : "Resource Discovery & Cross-Source Research"}
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              {zh
                ? "讓 AI 導師依筆記或主題上網檢索權威連結、收藏至 SQLite、抓取摘要，並結合外部來源生成跨來源進階測驗題（絕不改寫原筆記）。"
                : "Discover verified external links via grounded web search, bookmark into SQLite, scrape & summarize, and generate cross-source quiz questions without modifying notes."}
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setResearchMode("note")}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                researchMode === "note" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {zh ? "依筆記探索" : "By Note"}
            </button>
            <button
              type="button"
              onClick={() => setResearchMode("topic")}
              className={`px-3 py-1.5 rounded-lg font-medium cursor-pointer transition-colors ${
                researchMode === "topic" ? "bg-zinc-950 text-white" : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              {zh ? "自由主題" : "By Topic"}
            </button>
          </div>
        </div>

        {/* Discovery lock banner if not Gemini or no API key */}
        {llmStatus && !canDiscoverResources && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-600">
            <Lock size={14} className="text-zinc-500 shrink-0" />
            <span>
              {llmStatus.lock_reasons.resource_discovery ||
                (zh
                  ? "探索外部資源功能已鎖定（需要 Gemini Provider 支援 Google Search Grounding）。"
                  : "Resource discovery is locked (requires Gemini provider with Google Search Grounding).")}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            {researchMode === "note" ? (
              <CustomSelect
                value={researchNoteId || (notes[0] ? String(notes[0].id) : "")}
                onChange={(val) => setResearchNoteId(val)}
                options={notes.map((n) => ({
                  value: String(n.id),
                  label: n.title,
                  description: n.category,
                }))}
              />
            ) : (
              <input
                type="text"
                value={researchTopic}
                onChange={(e) => setResearchTopic(e.target.value)}
                placeholder={zh ? "輸入想研究的主題（例如：FlashAttention）" : "Enter a topic (e.g. FlashAttention)"}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
              />
            )}
          </div>
          <div className="md:col-span-4">
            <input
              type="text"
              value={researchQuery}
              onChange={(e) => setResearchQuery(e.target.value)}
              placeholder={
                zh
                  ? "補充方向（選填：如找原始論文、實作教學）"
                  : "Optional focus (e.g. original paper, official docs)"
              }
              className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="button"
              disabled={
                !canDiscoverResources ||
                discovering ||
                (researchMode === "note" && !activeResearchNoteId) ||
                (researchMode === "topic" && !researchTopic.trim())
              }
              onClick={() => void handleDiscoverResources()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium cursor-pointer"
            >
              {discovering ? (
                <Loader2 size={15} className="animate-spin" />
              ) : !canDiscoverResources ? (
                <Lock size={14} />
              ) : (
                <Sparkles size={15} />
              )}
              <span>{zh ? "探索相關資源" : "Discover"}</span>
            </button>
          </div>
        </div>

        {/* Discovered Results */}
        {discoverySynthesis && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              {zh ? "AI 導師檢索綜述" : "RESEARCH SYNTHESIS"}
            </div>
            <p className="text-sm text-zinc-700 leading-relaxed">{discoverySynthesis}</p>

            {discoveredItems.length > 0 && (
              <div className="space-y-2 pt-1">
                {discoveredItems.map((item) => {
                  const alreadySaved = savedUrls.has(item.url);
                  const badge = SOURCE_TYPE_LABELS[item.source_type] || SOURCE_TYPE_LABELS.web;
                  return (
                    <div
                      key={item.url}
                      className="rounded-xl border border-zinc-200 bg-white p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-[10px] font-mono uppercase text-zinc-600">
                            {zh ? badge.zh : badge.en}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-zinc-950 hover:underline inline-flex items-center gap-1 break-all"
                          >
                            <span>{item.title}</span>
                            <ExternalLink size={12} className="shrink-0 text-zinc-400" />
                          </a>
                        </div>
                        {item.relevance_note && (
                          <p className="text-xs text-zinc-600 leading-relaxed">{item.relevance_note}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={alreadySaved || savingUrl === item.url}
                        onClick={() => void handleBookmarkResource(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white hover:border-zinc-950 disabled:opacity-50 text-xs font-medium text-zinc-900 shrink-0 cursor-pointer"
                      >
                        {savingUrl === item.url ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : alreadySaved ? (
                          <Check size={12} />
                        ) : (
                          <Bookmark size={12} />
                        )}
                        <span>{alreadySaved ? (zh ? "已收藏" : "Saved") : zh ? "收藏" : "Save"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Saved Resources (SQLite) + Scrape & Summarize + Cross-Source Quiz */}
        <div className="pt-2 border-t border-zinc-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <BookOpen size={14} className="text-zinc-500" />
              <span>
                {zh
                  ? `已收藏參考資源（${savedResources.length}）`
                  : `Saved Reference Sources (${savedResources.length})`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setManualOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:border-zinc-900 text-xs font-medium text-zinc-700 cursor-pointer"
              >
                <Plus size={12} />
                <span>{zh ? "手動貼上連結" : "Add Link"}</span>
              </button>

              {researchMode === "note" && activeResearchNoteId && savedResources.length > 0 && (
                <button
                  type="button"
                  disabled={!canGenerateQuiz || generatingCrossQuiz}
                  onClick={() => void handleGenerateCrossSourceQuiz()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer"
                >
                  {generatingCrossQuiz ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : !canGenerateQuiz ? (
                    <Lock size={12} />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  <span>
                    {zh
                      ? selectedResourceIds.length > 0
                        ? `結合所選 ${selectedResourceIds.length} 個來源出進階題`
                        : "結合已收藏來源出進階題"
                      : "Generate Cross-Source Quiz"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {manualOpen && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder={zh ? "資源標題" : "Resource title"}
                className="sm:col-span-4 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
              />
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://..."
                className="sm:col-span-4 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
              />
              <input
                type="text"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder={zh ? "備註（選填）" : "Note (optional)"}
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-zinc-200 bg-white text-xs"
              />
              <button
                type="button"
                disabled={!manualTitle.trim() || !manualUrl.trim()}
                onClick={() => void handleManualSaveResource()}
                className="sm:col-span-2 px-3 py-2 rounded-lg bg-zinc-950 text-white text-xs font-medium disabled:opacity-40 cursor-pointer"
              >
                {zh ? "儲存" : "Save"}
              </button>
            </div>
          )}

          {crossQuizNotice && (
            <div className="px-3.5 py-2.5 rounded-xl border border-zinc-900 bg-zinc-50 text-xs font-medium text-zinc-900">
              {crossQuizNotice}
            </div>
          )}

          {savedResources.length === 0 ? (
            <p className="text-xs text-zinc-400 py-2">
              {zh
                ? "尚無已收藏的外部資源。可由上方探索或手動貼上連結。"
                : "No saved external resources yet. Discover above or add a link manually."}
            </p>
          ) : (
            <div className="space-y-2.5">
              {savedResources.map((r) => {
                const isSelected = selectedResourceIds.includes(r.id);
                const badge = SOURCE_TYPE_LABELS[r.source_type] || SOURCE_TYPE_LABELS.web;
                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
                      isSelected ? "border-zinc-900 bg-zinc-50/70" : "border-zinc-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                        {researchMode === "note" && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectResource(r.id)}
                            className="mt-1 accent-zinc-950 cursor-pointer"
                          />
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-[10px] font-mono uppercase text-zinc-600">
                              {zh ? badge.zh : badge.en}
                            </span>
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-zinc-950 hover:underline inline-flex items-center gap-1 break-all"
                            >
                              <span>{r.title}</span>
                              <ExternalLink size={12} className="shrink-0 text-zinc-400" />
                            </a>
                          </div>
                          {r.relevance_note && (
                            <p className="text-xs text-zinc-500">{r.relevance_note}</p>
                          )}
                        </div>
                      </label>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={!canSummarize || summarizingId === r.id}
                          onClick={() => void handleSummarizeResource(r.id)}
                          title={
                            canSummarize
                              ? zh
                                ? "抓取網頁內容並用 LLM 生成重點摘要"
                                : "Scrape page and summarize with LLM"
                              : zh
                                ? "未偵測到 LLM API Key"
                                : "LLM API key required"
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:border-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-zinc-800 cursor-pointer"
                        >
                          {summarizingId === r.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : !canSummarize ? (
                            <Lock size={11} />
                          ) : (
                            <FileText size={12} />
                          )}
                          <span>{r.summary ? (zh ? "重新摘要" : "Re-summarize") : zh ? "抓取並摘要" : "Summarize"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteResource(r.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                          title={zh ? "刪除" : "Delete"}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {r.summary && (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                        {r.summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 2. Smart Rescheduler */}
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
            disabled={!canUseMentor}
            placeholder={
              zh
                ? "例如：把這兩天沒做完的複習分散到週末，難度高的優先排週六"
                : "e.g. Spread overdue reviews across this weekend, hardest notes on Saturday"
            }
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!canUseMentor || planning || !instruction.trim()}
            onClick={() => void handlePlanReschedule()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium cursor-pointer shrink-0"
          >
            {planning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : !canUseMentor ? (
              <Lock size={14} />
            ) : (
              <Sparkles size={15} />
            )}
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

      {/* 3. Weekly Study Health & Leech Diagnosis */}
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
            disabled={!canUseMentor || diagnosing}
            onClick={() => void handleWeeklyDiagnosis()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer"
          >
            {diagnosing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : !canUseMentor ? (
              <Lock size={13} />
            ) : (
              <Sparkles size={13} />
            )}
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

      {/* 4. Bloom's Taxonomy Question Audit */}
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
            disabled={!canUseMentor || auditing || notes.length === 0}
            onClick={() => void handleAuditQuestions()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium cursor-pointer shrink-0"
          >
            {auditing ? (
              <Loader2 size={15} className="animate-spin" />
            ) : !canUseMentor ? (
              <Lock size={14} />
            ) : (
              <Sparkles size={15} />
            )}
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

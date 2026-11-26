import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { MENTORION_COPY, type MentorionLang } from "../i18n";
import { CustomSelect } from "./CustomSelect";

interface SchemaPreset {
  name: string;
  label: string;
  description: string;
  filename_pattern: string;
  questions_sidecar: string;
}

interface PreviewDoc {
  source_doc_id: string;
  title: string;
  summary: string;
  category: string;
  review_status: string;
  rel_path: string;
}

interface FailedDoc {
  path: string;
  reason: string;
}

interface MissingNoteItem {
  note_id: number;
  title: string;
  source_doc_id?: string | null;
  file_path: string;
}

interface MissingSourceItem {
  source_id: number;
  name: string;
  source_dir: string;
  schema_name: string;
  reason: string;
}

interface SourceConfig {
  source_dir: string;
  schema_name: string;
}

const STORAGE_KEY = "mentorion-schema-config";

const DEFAULT_CONFIG: SourceConfig = {
  source_dir: "",
  schema_name: "nexus",
};

function loadConfig(): SourceConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SourceConfig>;
    return {
      source_dir: parsed.source_dir || DEFAULT_CONFIG.source_dir,
      schema_name: parsed.schema_name || DEFAULT_CONFIG.schema_name,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

interface SchemaSourcePanelProps {
  lang: MentorionLang;
  onImported: () => void;
}

export function SchemaSourcePanel({ lang, onImported }: SchemaSourcePanelProps) {
  const t = MENTORION_COPY[lang];
  const [config, setConfig] = useState<SourceConfig>(loadConfig);
  const [schemas, setSchemas] = useState<SchemaPreset[]>([
    {
      name: "nexus",
      label: "Nexus Document Bundle",
      description: "wiki/<Category>/<slug>/index.md + strict YAML frontmatter (id, title)",
      filename_pattern: "index.md",
      questions_sidecar: "questions.json",
    },
  ]);
  const [previewDocs, setPreviewDocs] = useState<PreviewDoc[] | null>(null);
  const [failedDocs, setFailedDocs] = useState<FailedDoc[]>([]);
  const [missingNotes, setMissingNotes] = useState<MissingNoteItem[]>([]);
  const [missingSources, setMissingSources] = useState<MissingSourceItem[]>([]);
  const [editPaths, setEditPaths] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runIntegrityCheck = async () => {
    try {
      const res = await fetch("/api/integrity/check");
      if (!res.ok) return;
      const data = await res.json();
      setMissingNotes(data.missing_notes || []);
      setMissingSources(data.missing_sources || []);
    } catch {
      // Ignore transient check failure
    }
  };

  useEffect(() => {
    fetch("/api/schemas")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.schemas?.length) setSchemas(data.schemas);
      })
      .catch(() => {});
    void runIntegrityCheck();
  }, []);

  const updateField = <K extends keyof SourceConfig>(key: K, val: SourceConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: val };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const activeSchema = schemas.find((s) => s.name === config.schema_name) ?? schemas[0];

  const handlePreview = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/schema-sync/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, only_fresh: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Preview failed");
      setPreviewDocs(data.documents || []);
      setFailedDocs(data.failed || []);
      setMessage(
        lang === "zh-Hant"
          ? `驗證完成：${data.count} 篇通過、${data.failed_count || 0} 篇不符合 Schema`
          : `Validated: ${data.count} passed, ${data.failed_count || 0} failed schema check`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/schema-sync/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, only_fresh: false, create_tasks: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed");
      setFailedDocs(data.failed || []);
      setMessage(
        lang === "zh-Hant"
          ? `已匯入筆記庫：新增 ${data.created} 篇、更新 ${data.updated} 篇（${data.failed_count || 0} 篇失敗未匯入）`
          : `Imported into Library: ${data.created} created, ${data.updated} updated (${data.failed_count || 0} skipped due to schema mismatch)`,
      );
      onImported();
      void runIntegrityCheck();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMissingNote = async (noteId: number) => {
    await fetch(`/api/library/notes/${noteId}`, { method: "DELETE" });
    onImported();
    void runIntegrityCheck();
  };

  const handleUpdateMissingPath = async (noteId: number) => {
    const nextPath = (editPaths[noteId] || "").trim();
    if (!nextPath) return;
    setError(null);
    const res = await fetch(`/api/library/notes/${noteId}/path`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_path: nextPath }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail || "Failed to update path");
      return;
    }
    onImported();
    void runIntegrityCheck();
  };

  const handlePickPath = async (mode: "folder" | "file") => {
    setError(null);
    try {
      const res = await fetch("/api/fs/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Path picker unavailable");
      if (!data.cancelled && data.path) {
        updateField("source_dir", data.path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div
        className="rounded-2xl p-10 space-y-7"
        style={{
          background: "var(--ed-bg-elevated)",
          border: "1px solid var(--ed-border-subtle)",
          color: "var(--ed-text-primary)",
        }}
      >
        <div
          className="flex items-start gap-4 pb-5"
          style={{ borderBottom: "1px solid var(--ed-border-subtle)" }}
        >
          <div className="p-3 rounded-xl bg-zinc-100 text-zinc-900">
            <Database size={22} />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-display text-zinc-950">
              {t.schemaTitle}
            </h2>
            <p className="text-sm mt-1.5 text-zinc-500 leading-relaxed">
              {t.schemaDesc}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-800">
                {t.schemaDirLabel}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={config.source_dir}
                  onChange={(e) => updateField("source_dir", e.target.value)}
                  placeholder="/Users/.../your-notes-folder or /Users/.../note.md"
                  className="flex-1 min-w-[220px] px-4 py-3 rounded-xl text-[15px] font-mono bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-zinc-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handlePickPath("folder")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-medium text-zinc-800 cursor-pointer shrink-0"
                  title={lang === "zh-Hant" ? "選取本機資料夾" : "Pick folder"}
                >
                  <FolderOpen size={15} />
                  <span>{lang === "zh-Hant" ? "選資料夾" : "Folder"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handlePickPath("file")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-medium text-zinc-800 cursor-pointer shrink-0"
                  title={lang === "zh-Hant" ? "選取單一檔案" : "Pick file"}
                >
                  <FileText size={15} />
                  <span>{lang === "zh-Hant" ? "選檔案" : "File"}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-zinc-800">
                {lang === "zh-Hant" ? "套用 Schema" : "Schema"}
              </label>
              <CustomSelect
                value={config.schema_name}
                onChange={(val) => updateField("schema_name", val)}
                options={schemas.map((s) => ({
                  value: s.name,
                  label: s.label,
                }))}
              />
            </div>
          </div>

          {activeSchema && (
            <div className="px-4 py-3.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-600 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{activeSchema.description}</span>
              <span className="font-mono text-zinc-400">
                pattern: {activeSchema.filename_pattern}
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-3.5 pt-2">
            <button
              onClick={() => void handlePreview()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-200 transition-colors cursor-pointer"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
              <span>{t.schemaPreview}</span>
            </button>

            <button
              onClick={() => void handleImport()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-zinc-950 hover:bg-zinc-800 text-white transition-colors cursor-pointer"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              <span>{t.schemaImport}</span>
            </button>
          </div>

          {message && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-zinc-100 text-zinc-900">
              <CheckCircle2 size={16} />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium bg-zinc-100 border border-zinc-400 text-zinc-900">
              {error}
            </div>
          )}

          {/* Schema Validation Failure Report */}
          {failedDocs.length > 0 && (
            <div className="rounded-xl border border-zinc-400 bg-zinc-50 p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
                <AlertTriangle size={16} />
                <span>
                  {lang === "zh-Hant"
                    ? `以下 ${failedDocs.length} 個檔案不符合所選 Schema，已略過讀取：`
                    : `${failedDocs.length} file(s) failed schema validation and were skipped:`}
                </span>
              </div>
              <div className="space-y-2">
                {failedDocs.map((f, i) => (
                  <div
                    key={i}
                    className="px-3.5 py-2.5 rounded-lg bg-white border border-zinc-200 text-xs space-y-0.5"
                  >
                    <div className="font-mono font-semibold text-zinc-900 break-all">
                      {f.path}
                    </div>
                    <div className="text-zinc-500">{f.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewDocs && previewDocs.length > 0 && (
            <div className="space-y-2.5 pt-2">
              {previewDocs.map((doc) => (
                <div
                  key={doc.source_doc_id}
                  className="px-4 py-3.5 rounded-xl flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-950 truncate">{doc.title}</div>
                    <div className="text-xs font-mono text-zinc-500 truncate mt-0.5">
                      {doc.source_doc_id} · {doc.category} · {doc.rel_path}
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium shrink-0 bg-zinc-200/80 text-zinc-800">
                    {doc.review_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Path Integrity Check Panel */}
      {(missingNotes.length > 0 || missingSources.length > 0) && (
        <div className="rounded-2xl border border-zinc-300 bg-white p-8 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-zinc-900" />
              <h3 className="text-base font-bold text-zinc-950">
                {lang === "zh-Hant"
                  ? "偵測到失效路徑（檔案或 Schema 已不存在）"
                  : "Missing File or Schema Paths Detected"}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void runIntegrityCheck()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>{lang === "zh-Hant" ? "重新檢查" : "Recheck"}</span>
            </button>
          </div>

          {missingNotes.map((item) => (
            <div
              key={item.note_id}
              className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3"
            >
              <div>
                <div className="text-sm font-semibold text-zinc-950">{item.title}</div>
                <div className="text-xs font-mono text-zinc-500 break-all mt-0.5">
                  Missing: {item.file_path}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={editPaths[item.note_id] ?? item.file_path}
                  onChange={(e) =>
                    setEditPaths((prev) => ({ ...prev, [item.note_id]: e.target.value }))
                  }
                  className="flex-1 min-w-[220px] px-3 py-2 rounded-lg text-xs font-mono bg-white border border-zinc-200 focus:border-zinc-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleUpdateMissingPath(item.note_id)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
                >
                  {lang === "zh-Hant" ? "更新路徑" : "Update Path"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteMissingNote(item.note_id)}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>{lang === "zh-Hant" ? "刪除筆記" : "Delete"}</span>
                </button>
              </div>
            </div>
          ))}

          {missingSources.map((src) => (
            <div
              key={src.source_id}
              className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-3"
            >
              <div className="text-xs space-y-0.5">
                <div className="font-semibold text-zinc-900">{src.name}</div>
                <div className="font-mono text-zinc-500">{src.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

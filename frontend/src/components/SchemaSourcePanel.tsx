import { useEffect, useState } from "react";
import { CheckCircle2, Database, Download, Eye, Loader2 } from "lucide-react";
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

interface SourceConfig {
  source_dir: string;
  schema_name: string;
  only_fresh: boolean;
}

const STORAGE_KEY = "mentorion-schema-config";

const DEFAULT_CONFIG: SourceConfig = {
  source_dir: "../Nexus-Vault",
  schema_name: "nexus",
  only_fresh: true,
};

function loadConfig(): SourceConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<SourceConfig>;
    return {
      source_dir: parsed.source_dir || DEFAULT_CONFIG.source_dir,
      schema_name: parsed.schema_name || DEFAULT_CONFIG.schema_name,
      only_fresh: parsed.only_fresh ?? DEFAULT_CONFIG.only_fresh,
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
      description: "wiki/<Category>/<slug>/index.md + optional questions.json",
      filename_pattern: "index.md",
      questions_sidecar: "questions.json",
    },
  ]);
  const [previewDocs, setPreviewDocs] = useState<PreviewDoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/schemas")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.schemas?.length) setSchemas(data.schemas);
      })
      .catch(() => {});
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
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Preview failed");
      setPreviewDocs(data.documents || []);
      setMessage(
        lang === "zh-Hant"
          ? `找到 ${data.count} 篇符合 ${activeSchema?.label ?? config.schema_name} 的筆記`
          : `Found ${data.count} notes matching ${activeSchema?.label ?? config.schema_name}`,
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
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed");
      setMessage(
        lang === "zh-Hant"
          ? `同步完成：新增 ${data.created} 篇、更新 ${data.updated} 篇（共 ${data.total} 篇）`
          : `Synced: ${data.created} created, ${data.updated} updated (${data.total} total)`,
      );
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="max-w-5xl mx-auto rounded-2xl p-10 space-y-7"
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
            {lang === "zh-Hant"
              ? "每個筆記資料夾路徑對應一份 Mentorion/schemas/*.json 定義檔。若需新增自訂格式，請參考 docs/custom-schema-guide.md。"
              : "Pair each Markdown folder path with a schema file from Mentorion/schemas/*.json. See docs/custom-schema-guide.md to add your own."}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-800">
              {t.schemaDirLabel}
            </label>
            <input
              type="text"
              value={config.source_dir}
              onChange={(e) => updateField("source_dir", e.target.value)}
              placeholder="../Nexus-Vault"
              className="w-full px-4 py-3 rounded-xl text-[15px] font-mono bg-zinc-50 border border-zinc-200 focus:bg-white focus:border-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-800">
              {lang === "zh-Hant" ? "套用 Schema (schemas/)" : "Schema (schemas/)"}
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
              pattern: {activeSchema.filename_pattern} · quiz: {activeSchema.questions_sidecar}
            </span>
          </div>
        )}

        <label className="inline-flex items-center gap-2.5 text-sm text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            checked={config.only_fresh}
            onChange={(e) => updateField("only_fresh", e.target.checked)}
            className="w-4 h-4 accent-zinc-950"
          />
          <span>{t.schemaOnlyFresh}</span>
        </label>

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
          <div className="px-4 py-3 rounded-xl text-sm font-medium bg-zinc-100 border border-zinc-300 text-zinc-800">
            {error}
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
  );
}

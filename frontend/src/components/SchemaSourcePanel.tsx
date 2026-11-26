import { useState } from "react";
import { CheckCircle2, Database, Download, Eye, Loader2 } from "lucide-react";
import { MENTORION_COPY, type MentorionLang } from "../i18n";

interface PreviewDoc {
  source_doc_id: string;
  title: string;
  summary: string;
  category: string;
  review_status: string;
  rel_path: string;
}

interface SchemaConfig {
  source_dir: string;
  id_field: string;
  title_field: string;
  summary_field: string;
  category_field: string;
  review_field: string;
  filename_pattern: string;
  only_fresh: boolean;
}

const STORAGE_KEY = "mentorion-schema-config";

const DEFAULT_CONFIG: SchemaConfig = {
  source_dir: "../Nexus-Vault",
  id_field: "id",
  title_field: "title",
  summary_field: "summary",
  category_field: "category",
  review_field: "review",
  filename_pattern: "index.md",
  only_fresh: true,
};

function loadConfig(): SchemaConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
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
  const [config, setConfig] = useState<SchemaConfig>(loadConfig);
  const [previewDocs, setPreviewDocs] = useState<PreviewDoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateField = <K extends keyof SchemaConfig>(key: K, val: SchemaConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: val };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

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
      if (!res.ok) throw new Error(data.detail || "預覽失敗");
      setPreviewDocs(data.documents || []);
      setMessage(`找到 ${data.count} 篇符合 Schema 的筆記`);
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
      if (!res.ok) throw new Error(data.detail || "匯入失敗");
      setMessage(
        `同步完成：新增 ${data.created} 篇、更新 ${data.updated} 篇（共 ${data.total} 篇）`,
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
            {t.schemaDesc}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold mb-2 text-zinc-800">
            {t.schemaDirLabel}
          </label>
          <input
            type="text"
            value={config.source_dir}
            onChange={(e) => updateField("source_dir", e.target.value)}
            placeholder="../Nexus-Vault"
            className="w-full px-4 py-3 rounded-xl text-[15px] font-mono bg-zinc-50 border border-zinc-200 focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(
            [
              ["id_field", t.schemaIdField],
              ["title_field", t.schemaTitleField],
              ["summary_field", t.schemaSummaryField],
              ["category_field", t.schemaCategoryField],
              ["review_field", t.schemaReviewField],
              ["filename_pattern", t.schemaFilenameField],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-semibold mb-1.5 text-zinc-500">
                {label}
              </label>
              <input
                type="text"
                value={config[key]}
                onChange={(e) => updateField(key, e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono bg-zinc-50 border border-zinc-200 focus:border-zinc-900 focus:outline-none"
              />
            </div>
          ))}
        </div>

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
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium"
            style={{ background: "var(--ed-doc-soft)", color: "var(--ed-doc-color)" }}
          >
            <CheckCircle2 size={15} />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div
            className="px-4 py-3 rounded-xl text-xs font-medium"
            style={{ background: "var(--ed-accent-soft)", color: "var(--ed-accent)" }}
          >
            {error}
          </div>
        )}

        {previewDocs && previewDocs.length > 0 && (
          <div className="space-y-2 pt-2">
            {previewDocs.map((doc) => (
              <div
                key={doc.source_doc_id}
                className="px-4 py-3 rounded-xl flex items-center justify-between gap-3"
                style={{
                  background: "var(--ed-bg-page)",
                  border: "1px solid var(--ed-border-subtle)",
                }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{doc.title}</div>
                  <div
                    className="text-[11px] font-mono truncate"
                    style={{ color: "var(--ed-text-muted)" }}
                  >
                    {doc.source_doc_id} · {doc.category} · {doc.rel_path}
                  </div>
                </div>
                <span
                  className="text-[11px] px-2.5 py-0.5 rounded-full font-medium shrink-0"
                  style={{
                    background:
                      doc.review_status === "reviewed"
                        ? "var(--ed-doc-soft)"
                        : "var(--ed-accent-soft)",
                    color:
                      doc.review_status === "reviewed"
                        ? "var(--ed-doc-color)"
                        : "var(--ed-accent)",
                  }}
                >
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

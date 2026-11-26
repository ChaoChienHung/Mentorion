import { useState } from "react";
import { CheckCircle2, Database, Download, Eye, Loader2 } from "lucide-react";

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
  onImported: () => void;
}

export function SchemaSourcePanel({ onImported }: SchemaSourcePanelProps) {
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
      className="max-w-3xl mx-auto rounded-2xl p-8 space-y-6"
      style={{
        background: "var(--ed-bg-elevated)",
        border: "1px solid var(--ed-border-subtle)",
        color: "var(--ed-text-primary)",
      }}
    >
      <div
        className="flex items-start gap-3 pb-4"
        style={{ borderBottom: "1px solid var(--ed-border-subtle)" }}
      >
        <div
          className="p-2.5 rounded-xl"
          style={{ background: "var(--ed-accent-soft)", color: "var(--ed-accent)" }}
        >
          <Database size={20} />
        </div>
        <div>
          <h2
            className="text-xl font-bold"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            自訂 Schema 資料來源
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--ed-text-secondary)" }}>
            指向任何 Markdown 筆記資料夾（支援 Nexus-Vault 或其他知識庫），自訂 frontmatter 欄位對映即可自動匯入排程與出題。
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold mb-1.5">
            筆記資料夾路徑 (Source Directory)
          </label>
          <input
            type="text"
            value={config.source_dir}
            onChange={(e) => updateField("source_dir", e.target.value)}
            placeholder="../Nexus-Vault 或 ~/Documents/notes"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono"
            style={{
              background: "var(--ed-bg-page)",
              border: "1px solid var(--ed-border-subtle)",
            }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(
            [
              ["id_field", "ID 欄位"],
              ["title_field", "標題欄位"],
              ["summary_field", "摘要欄位"],
              ["category_field", "分類欄位"],
              ["review_field", "複習狀態欄位"],
              ["filename_pattern", "檔名模式 (index.md / *.md)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label
                className="block text-[11px] font-semibold mb-1"
                style={{ color: "var(--ed-text-secondary)" }}
              >
                {label}
              </label>
              <input
                type="text"
                value={config[key]}
                onChange={(e) => updateField(key, e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs font-mono"
                style={{
                  background: "var(--ed-bg-page)",
                  border: "1px solid var(--ed-border-subtle)",
                }}
              />
            </div>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={config.only_fresh}
            onChange={(e) => updateField("only_fresh", e.target.checked)}
          />
          <span>只同步尚未複習（fresh）的筆記</span>
        </label>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={() => void handlePreview()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
            style={{
              background: "var(--ed-bg-surface)",
              color: "var(--ed-text-primary)",
              border: "1px solid var(--ed-border-subtle)",
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            <span>預覽符合筆記</span>
          </button>

          <button
            onClick={() => void handleImport()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
            style={{
              background: "var(--ed-text-primary)",
              color: "var(--ed-bg-page)",
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>匯入至 Mentorion 排程</span>
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

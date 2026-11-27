import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";
import { MENTORION_COPY, MENTORION_LANGUAGES, type MentorionLang } from "../i18n";
import { CustomSelect } from "./CustomSelect";

interface SettingsModalProps {
  open: boolean;
  lang: MentorionLang;
  onChangeLang: (lang: MentorionLang) => void;
  onLlmStatusChanged?: () => void;
  onClose: () => void;
}

interface ProviderStatusItem {
  id: string;
  name: string;
  configured: boolean;
  model: string;
}

export function SettingsModal({
  open,
  lang,
  onChangeLang,
  onLlmStatusChanged,
  onClose,
}: SettingsModalProps) {
  const zh = lang === "zh-Hant";
  const [provider, setProvider] = useState<string>("gemini");
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    setError(null);
    setApiKey("");
    setShowKey(false);
    fetch("/api/llm/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setProviders(data.providers || []);
        setActiveProvider(data.active_provider || null);
        if (data.active_provider) {
          setProvider(data.active_provider);
        }
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;
  const t = MENTORION_COPY[lang];

  const providerOptions = [
    {
      value: "gemini",
      label: "Google Gemini",
      description: providers.find((p) => p.id === "gemini")?.configured
        ? zh
          ? "已設定 · 支援探索外部資源"
          : "Configured · Web Search"
        : zh
          ? "支援出題與 Google Search 探索"
          : "Quiz + Google Search",
    },
    {
      value: "openai",
      label: "OpenAI (GPT / Codex)",
      description: providers.find((p) => p.id === "openai")?.configured
        ? zh
          ? "已設定"
          : "Configured"
        : "GPT-4o / Codex",
    },
    {
      value: "anthropic",
      label: "Anthropic Claude",
      description: providers.find((p) => p.id === "anthropic")?.configured
        ? zh
          ? "已設定"
          : "Configured"
        : "Claude 3.5 / 3.7",
    },
  ];

  const selectedMeta = providers.find((p) => p.id === provider);

  const handleSaveKey = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/llm/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || (zh ? "儲存失敗" : "Failed to save API key"));
      setProviders(data.providers || []);
      setActiveProvider(data.active_provider || null);
      setApiKey("");
      setShowKey(false);
      setNotice(
        apiKey.trim()
          ? zh
            ? `已儲存並啟用 ${providerOptions.find((o) => o.value === provider)?.label}`
            : `Saved and activated ${providerOptions.find((o) => o.value === provider)?.label}`
          : zh
            ? "已清除該 API Key"
            : "API key cleared",
      );
      onLlmStatusChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-950 font-display">
            {t.settings}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Language */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[15px] font-medium text-zinc-950">{t.language}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{t.languageHint}</div>
            </div>
            <div className="w-44 shrink-0">
              <CustomSelect
                value={lang}
                onChange={(val) => onChangeLang(val as MentorionLang)}
                options={MENTORION_LANGUAGES}
              />
            </div>
          </div>

          <div className="border-t border-zinc-200" />

          {/* LLM API Key Configuration */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound size={16} className="text-zinc-900" />
                <div className="text-[15px] font-medium text-zinc-950">
                  {zh ? "LLM API Key 設定" : "LLM API Key"}
                </div>
              </div>
              {activeProvider && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-700">
                  {zh ? "啟用中" : "Active"}: {activeProvider}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {zh
                ? "選擇模型供應商並輸入 API Key，將僅儲存於本機 .env.local（不會提交至 Git），儲存後立即解鎖 AI 導師與 AI 出題。"
                : "Select a provider and enter your API key. Saved locally to gitignored .env.local and applied immediately."}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              <div className="sm:col-span-5">
                <CustomSelect
                  value={provider}
                  onChange={(val) => {
                    setProvider(val);
                    setNotice(null);
                    setError(null);
                  }}
                  options={providerOptions}
                />
              </div>

              <div className="sm:col-span-7 relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    selectedMeta?.configured
                      ? zh
                        ? "已設定（輸入新 Key 覆蓋，留空儲存可清除）"
                        : "Configured (enter new key to replace)"
                      : zh
                        ? "輸入 API Key..."
                        : "Enter API key..."
                  }
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-sm font-mono text-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? (zh ? "隱藏 API Key" : "Hide API Key") : zh ? "顯示 API Key" : "Show API Key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/60 transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="px-3.5 py-2 rounded-xl border border-zinc-300 bg-zinc-100 text-xs text-zinc-800">
                {error}
              </div>
            )}
            {notice && (
              <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-900 bg-zinc-50 text-xs font-medium text-zinc-900">
                <Check size={13} />
                <span>{notice}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving || (!apiKey.trim() && !selectedMeta?.configured)}
                onClick={() => void handleSaveKey()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium cursor-pointer transition-colors"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>{zh ? "儲存" : "Save"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { X } from "lucide-react";
import { MENTORION_COPY, MENTORION_LANGUAGES, type MentorionLang } from "../i18n";
import { CustomSelect } from "./CustomSelect";

interface SettingsModalProps {
  open: boolean;
  lang: MentorionLang;
  onChangeLang: (lang: MentorionLang) => void;
  onClose: () => void;
}

export function SettingsModal({
  open,
  lang,
  onChangeLang,
  onClose,
}: SettingsModalProps) {
  if (!open) return null;
  const t = MENTORION_COPY[lang];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-visible"
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

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[15px] font-medium text-zinc-950">{t.language}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{t.languageHint}</div>
            </div>
            <div className="w-40 shrink-0">
              <CustomSelect
                value={lang}
                onChange={(val) => onChangeLang(val as MentorionLang)}
                options={MENTORION_LANGUAGES}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from "react";
import { Note, Task, JournalEvent, StatsResponse, CategoryStat } from "./types";
import { useAuth } from "./context/AuthContext";
import { authApi } from "./api/auth";
import { EditorialReaderView } from "./components/EditorialReaderView";
import { SchemaSourcePanel } from "./components/SchemaSourcePanel";
import { CoachPanel } from "./components/CoachPanel";
import { QuizPanel } from "./components/QuizPanel";
import { CustomSelect } from "./components/CustomSelect";
import { SettingsModal } from "./components/SettingsModal";
import { MENTORION_COPY, type MentorionLang } from "./i18n";
import {
  Database,
  Settings,
  BookMarked, 
  Calendar as CalendarIcon, 
  BarChart3, 
  Plus, 
  X,
  Sparkles,
  Loader2,
  BrainCircuit,
  MessageSquare,
  Bookmark,
  CheckCircle2,
  Trash2,
  CalendarDays,
  PlusCircle,
  TrendingUp,
  AlertTriangle,
  FolderSync,
  Clock,
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Check,
  RotateCcw,
  BookOpen
} from "lucide-react";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, UserCredential } from "firebase/auth";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Load Firebase configuration
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);

export default function App() {
  const { token } = useAuth();

  // Custom fetch wrapper injecting Bearer token if present (local single-user mode by default)
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers } as any;
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  };

  // Sidebar tab state & language setting
  const [activeTab, setActiveTab] = useState<"cover" | "reading" | "calendar" | "add_task" | "stats" | "schema" | "coach" | "sync">("cover");
  const [lang, setLang] = useState<MentorionLang>(() =>
    localStorage.getItem("mentorion-lang") === "en" ? "en" : "zh-Hant",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = MENTORION_COPY[lang];

  const handleChangeLang = (next: MentorionLang) => {
    setLang(next);
    localStorage.setItem("mentorion-lang", next);
  };
  
  // Google API credential
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const [isSyncingGcal, setIsSyncingGcal] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState("");

  // Data State
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Calendar view parameters
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Modals / Detail Card Popups state
  const [activeRevisionCardTask, setActiveRevisionCardTask] = useState<Task | null>(null);
  const [revisionModalMode, setRevisionModalMode] = useState<"note" | "quiz">("note");
  const [revisionRating, setRevisionRating] = useState<number>(4);
  const [submittingRevision, setSubmittingRevision] = useState<boolean>(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingRating, setCompletingRating] = useState<number>(5);
  const [anchorOption, setAnchorOption] = useState<"A" | "B">("A");

  // Form State for scheduling a task from an existing Library note
  const [selectedLibraryNoteId, setSelectedLibraryNoteId] = useState<string>("");
  const [selectedNoteQuestionCount, setSelectedNoteQuestionCount] = useState<number | null>(null);
  const [checkingQuestions, setCheckingQuestions] = useState(false);
  const [generatingForTask, setGeneratingForTask] = useState(false);
  const [taskQuestionMsg, setTaskQuestionMsg] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskContent, setNewTaskContent] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("Other");
  const [newTaskType, setNewTaskType] = useState<"new" | "practice">("new");
  const [newTaskPattern, setNewTaskPattern] = useState<"A" | "B" | "C">("C");
  const [newTaskFirstDate, setNewTaskFirstDate] = useState(new Date().toISOString().split("T")[0]);
  const [newTaskIsAllDay, setNewTaskIsAllDay] = useState(true);
  const [newTaskStartTime, setNewTaskStartTime] = useState("09:00");
  const [newTaskEndTime, setNewTaskEndTime] = useState("10:00");
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Reassuring Mentor quotes
  const [activeTipIdx, setActiveTipIdx] = useState(0);
  const mentorTips = [
    "「複習黃金規律」：Pattern A ($2^n$) 與 Pattern B ($3^n$) 能預先將長期複習排定，而 Pattern C (SM-2) 能完美配合您的記憶熟悉度！",
    "「小步前進」：每日制定 5 點積分的新任務/練習，長期累積能發揮驚人的記憶複利效應。",
    "「主動召回」：點擊行事曆事件，檢視「複習資訊卡」即可迅速查閱該單元的學習足跡、難易度乘數(EF)與歷史紀錄！",
    "「軌跡移轉」：臨時有狀況？使用 Trajectory Shift 即可將該主題後續的所有複習日程整體向後平移！"
  ];

  // Check existing questions in SQLite + centralized questions.json whenever selected Library note changes in New Task
  useEffect(() => {
    if (activeTab !== "add_task" || notes.length === 0) return;
    const targetId = Number(selectedLibraryNoteId || notes[0]?.id);
    if (!targetId) return;
    let cancelled = false;
    setCheckingQuestions(true);
    setTaskQuestionMsg(null);
    authFetch("/api/quiz/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_id: targetId, generate_if_empty: false }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setSelectedNoteQuestionCount((data.questions || []).length);
        }
      })
      .catch(() => {
        if (!cancelled) setSelectedNoteQuestionCount(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingQuestions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedLibraryNoteId, notes]);

  // Cycle mentor tips
  useEffect(() => {
    const tipInterval = setInterval(() => {
      setActiveTipIdx((prev) => (prev + 1) % mentorTips.length);
    }, 10000);
    return () => clearInterval(tipInterval);
  }, []);

  // Fetch all V2 study & schedule data
  const fetchData = async () => {
    try {
      const [notesRes, tasksRes, eventsRes, statsRes] = await Promise.all([
        authFetch("/api/notes").then((r) => r.json()),
        authFetch("/api/tasks?hideArchived=1").then((r) => r.json()),
        authFetch("/api/events").then((r) => r.json()),
        authFetch("/api/stats").then((r) => r.json()),
      ]);

      if (Array.isArray(notesRes)) setNotes(notesRes);
      if (Array.isArray(tasksRes)) setTasks(tasksRes);
      if (Array.isArray(eventsRes)) setEvents(eventsRes);
      if (statsRes && !statsRes.error) setStats(statsRes);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Google Calendar OAuth & Sync ---
  const handleConnectGoogle = async () => {
    try {
      setSyncStatusMsg("正在開啟 Google 授權視窗...");
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/calendar");
      provider.addScope("https://www.googleapis.com/auth/calendar.events");
      
      const result: UserCredential = await signInWithPopup(firebaseAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (token) {
        setGoogleAccessToken(token);
        setGoogleUser(result.user);
        setSyncStatusMsg("Google 帳戶已成功連接，隨時可以同步月曆！");
        setActiveTab("sync");
      } else {
        setSyncStatusMsg("未能成功取得 Google 授權憑證。");
      }
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      setSyncStatusMsg(`授權失敗: ${error.message}`);
    }
  };

  // Export current schedule tasks directly to Google Calendar
  const handleExportToGcal = async () => {
    if (!googleAccessToken) {
      alert("請先連接您的 Google 帳戶！");
      return;
    }

    setIsSyncingGcal(true);
    setSyncStatusMsg("正在將您的學習與複習任務同步至 Google Calendar...");

    try {
      let successCount = 0;
      // Filter upcoming uncompleted tasks or all tasks
      const pendingTasks = tasks.filter(t => !t.is_completed);

      for (const t of pendingTasks) {
        const eventBody = {
          summary: `[複習] ${t.note_title}`,
          description: `Mentorion 間隔記憶複習\n分類：${t.note_category}\n學習類型：${t.note_type}\n複習模式：${t.note_pattern}\n難易度乘數(EF)：${t.ease_factor || 'N/A'}\n這是第 ${t.revision_number} 次複習任務。`,
          start: t.time_start 
            ? { dateTime: `${t.scheduled_date}T${t.time_start}:00`, timeZone: "Asia/Taipei" }
            : { date: t.scheduled_date },
          end: t.time_end
            ? { dateTime: `${t.scheduled_date}T${t.time_end}:00`, timeZone: "Asia/Taipei" }
            : { date: t.scheduled_date },
        };

        const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(eventBody)
        });

        if (res.ok) {
          const gcalEvent = await res.json();
          // Update task with Google event ID
          await authFetch(`/api/tasks/${t.id}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gcalEventId: gcalEvent.id })
          });
          successCount++;
        }
      }

      setSyncStatusMsg(`同步完成！已成功將 ${successCount} 個待辦複習任務匯出至 Google Calendar。`);
      await fetchData();
    } catch (err: any) {
      console.error("Gcal Export Error:", err);
      setSyncStatusMsg(`同步失敗: ${err.message}`);
    } finally {
      setIsSyncingGcal(false);
    }
  };

  // --- Study & Task Handlers ---

  // Create a new task (Note / Practice)
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle) return;

    setIsSubmittingTask(true);
    try {
      const body = {
        title: newTaskTitle,
        content: newTaskContent,
        category: newTaskCategory,
        type: newTaskType,
        pattern: newTaskPattern,
        first_date: newTaskFirstDate,
        time_start: newTaskIsAllDay ? null : newTaskStartTime,
        time_end: newTaskIsAllDay ? null : newTaskEndTime,
      };

      const res = await authFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setNewTaskTitle("");
        setNewTaskContent("");
        setNewTaskCategory("Other");
        setNewTaskType("new");
        setNewTaskPattern("C");
        setNewTaskIsAllDay(true);
        await fetchData();
        setActiveTab("calendar");
      }
    } catch (err) {
      console.error("Error creating task:", err);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Complete task
  const handleCompleteTask = async (task: Task) => {
    if (task.note_pattern === "C") {
      // Need SM-2 Rating popup
      setCompletingTask(task);
      setCompletingRating(5);
    } else {
      // Standard completion
      try {
        const res = await authFetch(`/api/tasks/${task.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anchorOption })
        });
        if (res.ok) {
          await fetchData();
        }
      } catch (err) {
        console.error("Error completing task:", err);
      }
    }
  };

  // Submit Rating for Pattern C / SM-2
  const handleRatingSubmit = async () => {
    if (!completingTask) return;
    try {
      const res = await authFetch(`/api/tasks/${completingTask.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: completingRating,
          anchorOption,
          actualDate: new Date().toISOString().split("T")[0]
        })
      });

      if (res.ok) {
        setCompletingTask(null);
        await fetchData();
      }
    } catch (err) {
      console.error("Error submitting rating:", err);
    }
  };

  // Uncomplete task
  const handleUncompleteTask = async (taskId: number) => {
    try {
      const res = await authFetch(`/api/tasks/${taskId}/uncomplete`, {
        method: "POST"
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Error uncompleting task:", err);
    }
  };

  // Trajectory Shift for all future tasks of a canonical note
  const handleTrajectoryShift = async (noteId: number, days: number) => {
    const actionStr = days > 0 ? `延後 ${days} 天` : `提前 ${Math.abs(days)} 天`;
    if (!confirm(`確定要將此主題後續的所有未完成複習任務日程 ${actionStr} 嗎？`)) return;

    try {
      const res = await authFetch("/api/tasks/shift-trajectory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, shiftDays: days })
      });

      if (res.ok) {
        alert("軌跡移轉成功！已更新未來所有複習排程。");
        // Update local detail card if open
        if (activeRevisionCardTask && activeRevisionCardTask.note_id === noteId) {
          setActiveRevisionCardTask(prev => {
            if (!prev) return null;
            const updatedDate = new Date(prev.scheduled_date + "T00:00:00");
            updatedDate.setDate(updatedDate.getDate() + days);
            return {
              ...prev,
              scheduled_date: updatedDate.toISOString().split("T")[0]
            };
          });
        }
        await fetchData();
      }
    } catch (err) {
      console.error("Error shifting trajectory:", err);
    }
  };

  // Manually tune a note's SM-2 Ease Factor (1.30 - 3.00)
  const handleUpdateEaseFactor = async (noteId: number, nextEf: number) => {
    const clamped = Math.max(1.3, Math.min(3.0, Math.round(nextEf * 100) / 100));
    setActiveRevisionCardTask((prev) =>
      prev && prev.note_id === noteId ? { ...prev, ease_factor: clamped } : prev,
    );
    try {
      const res = await authFetch(`/api/notes/${noteId}/ease-factor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ease_factor: clamped }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Error updating ease factor:", err);
    }
  };

  // Complete the active revision task from inside the Revision Card quiz flow (updates SM-2 & schedules single next review)
  const handleCompleteFromRevisionCard = async () => {
    if (!activeRevisionCardTask || submittingRevision) return;
    setSubmittingRevision(true);
    try {
      const res = await authFetch(`/api/tasks/${activeRevisionCardTask.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: revisionRating,
          anchorOption,
          actualDate: new Date().toISOString().split("T")[0],
        }),
      });
      if (res.ok) {
        setActiveRevisionCardTask(null);
        setRevisionModalMode("note");
        await fetchData();
      }
    } catch (err) {
      console.error("Error completing review from card:", err);
    } finally {
      setSubmittingRevision(false);
    }
  };

  // Delete ONLY a single scheduled review task (preserves the Note in Library & other tasks)
  const handleDeleteSingleTask = async (taskId: number) => {
    const msg =
      lang === "zh-Hant"
        ? "確定只刪除此筆複習排程嗎？（筆記庫原檔與其他排程皆會保留）"
        : "Remove only this scheduled review task? (The Library note and other scheduled tasks will be preserved.)";
    if (!confirm(msg)) return;
    try {
      const res = await authFetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || `Failed to delete task (${res.status})`);
        return;
      }
      setActiveRevisionCardTask(null);
      setRevisionModalMode("note");
      await fetchData();
    } catch (err) {
      console.error("Error deleting single task:", err);
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Delete note and all its tasks
  const handleDeleteNote = async (id: number) => {
    if (!confirm("警告！這將會永久刪除此筆記主題以及其在月曆上所有的複習計畫、歷史作答紀錄，此操作無法復原！確定要執行嗎？")) return;
    try {
      const res = await authFetch(`/api/notes/${id}`, { method: "DELETE" });
      if (res.ok) {
        setActiveRevisionCardTask(null);
        await fetchData();
      }
    } catch (err) {
      console.error("Error deleting note:", err);
    }
  };

  // Clear completed tasks from view list (hides completed but retains in statistics)
  const handleClearCompleted = async () => {
    try {
      const res = await authFetch("/api/tasks/clear-completed", {
        method: "POST"
      });
      if (res.ok) {
        alert("已清空當前視圖中的所有已完成任務，統計數據依然為您完美保存！");
        await fetchData();
      }
    } catch (err) {
      console.error("Error clearing completed:", err);
    }
  };

  // --- Calendar Date Generators ---
  const monthDays = useMemo(() => {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startIdx = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
    
    const days = [];
    // Previous month padding days
    const prevMonthLast = new Date(year, month, 0).getDate();
    for (let i = startIdx - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLast - i),
        isCurrentMonth: false,
      });
    }
    // Current month days
    const currentMonthLast = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= currentMonthLast; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    // Next month padding days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }
    return days;
  }, [currentCalendarDate]);

  // Map events to selected date
  const selectedDateTasks = useMemo(() => {
    return tasks.filter(t => t.scheduled_date === selectedDateStr);
  }, [tasks, selectedDateStr]);

  // Aggregate points completed vs scheduled for today (for deficit tracker)
  const todayPoints = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todayTasksList = tasks.filter(t => t.scheduled_date === todayStr);
    
    let scheduled = 0;
    let completed = 0;

    todayTasksList.forEach(t => {
      if (t.type === "new") {
        scheduled += 1.0;
        if (t.is_completed) completed += 1.0;
      } else if (t.type === "practice") {
        scheduled += 0.5;
        if (t.is_completed) completed += 0.5;
      }
    });

    return { scheduled, completed, percent: scheduled > 0 ? Math.round((completed / 5.0) * 100) : 0 };
  }, [tasks]);

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden bg-[#fafafa] text-[#111827] flex flex-col md:flex-row font-sans" id="applet-root">
      
      {/* LEFT SIDEBAR PANEL */}
      <aside className="w-full md:w-72 md:h-screen md:sticky md:top-0 z-50 bg-[#0e0f11] text-[#d4d4d8] flex flex-col shrink-0 border-r border-zinc-800/80" id="app-sidebar">
        {/* Brand header */}
        <div className="px-6 py-7 border-b border-zinc-800/80 flex items-center justify-between gap-2">
          <button
            onClick={() => setActiveTab("cover")}
            className="text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <img
                src="/favicon.svg"
                alt=""
                width={26}
                height={26}
                className="rounded-md ring-1 ring-white/20 shrink-0"
              />
              <h1 className="text-2xl font-bold text-white tracking-tight font-display group-hover:opacity-80 transition-opacity">
                Mentorion
              </h1>
            </div>
            <span className="text-xs text-zinc-400 tracking-wide block mt-1.5">
              {t.subtitle}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title={t.settings}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setActiveTab("cover")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "cover"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <Sparkles size={18} strokeWidth={1.75} />
            <span>{t.navOverview}</span>
          </button>

          <button
            onClick={() => setActiveTab("reading")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "reading"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <BookOpen size={18} strokeWidth={1.75} />
            <span>{t.navReading}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("calendar");
              setSelectedDateStr(new Date().toISOString().split("T")[0]);
            }}
            className={`w-full flex items-center justify-between px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "calendar"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <div className="flex items-center gap-3.5">
              <CalendarIcon size={18} strokeWidth={1.75} />
              <span>{t.navCalendar}</span>
            </div>
            {tasks.filter(t => !t.is_completed).length > 0 && (
              <span className={`text-xs font-mono ${activeTab === "calendar" ? "text-zinc-600" : "text-zinc-400"}`}>
                {tasks.filter(t => !t.is_completed).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("add_task")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "add_task"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <PlusCircle size={18} strokeWidth={1.75} />
            <span>{t.navNewTask}</span>
          </button>

          <button
            onClick={() => setActiveTab("stats")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "stats"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <BarChart3 size={18} strokeWidth={1.75} />
            <span>{t.navStats}</span>
          </button>

          <button
            onClick={() => setActiveTab("schema")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "schema"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <Database size={18} strokeWidth={1.75} />
            <span>{t.navSchema}</span>
          </button>

          <button
            onClick={() => setActiveTab("coach")}
            className={`w-full flex items-center gap-3.5 px-4 py-3 text-[15px] font-medium rounded-xl transition-colors text-left cursor-pointer ${
              activeTab === "coach"
                ? "bg-white text-zinc-950"
                : "text-zinc-400 hover:bg-white/6 hover:text-zinc-100"
            }`}
          >
            <Sparkles size={18} strokeWidth={1.75} />
            <span>{lang === "zh-Hant" ? "AI 教練" : "AI Coach"}</span>
          </button>

          <div className="pt-4 border-t border-zinc-800/80 my-4" />

          {/* Minimal Daily Target widget */}
          <div className="px-4 py-4 rounded-xl bg-zinc-900/75 border border-zinc-800/80 text-[13px] space-y-3">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="font-medium">{t.dailyTarget}</span>
              <span className="font-mono text-white font-semibold">{todayPoints.completed} / 5.0</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${Math.min(100, (todayPoints.completed / 5.0) * 100)}%` }}
              />
            </div>

            {stats && (
              <div className="pt-2.5 space-y-1.5 border-t border-zinc-800/80 font-mono text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>{t.deficit}</span>
                  <span className="text-zinc-200">{stats.deficitPoints} pts</span>
                </div>
                <div className="flex justify-between">
                  <span>{t.overdue}</span>
                  <span className="text-zinc-200">{stats.overdueCount}</span>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Sidebar Footer Google Calendar status */}
        <div className="p-5 border-t border-zinc-800/80 flex flex-col space-y-3">
          <div className="flex items-center justify-between text-[13px] text-zinc-400">
            <span>Google Calendar</span>
            <span className={googleAccessToken ? "text-white font-medium" : "text-zinc-500"}>
              {googleAccessToken ? t.gcalConnected : t.gcalOff}
            </span>
          </div>
          <button
            onClick={googleAccessToken ? () => setActiveTab("sync") : handleConnectGoogle}
            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 text-[13px] font-medium rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <FolderSync size={15} />
            <span>{googleAccessToken ? t.syncConsole : t.connectCalendar}</span>
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-hidden" id="app-workspace">
        {/* Dynamic Inner Tab container */}
        <div className="p-8 md:p-12 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-96 text-zinc-400">
              <Loader2 size={24} className="animate-spin mb-3" />
              <p className="text-xs tracking-wide">Loading Mentorion...</p>
            </div>
          ) : (
            <div>
              
              {/* --- VIEW 1: COVER / OVERVIEW (Nexus-Parity Full-Viewport Hero -> Stats -> Workspace) --- */}
              {activeTab === "cover" && (
                <div className="max-w-5xl mx-auto space-y-20 pb-20" id="view-cover">
                  {/* 00 · Full-Viewport Minimal Hero Cover */}
                  <section className="min-h-[78vh] flex flex-col items-center justify-center text-center relative border-b border-zinc-200">
                    <div className="text-[11px] font-mono uppercase tracking-[0.26em] text-zinc-400">
                      {t.heroKicker}
                    </div>
                    <h2 className="text-6xl md:text-7xl font-bold font-display tracking-tight text-zinc-950 mt-5">
                      Mentorion
                    </h2>
                    <p className="text-lg md:text-xl text-zinc-500 max-w-xl mt-5 leading-relaxed">
                      {t.heroDesc}
                    </p>
                    <div className="mt-8 flex items-center gap-4 text-xs font-mono text-zinc-400">
                      <span>{notes.length} {lang === "zh-Hant" ? "篇筆記" : "notes"}</span>
                      <span>·</span>
                      <span>{tasks.filter((tk) => !tk.is_completed).length} {lang === "zh-Hant" ? "項待複習" : "pending"}</span>
                    </div>
                    <div className="absolute bottom-8 text-zinc-300 text-xs font-mono tracking-widest uppercase">
                      ↓
                    </div>
                  </section>

                  {/* 01 · STATISTICS */}
                  <section className="space-y-6">
                    <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
                      01 · {lang === "zh-Hant" ? "數據統計" : "STATISTICS"}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      <div className="bg-white rounded-2xl p-6 border border-zinc-200 space-y-1.5">
                        <span className="text-xs text-zinc-500 font-medium block">
                          {lang === "zh-Hant" ? "筆記庫收錄" : "Library Notes"}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">
                          {notes.length}
                        </p>
                        <span className="text-xs text-zinc-400 block">
                          {lang === "zh-Hant" ? "可閱讀與出題的筆記" : "Indexed study notes"}
                        </span>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-zinc-200 space-y-1.5">
                        <span className="text-xs text-zinc-500 font-medium block">
                          {t.metricNew}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">
                          {stats?.totalCompletedNew || 0}
                        </p>
                        <span className="text-xs text-zinc-400 block">{t.metricNewSub}</span>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-zinc-200 space-y-1.5">
                        <span className="text-xs text-zinc-500 font-medium block">
                          {t.metricRev}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">
                          {stats?.totalCompletedRevision || 0}
                        </p>
                        <span className="text-xs text-zinc-400 block">{t.metricRevSub}</span>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-zinc-200 space-y-1.5">
                        <span className="text-xs text-zinc-500 font-medium block">
                          {t.metricDeficit}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">
                          {stats?.deficitPoints || 0} pts
                        </p>
                        <span className="text-xs text-zinc-400 block">{t.metricDeficitSub}</span>
                      </div>
                    </div>

                    {stats && stats.overdueCount > 0 && (
                      <div className="bg-zinc-100 border border-zinc-300 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-sm text-zinc-800">
                          <AlertTriangle size={18} className="text-zinc-900 shrink-0" />
                          <span>
                            {lang === "zh-Hant"
                              ? `目前有 ${stats.overdueCount} 項逾期複習任務尚未完成。`
                              : `${stats.overdueCount} scheduled review tasks are overdue.`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("calendar")}
                          className="text-xs font-semibold text-zinc-950 underline underline-offset-4 cursor-pointer"
                        >
                          {lang === "zh-Hant" ? "前往複習月曆 →" : "Open Calendar →"}
                        </button>
                      </div>
                    )}
                  </section>

                  {/* 02 · WORKSPACE OPTIONS */}
                  <section className="space-y-6">
                    <div className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">
                      02 · {lang === "zh-Hant" ? "工作區" : "WORKSPACE"}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      <button
                        type="button"
                        onClick={() => setActiveTab("reading")}
                        className="text-left p-6 rounded-2xl bg-white border border-zinc-200 hover:border-zinc-950 transition-colors cursor-pointer space-y-4 group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-zinc-950 group-hover:text-white text-zinc-900 flex items-center justify-center transition-colors">
                          <BookOpen size={19} strokeWidth={1.75} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-zinc-950">{t.navReading}</div>
                          <div className="text-xs text-zinc-500">
                            {lang === "zh-Hant" ? "瀏覽筆記清單與主動回憶測驗" : "Browse notes & run active recall"}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("calendar")}
                        className="text-left p-6 rounded-2xl bg-white border border-zinc-200 hover:border-zinc-950 transition-colors cursor-pointer space-y-4 group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-zinc-950 group-hover:text-white text-zinc-900 flex items-center justify-center transition-colors">
                          <CalendarIcon size={19} strokeWidth={1.75} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-zinc-950">{t.navCalendar}</div>
                          <div className="text-xs text-zinc-500">
                            {lang === "zh-Hant" ? "檢視每日排程與 SM-2 複習節奏" : "Daily schedule & SM-2 cadence"}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("coach")}
                        className="text-left p-6 rounded-2xl bg-white border border-zinc-200 hover:border-zinc-950 transition-colors cursor-pointer space-y-4 group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-zinc-950 group-hover:text-white text-zinc-900 flex items-center justify-center transition-colors">
                          <Sparkles size={19} strokeWidth={1.75} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-zinc-950">
                            {lang === "zh-Hant" ? "AI 教練" : "AI Coach"}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {lang === "zh-Hant" ? "智慧重排、頑固筆記診斷與題庫治理" : "Rescheduler, diagnosis & Bloom audit"}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("schema")}
                        className="text-left p-6 rounded-2xl bg-white border border-zinc-200 hover:border-zinc-950 transition-colors cursor-pointer space-y-4 group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-zinc-950 group-hover:text-white text-zinc-900 flex items-center justify-center transition-colors">
                          <Database size={19} strokeWidth={1.75} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-base font-semibold text-zinc-950">{t.navSchema}</div>
                          <div className="text-xs text-zinc-500">
                            {lang === "zh-Hant" ? "從單檔或資料夾匯入與路徑檢查" : "Import files/folders & path checks"}
                          </div>
                        </div>
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {/* --- VIEW 2: CALENDAR --- */}
              {activeTab === "calendar" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left" id="view-calendar">
                  
                  {/* Left Column Calendar Grid */}
                  <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
                    {/* Header Controls */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl">
                          <CalendarIcon size={20} className="animate-pulse" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm font-display">
                            {currentCalendarDate.toLocaleString("zh-TW", { year: "numeric", month: "long" })}
                          </h3>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                            Interactive Review Schedule
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => {
                            const newDate = new Date(currentCalendarDate);
                            newDate.setMonth(newDate.getMonth() - 1);
                            setCurrentCalendarDate(newDate);
                          }}
                          className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg transition-all text-slate-500"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          onClick={() => {
                            const today = new Date();
                            setCurrentCalendarDate(today);
                            setSelectedDateStr(today.toISOString().split("T")[0]);
                          }}
                          className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all text-slate-600"
                        >
                          今天
                        </button>
                        <button
                          onClick={() => {
                            const newDate = new Date(currentCalendarDate);
                            newDate.setMonth(newDate.getMonth() + 1);
                            setCurrentCalendarDate(newDate);
                          }}
                          className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg transition-all text-slate-500"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Weekday labels */}
                    <div className="grid grid-cols-7 gap-2 text-center font-semibold text-sm text-zinc-500">
                      {["日", "一", "二", "三", "四", "五", "六"].map((day, idx) => (
                        <div key={idx} className={idx === 0 || idx === 6 ? "text-zinc-900" : ""}>
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Day cells */}
                    <div className="grid grid-cols-7 gap-2.5">
                      {monthDays.map(({ date, isCurrentMonth }, idx) => {
                        const dateStr = date.toISOString().split("T")[0];
                        const dateTasks = tasks.filter(t => t.scheduled_date === dateStr);
                        const isSelected = selectedDateStr === dateStr;
                        const isToday = dateStr === new Date().toISOString().split("T")[0];
                        
                        // Check Daily Target achieved
                        let dayPointsVal = 0;
                        dateTasks.forEach(t => {
                          if (t.is_completed) {
                            if (t.type === "new") dayPointsVal += 1.0;
                            else if (t.type === "practice") dayPointsVal += 0.5;
                          }
                        });

                        const goalMet = dayPointsVal >= 5.0;
                        const hasTasks = dateTasks.length > 0;

                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedDateStr(dateStr)}
                            className={`min-h-[96px] p-2.5 rounded-2xl border flex flex-col justify-between text-left transition-all cursor-pointer ${
                              isSelected
                                ? "border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950"
                                : "border-zinc-200/80 hover:border-zinc-400 hover:bg-zinc-50"
                            } ${isCurrentMonth ? "bg-white text-zinc-900" : "bg-zinc-50/70 text-zinc-300"}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`text-sm font-semibold px-2 py-0.5 rounded-full font-mono ${
                                isToday 
                                  ? "bg-zinc-950 text-white" 
                                  : isSelected 
                                  ? "text-zinc-950 font-bold" 
                                  : "text-zinc-700"
                              }`}>
                                {date.getDate()}
                              </span>
                              
                              {/* Goal achievement indicators */}
                              {hasTasks && (
                                <span className={`w-2 h-2 rounded-full ${goalMet ? "bg-zinc-950" : "bg-zinc-400"}`}></span>
                              )}
                            </div>

                            {/* Cell task brief summary indicators */}
                            <div className="mt-1.5 space-y-1 text-xs font-medium">
                              {dateTasks.slice(0, 2).map((t, tid) => (
                                <div 
                                  key={tid} 
                                  className={`px-1.5 py-0.5 rounded truncate border ${
                                    t.is_completed
                                      ? "bg-zinc-100 text-zinc-400 border-zinc-200 line-through"
                                      : "bg-zinc-100 text-zinc-900 border-zinc-200"
                                  }`}
                                >
                                  {t.note_title}
                                </div>
                              ))}
                              {dateTasks.length > 2 && (
                                <div className="text-[11px] text-zinc-400 text-center font-medium">
                                  + {dateTasks.length - 2}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Daily Schedule Details & Complete checklist */}
                  <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-zinc-200 p-7 space-y-5">
                      <div className="flex justify-between items-center border-b border-zinc-200 pb-4">
                        <div>
                          <h4 className="font-bold text-zinc-950 text-base">
                            {selectedDateStr} 排程任務
                          </h4>
                          <span className="text-xs text-zinc-500">
                            該日共有 {selectedDateTasks.length} 個排定項目
                          </span>
                        </div>
                        
                        <button
                          onClick={handleClearCompleted}
                          className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                        >
                          清除已完成
                        </button>
                      </div>

                      {/* Daily schedule items list */}
                      <div className="space-y-3 max-h-[420px] overflow-y-auto">
                        {selectedDateTasks.length > 0 ? (
                          selectedDateTasks.map((t) => (
                            <div 
                              key={t.id} 
                              className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                                t.is_completed 
                                  ? "bg-zinc-50 border-zinc-200/70" 
                                  : "bg-white border-zinc-200 hover:border-zinc-400"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div 
                                  onClick={() => setActiveRevisionCardTask(t)}
                                  className="space-y-1.5 flex-1 cursor-pointer"
                                >
                                  <div className="flex items-center space-x-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase bg-zinc-100 text-zinc-800">
                                      {t.type === "new" ? "New" : t.type === "practice" ? "Practice" : `Revision #${t.revision_number}`}
                                    </span>
                                    <span className="text-xs text-zinc-500 font-medium">
                                      {t.note_category}
                                    </span>
                                  </div>
                                  <h5 className={`font-semibold text-zinc-950 text-sm truncate ${t.is_completed ? "line-through text-zinc-400" : ""}`}>
                                    {t.note_title}
                                  </h5>
                                  <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
                                    <Clock size={12} />
                                    <span>{t.time_start ? `${t.time_start} - ${t.time_end}` : "All Day"}</span>
                                  </div>
                                </div>

                                {/* Check complete action */}
                                {t.is_completed ? (
                                  <button
                                    onClick={() => handleUncompleteTask(t.id)}
                                    className="p-1 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
                                    title="取消完成"
                                  >
                                    <Check size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleCompleteTask(t)}
                                    className="p-1 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 rounded-lg transition-all cursor-pointer"
                                    title="標記完成"
                                  >
                                    <Check size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-slate-400 text-xs space-y-2">
                            <CalendarDays size={32} className="mx-auto opacity-40 text-slate-400" />
                            <p>今日無排定學習或複習任務</p>
                            <button
                              onClick={() => setActiveTab("add_task")}
                              className="text-zinc-900 font-semibold hover:underline cursor-pointer"
                            >
                              + 新增今日任務
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- VIEW 3: ADD TASK (Library Notes + Question Ownership Check) --- */}
              {activeTab === "add_task" && (
                <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-zinc-200 p-9 text-left space-y-7" id="view-add-task">
                  <div className="flex items-center gap-4 border-b border-zinc-200 pb-5">
                    <div className="p-3 bg-zinc-100 text-zinc-900 rounded-xl">
                      <PlusCircle size={22} />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-950 text-xl font-display">
                        {lang === "zh-Hant" ? "從筆記庫排定複習計畫" : "Schedule Review from Library"}
                      </h3>
                      <p className="text-xs text-zinc-400 uppercase font-mono tracking-wider mt-0.5">
                        Schedule Study Trajectory
                      </p>
                    </div>
                  </div>

                  {notes.length === 0 ? (
                    <div className="py-10 text-center space-y-4">
                      <p className="text-sm text-zinc-500">
                        {lang === "zh-Hant"
                          ? "筆記庫中尚未有筆記。請先從「匯入筆記」匯入，或在「筆記庫」中建立筆記。"
                          : "Your Library is empty. Import notes or create one in Library first."}
                      </p>
                      <div className="flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveTab("schema")}
                          className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white text-sm font-medium cursor-pointer"
                        >
                          {t.navSchema}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("reading")}
                          className="px-5 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-800 text-sm font-medium cursor-pointer"
                        >
                          {t.navReading}
                        </button>
                      </div>
                    </div>
                  ) : (() => {
                    const targetNote =
                      notes.find((n) => String(n.id) === selectedLibraryNoteId) ?? notes[0];

                    const handleGenerateQuestionsForNote = async () => {
                      if (!targetNote) return;
                      setGeneratingForTask(true);
                      setTaskQuestionMsg(null);
                      try {
                        const res = await authFetch("/api/quiz/generate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            note_id: targetNote.id,
                            title: targetNote.title,
                            content: targetNote.content,
                            count: 3,
                            question_types: ["mcq", "short_answer", "short_essay"],
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.detail || "Failed to generate questions");
                        const count = (data.questions || []).length;
                        setSelectedNoteQuestionCount((prev) => (prev ?? 0) + count);
                        setTaskQuestionMsg(
                          lang === "zh-Hant"
                            ? `已透過 LLM 新增 ${count} 題至集中題庫`
                            : `Generated ${count} new question(s) into question bank`,
                        );
                      } catch (err) {
                        setTaskQuestionMsg(err instanceof Error ? err.message : String(err));
                      } finally {
                        setGeneratingForTask(false);
                      }
                    };

                    return (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!targetNote) return;
                          setIsSubmittingTask(true);
                          try {
                            const res = await authFetch("/api/tasks/from-note", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                note_id: targetNote.id,
                                type: newTaskType,
                                pattern: newTaskPattern,
                                first_date: newTaskFirstDate,
                                time_start: newTaskIsAllDay ? null : newTaskStartTime,
                                time_end: newTaskIsAllDay ? null : newTaskEndTime,
                              }),
                            });
                            if (res.ok) {
                              await fetchData();
                              setActiveTab("calendar");
                              setSelectedDateStr(newTaskFirstDate);
                            }
                          } finally {
                            setIsSubmittingTask(false);
                          }
                        }}
                        className="space-y-6 text-sm"
                      >
                        {/* Library Note Selector */}
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            {lang === "zh-Hant" ? "選擇筆記庫中的筆記" : "Select Note from Library"}
                          </label>
                          <CustomSelect
                            value={String(targetNote.id)}
                            onChange={setSelectedLibraryNoteId}
                            options={notes.map((n) => ({
                              value: String(n.id),
                              label: `${n.title} · ${n.category}`,
                            }))}
                          />
                        </div>

                        {/* Question Bank Ownership Check */}
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              {lang === "zh-Hant" ? "題庫狀態（SQLite + questions.json）" : "Question Bank Status"}
                            </div>
                            <div className="text-sm font-medium text-zinc-900">
                              {checkingQuestions
                                ? lang === "zh-Hant"
                                  ? "檢查題庫中..."
                                  : "Checking question bank..."
                                : (selectedNoteQuestionCount ?? 0) > 0
                                  ? lang === "zh-Hant"
                                    ? `此筆記已有 ${selectedNoteQuestionCount} 題可供複習`
                                    : `${selectedNoteQuestionCount} question(s) ready for review`
                                  : lang === "zh-Hant"
                                    ? "此筆記尚無對應題目，可直接由 LLM 生成"
                                    : "No questions owned by this note yet — generate now"}
                            </div>
                            {taskQuestionMsg && (
                              <div className="text-xs text-zinc-600">{taskQuestionMsg}</div>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={generatingForTask}
                            onClick={() => void handleGenerateQuestionsForNote()}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer shrink-0"
                          >
                            {generatingForTask ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Sparkles size={13} />
                            )}
                            <span>
                              {(selectedNoteQuestionCount ?? 0) > 0
                                ? lang === "zh-Hant"
                                  ? "再生成新題目 (LLM)"
                                  : "Generate More (LLM)"
                                : lang === "zh-Hant"
                                  ? "立即建立題目 (LLM)"
                                  : "Create Questions (LLM)"}
                            </span>
                          </button>
                        </div>

                        {/* Task Type & Pattern */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider">Task Type</label>
                            <CustomSelect
                              value={newTaskType}
                              onChange={(val) => setNewTaskType(val as "new" | "practice")}
                              options={[
                                { value: "new", label: "New (Spaced Repetition)" },
                                { value: "practice", label: "Practice (Single Session)" },
                              ]}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pattern</label>
                            <CustomSelect
                              value={newTaskPattern}
                              disabled={newTaskType === "practice"}
                              onChange={(val) => setNewTaskPattern(val as "A" | "B" | "C")}
                              options={[
                                { value: "A", label: "Pattern A · 2ⁿ days (1, 2, 4, 8…)" },
                                { value: "B", label: "Pattern B · 3ⁿ days (1, 3, 9, 27…)" },
                                { value: "C", label: "Pattern C · SM-2 Adaptive" },
                              ]}
                            />
                          </div>
                        </div>

                        {/* Date and Time selectors */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                              {lang === "zh-Hant" ? "開始複習日期" : "Start Date"}
                            </label>
                            <input
                              type="date"
                              value={newTaskFirstDate}
                              onChange={(e) => setNewTaskFirstDate(e.target.value)}
                              className="w-full px-4 py-3 border border-zinc-200 rounded-xl bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none text-[15px]"
                            />
                          </div>

                          <div className="space-y-2 flex flex-col justify-end">
                            <label className="flex items-center gap-2.5 pb-2.5 text-sm font-medium text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newTaskIsAllDay}
                                onChange={(e) => setNewTaskIsAllDay(e.target.checked)}
                                className="w-4 h-4 accent-zinc-950 rounded"
                              />
                              <span>{lang === "zh-Hant" ? "全天日程" : "All Day"}</span>
                            </label>

                            {!newTaskIsAllDay && (
                              <div className="flex items-center space-x-2">
                                <input
                                  type="time"
                                  value={newTaskStartTime}
                                  onChange={(e) => setNewTaskStartTime(e.target.value)}
                                  className="w-1/2 px-3 py-2.5 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none"
                                />
                                <span className="text-zinc-400">–</span>
                                <input
                                  type="time"
                                  value={newTaskEndTime}
                                  onChange={(e) => setNewTaskEndTime(e.target.value)}
                                  className="w-1/2 px-3 py-2.5 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Submitting Buttons */}
                        <div className="flex gap-3.5 pt-4">
                          <button
                            type="button"
                            onClick={() => setActiveTab("calendar")}
                            className="w-1/2 py-3 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 font-medium text-sm rounded-xl transition-colors cursor-pointer"
                          >
                            {lang === "zh-Hant" ? "取消" : "Cancel"}
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmittingTask}
                            className="w-1/2 py-3 bg-zinc-950 hover:bg-zinc-800 text-white font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isSubmittingTask && <Loader2 size={14} className="animate-spin" />}
                            <span>{lang === "zh-Hant" ? "啟動複習計畫" : "Schedule Review"}</span>
                          </button>
                        </div>
                      </form>
                    );
                  })()}
                </div>
              )}

              {/* --- VIEW 4: STATISTICS & DAILY CHART --- */}
              {activeTab === "stats" && (() => {
                const CATEGORY_COLORS: Record<string, string> = {
                  English: "#3b82f6", // Blue
                  Math: "#ec4899",    // Pink
                  Coding: "#8b5cf6",  // Purple
                  Biology: "#10b981", // Emerald
                  History: "#f59e0b", // Amber
                  Other: "#64748b",   // Slate
                };
                const DEFAULT_COLOR = "#64748b";

                const CATEGORY_LABELS: Record<string, string> = {
                  English: "English 🇬🇧",
                  Math: "數學 📐",
                  Coding: "資訊學科 💻",
                  Biology: "生物學科 🌿",
                  History: "歷史學科 📜",
                  Other: "其他項目 📁",
                };

                const taskData = (stats?.categories || [])
                  .map(cat => ({
                    name: CATEGORY_LABELS[cat.category] || cat.category,
                    value: cat.total,
                    color: CATEGORY_COLORS[cat.category] || DEFAULT_COLOR,
                  }))
                  .filter(d => d.value > 0);

                const timeData = (stats?.categories || [])
                  .map(cat => ({
                    name: CATEGORY_LABELS[cat.category] || cat.category,
                    value: cat.timeSpentMinutes || 0,
                    color: CATEGORY_COLORS[cat.category] || DEFAULT_COLOR,
                  }))
                  .filter(d => d.value > 0);

                return (
                  <div className="max-w-5xl mx-auto space-y-8" id="view-stats">
                    {/* Stats Main Hero Grid (Monochrome, Generous Scale) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
                      <div className="bg-white rounded-2xl p-7 border border-zinc-200 space-y-2">
                        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">
                          {lang === "zh-Hant" ? "總學習筆記主題" : "Total Notes"}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">{stats?.totalNotes || 0}</p>
                        <span className="text-xs text-zinc-400 block">
                          {lang === "zh-Hant" ? "已收錄筆記總數" : "Canonical notes tracked"}
                        </span>
                      </div>

                      <div className="bg-white rounded-2xl p-7 border border-zinc-200 space-y-2">
                        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">
                          {t.metricNew}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">{stats?.totalCompletedNew || 0}</p>
                        <span className="text-xs text-zinc-400 block">1.0 pt / item</span>
                      </div>

                      <div className="bg-white rounded-2xl p-7 border border-zinc-200 space-y-2">
                        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">
                          {lang === "zh-Hant" ? "已完成練習項目" : "Practice Sessions"}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">{stats?.totalCompletedPractice || 0}</p>
                        <span className="text-xs text-zinc-400 block">0.5 pt / item</span>
                      </div>

                      <div className="bg-white rounded-2xl p-7 border border-zinc-200 space-y-2">
                        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">
                          {t.overdue}
                        </span>
                        <p className="text-4xl font-semibold font-mono text-zinc-950">
                          {stats?.overdueCount || 0}
                        </p>
                        <span className="text-xs text-zinc-400 block">
                          {lang === "zh-Hant" ? "待補進度任務" : "Pending past-due tasks"}
                        </span>
                      </div>
                    </div>

                    {/* TWO PIE CHARTS FOR CATEGORIES AND TIME SPENT */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Pie Chart 1: Tasks */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-left flex flex-col justify-between">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-sm font-display">學科規劃任務分佈 (任務數量)</h4>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Tasks Scheduled per Category</p>
                        </div>
                        <div className="h-64 flex items-center justify-center mt-4">
                          {taskData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={taskData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={55}
                                  outerRadius={75}
                                  paddingAngle={4}
                                  dataKey="value"
                                >
                                  {taskData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: any) => [`${value} 個任務`, "規劃數量"]}
                                  contentStyle={{ background: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconSize={10} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="text-slate-400 text-xs py-10">尚無學科分類任務數據</div>
                          )}
                        </div>
                      </div>

                      {/* Pie Chart 2: Time spent */}
                      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-left flex flex-col justify-between">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-sm font-display">實際學習時間投入比例</h4>
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Time Investment (Minutes Spent per Category)</p>
                        </div>
                        <div className="h-64 flex items-center justify-center mt-4">
                          {timeData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={timeData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={55}
                                  outerRadius={75}
                                  paddingAngle={4}
                                  dataKey="value"
                                >
                                  {timeData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: any) => [`${value} 分鐘`, "時間投入"]}
                                  contentStyle={{ background: "#1e293b", borderRadius: "12px", border: "none", color: "#fff", fontSize: "11px" }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconSize={10} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="text-slate-400 text-xs py-10">尚無已完成任務的時間統計</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Daily Point Schedule vs Achievement Stream */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-left">
                      <div className="border-b border-slate-100 pb-4 mb-4">
                        <h4 className="font-extrabold text-slate-800 text-sm font-display">每日學習積分趨勢 (Daily Learning Points)</h4>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Point tracking: New = 1.0 pt | Practice = 0.5 pt</p>
                      </div>

                      {stats?.dailyPoints && stats.dailyPoints.length > 0 ? (
                        <div className="space-y-3 font-mono text-xs">
                          {stats.dailyPoints.slice(-10).map((dp, i) => {
                            const goalMet = dp.completed_points >= 5.0;
                            return (
                              <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 rounded-2xl gap-3">
                                <span className="font-bold text-slate-600">{dp.scheduled_date}</span>
                                <div className="flex items-center gap-4 text-[11px] font-sans flex-1 max-w-md">
                                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden border border-slate-200/50">
                                    <div 
                                      className={`h-full ${goalMet ? "bg-emerald-500" : "bg-amber-400"}`} 
                                      style={{ width: `${Math.min(100, (dp.completed_points / 5.0) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-bold shrink-0">{dp.completed_points.toFixed(1)} / 5.0 pts</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider font-sans ${
                                  goalMet ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                }`}>
                                  {goalMet ? "目標達成" : "落後赤字"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-10 text-slate-400 text-xs">
                          尚無充足的每日積分歷史紀錄
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* --- VIEW: LIBRARY (INDEX + FULL-WIDTH READING + HOVER DRAWER) --- */}
              {activeTab === "reading" && (
                <EditorialReaderView
                  notes={notes}
                  tasks={tasks}
                  lang={lang}
                  onNoteCreated={() => void fetchData()}
                  onCopyQuizPrompt={(note) => {
                    const prompt = `請根據以下筆記內容，為我設計 3 題主動回憶測驗（包含 2 題簡答題與 1 題情境應用題），並在我作答後逐題給予回饋：\n\n# ${note.title}\n\n${note.content}`;
                    void navigator.clipboard?.writeText(prompt);
                  }}
                />
              )}

              {/* --- VIEW: CUSTOMIZABLE SCHEMA SOURCE --- */}
              {activeTab === "schema" && (
                <SchemaSourcePanel lang={lang} onImported={() => void fetchData()} />
              )}

              {activeTab === "coach" && (
                <CoachPanel notes={notes} lang={lang} onRefreshData={fetchData} />
              )}

              {/* --- VIEW 5: GOOGLE CALENDAR SYNC CONSOLE --- */}
              {activeTab === "sync" && (
                <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 text-left shadow-sm space-y-6" id="view-sync">
                  <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <FolderSync size={22} className="animate-spin" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm font-display">Google Calendar 連接主控台</h3>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Sync with cloud calendar</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {googleUser && (
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center space-x-3.5 border border-slate-200/50 text-xs">
                        <img 
                          src={googleUser.photoURL} 
                          alt="avatar" 
                          className="w-10 h-10 rounded-full border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <p className="font-bold text-slate-800">{googleUser.displayName}</p>
                          <p className="text-slate-400 font-mono">{googleUser.email}</p>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-600 leading-relaxed space-y-2">
                      <p>
                        您可以將 Mentorion 行事曆上的「新學 (New)」與「複習 (Revision)」任務，<strong>一鍵同步</strong> 匯出至您的 Google Calendar 行事曆中。
                      </p>
                      <p>
                        同步後，Google 日曆上將會在對應的日期與時段為您產生完整的複習提醒！
                      </p>
                    </div>

                    {syncStatusMsg && (
                      <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl text-[11px] text-blue-700 font-semibold font-mono">
                        {syncStatusMsg}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      {!googleAccessToken ? (
                        <button
                          onClick={handleConnectGoogle}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center justify-center space-x-1.5"
                        >
                          <FolderSync size={14} />
                          <span>連接 Google Calendar 帳戶</span>
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={handleExportToGcal}
                            disabled={isSyncingGcal}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center justify-center space-x-1.5 disabled:opacity-50"
                          >
                            {isSyncingGcal ? <Loader2 size={14} className="animate-spin" /> : <FolderSync size={14} />}
                            <span>一鍵同步排程至 Google Calendar</span>
                          </button>
                          <button
                            onClick={() => {
                              setGoogleAccessToken(null);
                              setGoogleUser(null);
                              setSyncStatusMsg("已成功解除 Google 帳戶連接。");
                            }}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                          >
                            取消連結
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </main>

      {/* --- MODAL: ACTIVE RECALL REVISION CARD (Directly presents Quiz + Editable Ease Factor) --- */}
      {activeRevisionCardTask && (() => {
        const matchedNote = notes.find((n) => n.id === activeRevisionCardTask.note_id) ?? {
          id: activeRevisionCardTask.note_id,
          title: activeRevisionCardTask.note_title,
          content: activeRevisionCardTask.note_content,
          category: activeRevisionCardTask.note_category,
          type: activeRevisionCardTask.note_type,
          pattern: activeRevisionCardTask.note_pattern,
          created_at: "",
          first_date: activeRevisionCardTask.note_first_date,
          ease_factor: activeRevisionCardTask.ease_factor || 2.5,
          interval_days: activeRevisionCardTask.interval_days || 0,
          repetitions: activeRevisionCardTask.repetitions || 0,
        };
        const currentEf = activeRevisionCardTask.ease_factor || 2.5;

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-4 md:p-8 bg-black/50 backdrop-blur-xs">
            <div className="bg-white text-zinc-950 rounded-2xl shadow-2xl border border-zinc-200 max-w-3xl w-full my-auto overflow-hidden text-left">
              {/* Header */}
              <div className="flex justify-between items-start gap-4 px-6 py-5 border-b border-zinc-200">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-zinc-400">
                    <span>{activeRevisionCardTask.note_category}</span>
                    <span>·</span>
                    <span>{activeRevisionCardTask.scheduled_date}</span>
                    <span>·</span>
                    <span>Reps {activeRevisionCardTask.repetitions || 0}</span>
                    <span>·</span>
                    <span>Interval {activeRevisionCardTask.interval_days || 0}d</span>
                  </div>
                  <h3 className="text-xl font-bold font-display text-zinc-950 leading-snug">
                    {activeRevisionCardTask.note_title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRevisionCardTask(null)}
                  className="text-zinc-400 hover:text-zinc-900 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Compact SM-2 Ease Factor Control + Quick Actions */}
              <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="text-xs font-medium text-zinc-700"
                    title={
                      lang === "zh-Hant"
                        ? "SM-2 記憶倍率：數值越低複習越頻繁（難），越高間隔拉越長（簡單）。"
                        : "SM-2 multiplier: lower = more frequent reviews (harder), higher = longer intervals (easier)."
                    }
                  >
                    {lang === "zh-Hant" ? "難易度因子 (EF)" : "Ease Factor"}:{" "}
                    <span className="font-mono font-bold text-zinc-950">{currentEf.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={1.3}
                    max={3.0}
                    step={0.05}
                    value={currentEf}
                    onChange={(e) =>
                      void handleUpdateEaseFactor(activeRevisionCardTask.note_id, Number(e.target.value))
                    }
                    className="w-28 accent-zinc-950 cursor-pointer"
                  />
                  <div className="inline-flex items-center gap-1">
                    {[
                      { label: lang === "zh-Hant" ? "難" : "Hard", val: 1.7 },
                      { label: lang === "zh-Hant" ? "標準" : "Normal", val: 2.5 },
                      { label: lang === "zh-Hant" ? "簡單" : "Easy", val: 2.8 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => void handleUpdateEaseFactor(activeRevisionCardTask.note_id, preset.val)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                          Math.abs(currentEf - preset.val) < 0.08
                            ? "bg-zinc-950 text-white border-zinc-950"
                            : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-500"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {[1, 3, 7].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => handleTrajectoryShift(activeRevisionCardTask.note_id, days)}
                      className="px-2.5 py-1.5 bg-white hover:bg-zinc-950 hover:text-white text-zinc-700 rounded-lg border border-zinc-200 font-mono text-[11px] transition-colors cursor-pointer"
                      title={lang === "zh-Hant" ? `延後後續排程 ${days} 天` : `Shift trajectory +${days}d`}
                    >
                      +{days}d
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void handleDeleteSingleTask(activeRevisionCardTask.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-950 hover:text-white text-zinc-600 text-[11px] font-medium transition-colors cursor-pointer"
                    title={lang === "zh-Hant" ? "只刪除此筆排程（保留筆記庫）" : "Remove only this task"}
                  >
                    <Trash2 size={12} />
                    <span>{lang === "zh-Hant" ? "刪除此排程" : "Remove"}</span>
                  </button>
                </div>
              </div>

              {/* Body: Two-stage flow (Note Preview -> Active Recall Quiz + SM-2 Completion) */}
              {revisionModalMode === "note" ? (
                <div className="px-6 py-6 space-y-5">
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 max-h-[48vh] overflow-y-auto text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap font-sans">
                    {matchedNote.content || (lang === "zh-Hant" ? "此筆記尚無內文。" : "No content yet.")}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-zinc-400">
                      {lang === "zh-Hant"
                        ? "準備好了嗎？進入主動回憶解題並更新下次複習排程。"
                        : "Ready? Start active recall to test yourself and schedule the next review."}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveRevisionCardTask(null);
                          setRevisionModalMode("note");
                        }}
                        className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-medium cursor-pointer"
                      >
                        {lang === "zh-Hant" ? "關閉" : "Close"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevisionModalMode("quiz")}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium cursor-pointer"
                      >
                        <Sparkles size={14} />
                        <span>{lang === "zh-Hant" ? "進入複習解題" : "Start Active Recall"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-6 pb-6 space-y-5">
                  <div className="pt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setRevisionModalMode("note")}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-950 cursor-pointer"
                    >
                      ← {lang === "zh-Hant" ? "返回筆記內容" : "Back to Note"}
                    </button>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                      ACTIVE RECALL SESSION
                    </span>
                  </div>

                  <div className="max-h-[48vh] overflow-y-auto pr-1">
                    <QuizPanel
                      note={matchedNote}
                      onClose={() => setRevisionModalMode("note")}
                    />
                  </div>

                  {/* Finish & Update SM-2 Review Status + Schedule Next Single Task */}
                  <div className="pt-4 border-t border-zinc-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900">
                        {lang === "zh-Hant"
                          ? "根據本次作答狀況評分（更新 SM-2 並排程下一次複習）"
                          : "Rate mastery to update SM-2 & schedule next review"}
                      </span>
                      <span className="text-xs font-mono text-zinc-500">
                        {revisionRating} / 5
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      {[0, 1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          type="button"
                          onClick={() => setRevisionRating(score)}
                          className={`py-2 rounded-xl border text-xs font-mono font-semibold transition-colors cursor-pointer ${
                            revisionRating === score
                              ? "bg-zinc-950 text-white border-zinc-950"
                              : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-500"
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={submittingRevision}
                        onClick={() => void handleCompleteFromRevisionCard()}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-medium cursor-pointer"
                      >
                        {submittingRevision ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        <span>
                          {lang === "zh-Hant"
                            ? "完成本次複習並更新下次排程"
                            : "Complete Review & Schedule Next"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* --- MODAL: COMPLETE WITH SM-2 RATING POPUP (Pattern C Only) --- */}
      {completingTask && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-scaleIn text-left">
            <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center space-x-2">
                <Sparkles size={18} className="text-blue-600 animate-pulse" />
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-widest font-display">自我記憶熟練度打分</h3>
              </div>
              <button
                onClick={() => setCompletingTask(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">
                  {completingTask.note_category}
                </p>
                <h4 className="text-base font-extrabold text-slate-800 leading-snug">
                  {completingTask.note_title}
                </h4>
              </div>

              {/* SM-2 Description helper */}
              <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-2xl text-[11px] text-slate-500 leading-relaxed space-y-1">
                <p className="font-bold text-slate-700">如何選擇適合的分數？</p>
                <p><strong>1 - 2分</strong>：完全忘記或答錯（系統將在明天重新排定複習）</p>
                <p><strong>3分</strong>：想很久才勉強答對（臨界熟悉，需經常複習）</p>
                <p><strong>4 - 5分</strong>：毫無難度且能立刻完美作答（間隔將倍數放大）</p>
              </div>

              {/* Rating Button Matrix */}
              <div className="grid grid-cols-5 gap-2.5 pt-2">
                {[1, 2, 3, 4, 5].map(ratingVal => (
                  <button
                    key={ratingVal}
                    type="button"
                    onClick={() => setCompletingRating(ratingVal)}
                    className={`h-14 rounded-2xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                      completingRating === ratingVal
                        ? "border-blue-500 bg-blue-50 text-blue-600 font-extrabold shadow-sm ring-1 ring-blue-500"
                        : "border-slate-200 hover:border-slate-300 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-lg leading-none font-display">{ratingVal}</span>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                      {ratingVal === 1 ? "完全忘" : ratingVal === 3 ? "勉強對" : ratingVal === 5 ? "超流暢" : "分數"}
                    </span>
                  </button>
                ))}
              </div>

              {/* Anchor Date Configurator */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">計算下次複習的基準日 (Anchor Date)</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setAnchorOption("A")}
                    className={`py-2.5 px-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      anchorOption === "A"
                        ? "border-blue-500 bg-blue-50/20 text-blue-700 font-semibold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-500"
                    }`}
                  >
                    <span className="font-bold">以實際完成日為準 (今天)</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">今天起算複習間隔</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAnchorOption("B")}
                    className={`py-2.5 px-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      anchorOption === "B"
                        ? "border-blue-500 bg-blue-50/20 text-blue-700 font-semibold"
                        : "border-slate-200 hover:bg-slate-50 text-slate-500"
                    }`}
                  >
                    <span className="font-bold">以原訂排程日為準</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">不因拖延打亂規律</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="w-1/2 py-3 border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleRatingSubmit}
                  className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-600/10"
                >
                  確認並登錄評分
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        lang={lang}
        onChangeLang={handleChangeLang}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

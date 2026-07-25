import React, { useState, useEffect, useMemo } from "react";
import { Note, Task, JournalEvent, StatsResponse, CategoryStat } from "./types";
import { useAuth } from "./context/AuthContext";
import { authApi } from "./api/auth";
import { 
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
  const { token, user, login, logout, isLoading: authLoading } = useAuth();

  // Guest mode & Auth form states
  const [isGuest, setIsGuest] = useState(() => localStorage.getItem("mentorion_guest") === "true");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const handleContinueAsGuest = () => {
    setIsGuest(true);
    localStorage.setItem("mentorion_guest", "true");
  };

  const handleLogout = () => {
    logout();
    localStorage.removeItem("mentorion_guest");
    setIsGuest(false);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    try {
      if (authMode === "login") {
        const data = await authApi.login(authEmail || authUsername, authPassword);
        const userData = await authApi.testToken(data.access_token);
        login(data.access_token, userData);
        localStorage.removeItem("mentorion_guest");
        setIsGuest(false);
      } else {
        await authApi.register(authUsername, authEmail, authPassword);
        const data = await authApi.login(authEmail, authPassword);
        const userData = await authApi.testToken(data.access_token);
        login(data.access_token, userData);
        localStorage.removeItem("mentorion_guest");
        setIsGuest(false);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Custom fetch wrapper injecting Bearer token
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = { ...options.headers } as any;
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  };

  // Sidebar tab state
  const [activeTab, setActiveTab] = useState<"cover" | "calendar" | "add_task" | "stats" | "sync">("cover");
  
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
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingRating, setCompletingRating] = useState<number>(5);
  const [anchorOption, setAnchorOption] = useState<"A" | "B">("A");

  // Form State for creating a task
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="animate-spin text-blue-500" size={40} />
          <p className="text-slate-400 text-sm font-semibold tracking-wider font-display">Loading Mentorion auth state...</p>
        </div>
      </div>
    );
  }

  if (!token && !isGuest) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600/10 text-blue-500 rounded-2xl mb-4 border border-blue-500/20">
              <BrainCircuit size={28} className="animate-pulse" />
            </div>
            <h1 className="text-2xl font-extrabold text-white font-display tracking-tight">
              {authMode === "login" ? "Welcome to Mentorion" : "Create your Account"}
            </h1>
            <p className="text-slate-400 text-xs mt-1.5 font-semibold">
              {authMode === "login" ? "Sign in to track your study sessions" : "Sign up to start spaced repetition scheduling"}
            </p>
          </div>

          {authError && (
            <div className="mb-6 p-4 bg-red-950/30 border border-red-500/20 text-red-400 text-xs font-semibold rounded-2xl text-center">
              ⚠️ {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Username</label>
                <input
                  type="text"
                  required
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl px-4 py-3 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="e.g. ludwig"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
                {authMode === "login" ? "Username or Email" : "Email Address"}
              </label>
              <input
                type={authMode === "login" ? "text" : "email"}
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl px-4 py-3 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder={authMode === "login" ? "ludwig or you@example.com" : "you@example.com"}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 rounded-2xl px-4 py-3 text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-2xl py-3.5 font-bold text-sm shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
            >
              {authSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>{authMode === "login" ? "Signing In..." : "Signing Up..."}</span>
                </>
              ) : (
                <span>{authMode === "login" ? "Sign In" : "Sign Up"}</span>
              )}
            </button>
          </form>

          <div className="mt-6 flex flex-col space-y-3.5 items-center">
            <p className="text-slate-400 text-xs font-semibold">
              {authMode === "login" ? "New to Mentorion?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthError("");
                }}
                className="text-blue-500 font-bold hover:underline"
              >
                {authMode === "login" ? "Create an account" : "Sign In instead"}
              </button>
            </p>

            <div className="w-full flex items-center justify-center space-x-3 my-2">
              <div className="h-[1px] bg-slate-800 grow" />
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">Or</span>
              <div className="h-[1px] bg-slate-800 grow" />
            </div>

            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="w-full border border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-300 rounded-2xl py-3 font-semibold text-xs transition-colors"
            >
              Continue as Guest (No Account)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row font-sans" id="applet-root">
      
      {/* LEFT SIDEBAR PANEL */}
      <aside className="w-full md:w-80 bg-[#0f172a] text-slate-200 flex flex-col shrink-0 border-r border-slate-800" id="app-sidebar">
        {/* Brand header */}
        <div className="p-6 border-b border-slate-800 flex items-center space-x-3.5">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white border border-blue-500 shadow-sm shadow-blue-500/20">
            <BrainCircuit size={20} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-wide font-display">
              Planit Study Calendar
            </h1>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              V2 Spaced Repetition Engine
            </span>
          </div>
        </div>

        {/* User Profile Info & Logout */}
        {user ? (
          <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{user.username}</p>
                <p className="text-[9px] text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-[10px] font-bold text-slate-400 hover:text-red-400 transition-colors py-1 px-2 border border-slate-800 hover:border-red-950 bg-slate-950/20 rounded-md shrink-0 ml-2"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold">
                G
              </div>
              <div>
                <p className="text-xs font-bold text-slate-300">Guest User</p>
                <p className="text-[9px] text-slate-500">Local Default Mode</p>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("mentorion_guest");
                setIsGuest(false);
              }}
              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors py-1 px-2 border border-slate-800 hover:border-blue-900 bg-slate-950/20 rounded-md"
            >
              Sign In
            </button>
          </div>
        )}

        {/* Navigation Section */}
        <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => setActiveTab("cover")}
            className={`w-full flex items-center space-x-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all text-left ${
              activeTab === "cover"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <Sparkles size={16} />
            <span>🏡 學習控制台 (Dashboard)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("calendar");
              setSelectedDateStr(new Date().toISOString().split("T")[0]);
            }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs font-semibold rounded-xl transition-all text-left ${
              activeTab === "calendar"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <div className="flex items-center space-x-3">
              <CalendarIcon size={16} />
              <span>📅 Planit 複習月曆</span>
            </div>
            {tasks.filter(t => !t.is_completed).length > 0 && (
              <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {tasks.filter(t => !t.is_completed).length} 待辦
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("add_task")}
            className={`w-full flex items-center space-x-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all text-left ${
              activeTab === "add_task"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <PlusCircle size={16} />
            <span>✍️ 新增複習任務</span>
          </button>

          <button
            onClick={() => setActiveTab("stats")}
            className={`w-full flex items-center space-x-3 px-4 py-3 text-xs font-semibold rounded-xl transition-all text-left ${
              activeTab === "stats"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/10"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            }`}
          >
            <BarChart3 size={16} />
            <span>📊 Statistics / 統計數據</span>
          </button>

          <div className="pt-4 border-t border-slate-800 my-4" />

          {/* Quick Stats sidebar info widget */}
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800 text-[11px] space-y-3.5">
            <span className="font-bold text-slate-400 uppercase tracking-widest text-[9px] block">
              學習積分 (Daily Target: 5 pts)
            </span>
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono">
                <span className="text-slate-400">今日已得積分:</span>
                <span className="text-emerald-400 font-bold">{todayPoints.completed} pts</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (todayPoints.completed / 5.0) * 100)}%` }}
                />
              </div>
            </div>

            {stats && (
              <div className="pt-2 space-y-1 border-t border-slate-800 font-mono text-slate-400">
                <div className="flex justify-between">
                  <span>待補足赤字:</span>
                  <span className={stats.deficitPoints > 0 ? "text-rose-400 font-bold" : "text-slate-400"}>
                    {stats.deficitPoints} pts
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>逾期未複習:</span>
                  <span className={stats.overdueCount > 0 ? "text-rose-400 font-bold" : "text-slate-400"}>
                    {stats.overdueCount} 個
                  </span>
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* Sidebar Footer Google Calendar status */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Google Calendar:</span>
            {googleAccessToken ? (
              <span className="text-emerald-400 font-bold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                <span>已同步</span>
              </span>
            ) : (
              <span className="text-rose-400 font-bold">未連接</span>
            )}
          </div>
          {googleAccessToken ? (
            <button 
              onClick={() => setActiveTab("sync")}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-bold uppercase rounded-lg transition-all flex items-center justify-center space-x-1"
            >
              <FolderSync size={11} />
              <span>開啟同步控制台</span>
            </button>
          ) : (
            <button 
              onClick={handleConnectGoogle}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase rounded-lg transition-all flex items-center justify-center space-x-1"
            >
              <FolderSync size={11} />
              <span>綁定 Google Calendar</span>
            </button>
          )}
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0" id="app-workspace">
        {/* Mentor quote upper strip */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center space-x-3 shadow-xs">
          <Sparkles className="text-blue-500 shrink-0 animate-bounce" size={16} />
          <p className="text-xs text-blue-700 font-medium italic transition-all duration-500">
            {mentorTips[activeTipIdx]}
          </p>
        </div>

        {/* Dynamic Inner Tab container */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-96 text-slate-500">
              <Loader2 size={36} className="animate-spin text-blue-600 mb-3" />
              <p className="text-sm font-semibold">正在載入學習排程資料...</p>
            </div>
          ) : (
            <div className="animate-fadeIn">
              
              {/* --- VIEW 1: COVER/DASHBOARD --- */}
              {activeTab === "cover" && (
                <div className="max-w-4xl mx-auto space-y-8" id="view-cover">
                  {/* Hero Invitation Greeting */}
                  <div className="relative bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white rounded-3xl p-8 md:p-10 shadow-xl overflow-hidden border border-slate-800">
                    <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-1/4 translate-x-1/4">
                      <BrainCircuit size={360} />
                    </div>
                    <div className="relative z-10 max-w-xl space-y-4">
                      <span className="text-[10px] bg-blue-500 text-white px-3 py-1 rounded-full font-bold uppercase tracking-widest font-mono">
                        Welcome to Planit Spaced Repetition
                      </span>
                      <h2 className="text-2xl md:text-3xl font-extrabold font-display leading-tight">
                        掌握科學記憶規律，<br />打造堅不可摧的知識行事曆
                      </h2>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        整合了頂尖的 SM-2 自適應複習算法與 Planit 日程規劃規格。您只需記錄學習筆記或加入複習科目，系統將自動生成未來所有的複習排程並同步至行事曆！
                      </p>
                      <div className="pt-4 flex flex-wrap gap-3">
                        <button
                          onClick={() => setActiveTab("calendar")}
                          className="px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-500/20"
                        >
                          進入學習與複習月曆 →
                        </button>
                        <button
                          onClick={() => setActiveTab("add_task")}
                          className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all"
                        >
                          + 新增今日學習主題
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Core Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">已完成 New 項目</span>
                        <p className="text-3xl font-extrabold font-mono text-blue-600">{stats?.totalCompletedNew || 0}</p>
                        <span className="text-[9px] text-slate-400">100% 長期追蹤複習中</span>
                      </div>
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <BookMarked size={24} />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">已完成 Revision 次數</span>
                        <p className="text-3xl font-extrabold font-mono text-emerald-600">{stats?.totalCompletedRevision || 0}</p>
                        <span className="text-[9px] text-slate-400">間隔次數不斷放大中</span>
                      </div>
                      <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <CheckCircle2 size={24} />
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">累計待補足積分赤字</span>
                        <p className={`text-3xl font-extrabold font-mono ${stats && stats.deficitPoints > 0 ? "text-rose-500" : "text-slate-400"}`}>
                          {stats?.deficitPoints || 0} pts
                        </p>
                        <span className="text-[9px] text-slate-400">落後目標的累計點數</span>
                      </div>
                      <div className="p-3 bg-rose-50 text-rose-500 rounded-xl">
                        <AlertTriangle size={24} />
                      </div>
                    </div>
                  </div>

                  {/* Overdue/Focused Task Alerts Panel */}
                  {stats && stats.overdueCount > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start space-x-4">
                      <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1.5 text-left">
                        <h4 className="font-bold text-amber-800 text-xs">您目前有 {stats.overdueCount} 個預定的複習任務已經過期！</h4>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          間隔記憶的核心在於及時複習。拖延會導致記憶留存度急遽下降，現在就前往「Planit 複習月曆」選取今日或過去的日子來完成複習吧！
                        </p>
                        <button
                          onClick={() => setActiveTab("calendar")}
                          className="text-amber-800 font-bold text-[11px] hover:underline"
                        >
                          立即查看過期排程 →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visual Category List cards */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-left">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 font-display">
                        當前學科領域複習分佈 / CATEGORIES
                      </h3>
                      <button 
                        onClick={() => setActiveTab("add_task")} 
                        className="text-blue-600 text-[10px] font-bold uppercase hover:underline"
                      >
                        + 新增分類學科
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {stats?.categories && stats.categories.length > 0 ? (
                        stats.categories.map((c, i) => (
                          <div key={i} className="px-6 py-4 flex items-center justify-between text-xs">
                            <div className="space-y-1 flex-1 max-w-sm">
                              <span className="font-bold text-slate-800">{c.category}</span>
                              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500" 
                                  style={{ width: `${Math.round((c.completed / (c.total || 1)) * 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex items-center space-x-6 text-slate-500 text-[11px]">
                              <span>總計 {c.total} 個任務</span>
                              <span className="text-emerald-600 font-bold">已完成 {c.completed}</span>
                              <span className="text-slate-400 font-semibold">待複習 {c.uncompleted}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-xs text-slate-400">
                          尚無登錄的筆記或複習任務分類，現在就去建立吧！
                        </div>
                      )}
                    </div>
                  </div>
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
                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400">
                      {["日", "一", "二", "三", "四", "五", "六"].map((day, idx) => (
                        <div key={idx} className={idx === 0 || idx === 6 ? "text-rose-400" : ""}>
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Calendar Day cells */}
                    <div className="grid grid-cols-7 gap-2">
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
                            className={`min-h-[80px] p-2 rounded-2xl border flex flex-col justify-between text-left transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50/10 ring-1 ring-blue-500"
                                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                            } ${isCurrentMonth ? "bg-white text-slate-700" : "bg-slate-50 text-slate-300"}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono ${
                                isToday 
                                  ? "bg-blue-600 text-white" 
                                  : isSelected 
                                  ? "text-blue-600 font-extrabold" 
                                  : "text-slate-600"
                              }`}>
                                {date.getDate()}
                              </span>
                              
                              {/* Goal achievement indicators */}
                              {hasTasks && (
                                <span className={`w-2 h-2 rounded-full ${goalMet ? "bg-emerald-500" : "bg-amber-400"}`}></span>
                              )}
                            </div>

                            {/* Cell task brief summary indicators */}
                            <div className="mt-1 space-y-1 text-[8px] font-bold">
                              {dateTasks.slice(0, 2).map((t, tid) => (
                                <div 
                                  key={tid} 
                                  className={`px-1 py-0.5 rounded truncate border ${
                                    t.is_completed
                                      ? "bg-slate-100 text-slate-400 border-slate-200/50 line-through"
                                      : t.type === "new"
                                      ? "bg-blue-50 text-blue-700 border-blue-100/30"
                                      : t.type === "practice"
                                      ? "bg-purple-50 text-purple-700 border-purple-100/30"
                                      : "bg-amber-50 text-amber-700 border-amber-100/30"
                                  }`}
                                >
                                  {t.note_title}
                                </div>
                              ))}
                              {dateTasks.length > 2 && (
                                <div className="text-[7px] text-slate-400 text-center font-bold">
                                  + {dateTasks.length - 2} 個項目
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
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs">
                            {selectedDateStr} 排程任務
                          </h4>
                          <span className="text-[10px] text-slate-400">
                            該日共有 {selectedDateTasks.length} 個排定項目
                          </span>
                        </div>
                        
                        <button
                          onClick={handleClearCompleted}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold uppercase rounded-lg transition-all"
                        >
                          清除已完成
                        </button>
                      </div>

                      {/* Daily schedule items list */}
                      <div className="space-y-3 max-h-[350px] overflow-y-auto">
                        {selectedDateTasks.length > 0 ? (
                          selectedDateTasks.map((t) => (
                            <div 
                              key={t.id} 
                              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                                t.is_completed 
                                  ? "bg-slate-50 border-slate-100" 
                                  : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div 
                                  onClick={() => setActiveRevisionCardTask(t)}
                                  className="space-y-1 flex-1 cursor-pointer"
                                >
                                  <div className="flex items-center space-x-1.5 flex-wrap">
                                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase ${
                                      t.type === "new"
                                        ? "bg-blue-100 text-blue-700"
                                        : t.type === "practice"
                                        ? "bg-purple-100 text-purple-700"
                                        : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {t.type === "new" ? "New / 新學" : t.type === "practice" ? "Practice" : `Revision #${t.revision_number}`}
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-semibold">
                                      {t.note_category}
                                    </span>
                                  </div>
                                  <h5 className={`font-bold text-slate-800 text-xs truncate ${t.is_completed ? "line-through text-slate-400" : ""}`}>
                                    {t.note_title}
                                  </h5>
                                  <div className="flex items-center space-x-1 text-[9px] text-slate-400">
                                    <Clock size={10} />
                                    <span>{t.time_start ? `${t.time_start} - ${t.time_end}` : "全天日程 / All Day"}</span>
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
                              className="text-blue-500 font-bold hover:underline"
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

              {/* --- VIEW 3: ADD TASK --- */}
              {activeTab === "add_task" && (
                <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 text-left shadow-sm space-y-6" id="view-add-task">
                  <div className="flex items-center space-x-3 border-b border-slate-100 pb-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                      <PlusCircle size={22} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-800 text-sm font-display">登錄全新筆記與複習計畫</h3>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Create New Study Trajectory</p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateTaskSubmit} className="space-y-5 text-xs">
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-500 uppercase tracking-wide">學習主題 / 筆記標題</label>
                      <input
                        type="text"
                        required
                        placeholder="例如：英文單字 Core-Vocabulary L1"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm font-medium"
                      />
                    </div>

                    {/* Content */}
                    <div className="space-y-1.5">
                      <label className="block font-bold text-slate-500 uppercase tracking-wide">學習筆記內容</label>
                      <textarea
                        rows={4}
                        placeholder="在此貼上筆記，供複習卡片資訊卡隨時參閱..."
                        value={newTaskContent}
                        onChange={(e) => setNewTaskContent(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl resize-none focus:border-blue-500 focus:outline-none text-sm"
                      />
                    </div>

                    {/* Meta selections */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-500 uppercase tracking-wide">學科分類 / Category</label>
                        <select
                          value={newTaskCategory}
                          onChange={(e) => setNewTaskCategory(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white focus:border-blue-500 focus:outline-none"
                        >
                          <option value="English">🇬🇧 English</option>
                          <option value="Math">📐 Math / 數學</option>
                          <option value="Coding">💻 Coding / 資訊學科</option>
                          <option value="Biology">🌿 Biology / 生物</option>
                          <option value="History">📜 History / 歷史學科</option>
                          <option value="Other">📁 Other / 其他項目</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-500 uppercase tracking-wide">學習類型 / Task Type</label>
                        <select
                          value={newTaskType}
                          onChange={(e) => setNewTaskType(e.target.value as any)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white focus:border-blue-500 focus:outline-none"
                        >
                          <option value="new">🆕 New (新學習 - 含多次自動複習)</option>
                          <option value="practice">🎯 Practice (練習 - 僅單次學習紀錄)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-500 uppercase tracking-wide">間隔記憶模式 / Pattern</label>
                        <select
                          value={newTaskPattern}
                          disabled={newTaskType === "practice"}
                          onChange={(e) => setNewTaskPattern(e.target.value as any)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="A">Pattern A (2的n次方天間隔)</option>
                          <option value="B">Pattern B (3的n次方天間隔)</option>
                          <option value="C">Pattern C (SM-2 自適應評分間隔)</option>
                        </select>
                      </div>
                    </div>

                    {/* Date and Time selectors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-500 uppercase tracking-wide">預定登錄學習日期</label>
                        <input
                          type="date"
                          value={newTaskFirstDate}
                          onChange={(e) => setNewTaskFirstDate(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                        />
                      </div>

                      <div className="space-y-1.5 flex flex-col justify-end">
                        <label className="flex items-center space-x-2.5 pb-2 font-bold text-slate-500 uppercase cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newTaskIsAllDay}
                            onChange={(e) => setNewTaskIsAllDay(e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span>全天日程 (All Day)</span>
                        </label>

                        {!newTaskIsAllDay && (
                          <div className="flex items-center space-x-2">
                            <input
                              type="time"
                              value={newTaskStartTime}
                              onChange={(e) => setNewTaskStartTime(e.target.value)}
                              className="w-1/2 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            />
                            <span className="text-slate-400">至</span>
                            <input
                              type="time"
                              value={newTaskEndTime}
                              onChange={(e) => setNewTaskEndTime(e.target.value)}
                              className="w-1/2 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submitting Buttons */}
                    <div className="flex space-x-3 pt-6">
                      <button
                        type="button"
                        onClick={() => setActiveTab("calendar")}
                        className="w-1/2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingTask}
                        className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-md shadow-blue-600/10 flex items-center justify-center space-x-2"
                      >
                        {isSubmittingTask && <Loader2 size={14} className="animate-spin" />}
                        <span>儲存並啟動複習計畫</span>
                      </button>
                    </div>
                  </form>
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
                  <div className="max-w-4xl mx-auto space-y-8" id="view-stats">
                    {/* Stats Main Hero Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">總學習筆記主題</span>
                        <p className="text-3xl font-extrabold font-mono text-blue-600">{stats?.totalNotes || 0}</p>
                        <span className="text-[9px] text-slate-400">主題 canonical ID 的總量</span>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">已完成 New 項目</span>
                        <p className="text-3xl font-extrabold font-mono text-emerald-600">{stats?.totalCompletedNew || 0}</p>
                        <span className="text-[9px] text-slate-400">總計 1.0 積分項目次數</span>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">已完成 Practice 項目</span>
                        <p className="text-3xl font-extrabold font-mono text-purple-600">{stats?.totalCompletedPractice || 0}</p>
                        <span className="text-[9px] text-slate-400">總計 0.5 積分項目次數</span>
                      </div>

                      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">逾期未複習任務</span>
                        <p className={`text-3xl font-extrabold font-mono ${stats && stats.overdueCount > 0 ? "text-rose-500" : "text-slate-400"}`}>
                          {stats?.overdueCount || 0}
                        </p>
                        <span className="text-[9px] text-slate-400">落後排程天數的任務</span>
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

      {/* --- MODAL: REVISION METADATA CARD (Clicked event details popup) --- */}
      {activeRevisionCardTask && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-[#0f172a] text-white rounded-3xl shadow-2xl border border-slate-800 max-w-md w-full overflow-hidden animate-scaleIn text-left">
            <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center space-x-2">
                <BookOpen size={18} className="text-blue-400 animate-pulse" />
                <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-display">複習資訊卡 / REVISION CARD</h3>
              </div>
              <button
                onClick={() => setActiveRevisionCardTask(null)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">筆記學科 / CATEGORY</span>
                <p className="text-sm font-extrabold font-sans text-slate-200">{activeRevisionCardTask.note_category}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">筆記主題 / TITLE</span>
                <p className="text-base font-extrabold font-sans text-white">{activeRevisionCardTask.note_title}</p>
              </div>

              {activeRevisionCardTask.note_content && (
                <div className="space-y-1">
                  <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">筆記要點摘要 / SUMMARY</span>
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl max-h-[100px] overflow-y-auto font-sans text-slate-300 leading-relaxed text-[11px]">
                    {activeRevisionCardTask.note_content}
                  </div>
                </div>
              )}

              <div className="h-px bg-slate-800" />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400">首次學日期 (New)</span>
                  <p className="text-slate-200 font-bold text-xs">{activeRevisionCardTask.note_first_date}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400">累計複習次數 (Repetitions)</span>
                  <p className="text-slate-200 font-bold text-xs">{activeRevisionCardTask.repetitions || 0} 次</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400">難易因子 (Ease Factor)</span>
                  <p className="text-slate-200 font-bold text-xs">{(activeRevisionCardTask.ease_factor || 2.5).toFixed(2)}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400">間隔天數 (Interval)</span>
                  <p className="text-slate-200 font-bold text-xs">{activeRevisionCardTask.interval_days || 0} 天</p>
                </div>
              </div>

              <div className="h-px bg-slate-800" />

              {/* Trajectory shift controls inside the Metadata Card */}
              <div className="space-y-2.5">
                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">
                  軌跡日程位移 / TRAJECTORY SHIFT
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleTrajectoryShift(activeRevisionCardTask.note_id, 1)}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 font-bold text-[10px] transition-all flex items-center justify-center space-x-1"
                  >
                    <ArrowRightLeft size={10} />
                    <span>延後 +1 天</span>
                  </button>
                  <button
                    onClick={() => handleTrajectoryShift(activeRevisionCardTask.note_id, 3)}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 font-bold text-[10px] transition-all flex items-center justify-center space-x-1"
                  >
                    <ArrowRightLeft size={10} />
                    <span>延後 +3 天</span>
                  </button>
                  <button
                    onClick={() => handleTrajectoryShift(activeRevisionCardTask.note_id, 7)}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 font-bold text-[10px] transition-all flex items-center justify-center space-x-1"
                  >
                    <ArrowRightLeft size={10} />
                    <span>延後 +7 天</span>
                  </button>
                </div>
              </div>

              <div className="h-px bg-slate-800 my-2" />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveRevisionCardTask(null)}
                  className="w-1/2 py-2.5 border border-slate-800 hover:bg-slate-900 text-slate-400 text-[11px] font-bold rounded-xl transition-all"
                >
                  關閉
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNote(activeRevisionCardTask.note_id)}
                  className="w-1/2 py-2.5 bg-rose-900/50 hover:bg-rose-900 text-rose-200 border border-rose-900/60 font-bold text-[11px] rounded-xl transition-all flex items-center justify-center space-x-1.5"
                >
                  <Trash2 size={12} />
                  <span>永久刪除主題</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

    </div>
  );
}

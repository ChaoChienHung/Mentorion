export interface Note {
  id: number;
  title: string;
  content: string;
  category: string;
  type: "new" | "practice";
  pattern: "A" | "B" | "C";
  created_at: string;
  first_date: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  completed_tasks?: number;
  pending_tasks?: number;
}

export interface Task {
  id: number;
  note_id: number;
  note_title: string;
  note_content: string;
  note_category: string;
  note_type: "new" | "practice";
  note_pattern: "A" | "B" | "C";
  note_first_date: string;
  type: "new" | "practice" | "revision";
  scheduled_date: string; // YYYY-MM-DD
  revision_number: number;
  time_start: string | null;
  time_end: string | null;
  is_completed: number; // 0 or 1
  completed_at: string | null;
  is_archived: number; // 0 or 1
  user_rating: number | null;
  gcal_event_id: string | null;
  ease_factor?: number;
  repetitions?: number;
  interval_days?: number;
}

export interface JournalEvent {
  id: number;
  type: "note_created" | "review_done" | "manual_review";
  title: string;
  remarks: string | null;
  event_date: string; // YYYY-MM-DD
  note_id: number | null;
  note_title?: string;
  created_at: string;
}

export interface CategoryStat {
  category: string;
  completed: number;
  uncompleted: number;
  total: number;
  timeSpentMinutes?: number;
}

export interface DailyPoints {
  scheduled_date: string;
  scheduled_points: number;
  completed_points: number;
}

export interface StatsResponse {
  totalCompletedNew: number;
  totalCompletedRevision: number;
  totalCompletedPractice: number;
  totalNotes: number;
  categories: CategoryStat[];
  overdueCount: number;
  deficitPoints: number;
  dailyPoints: DailyPoints[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

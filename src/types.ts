export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  level: string | null;
  display_order: number;
}

export interface Track {
  id: number;
  category_id: number;
  title: string;
  description: string | null;
  duration_ms: number | null;
  difficulty: string | null;
  created_at: string;
  updated_at: string;
}

export interface Segment {
  id: number;
  seq: number;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  text: string;
}

export interface Exercise {
  id: number;
  track_id: number;
  type: string;
  total_questions: number;
}

export interface UserSession {
  id: number;
  exercise_id: number;
  status: string;
  current_order: number;
  locked_start: number | null;
  locked_end: number | null;
  started_at: string;
}

export interface AudioToken {
  url: string;
  expires_in: number;
}

export interface BatchQuestion {
  id: number;
  order: number;
  total: number;
  display_order: number;
  audio_start_ms: number;
  audio_end_ms: number;
  type: string;
  display_text?: string;
  blank_count?: number;
  speaker?: string | null;
  is_question: boolean;
}

export interface BatchAnswerItem {
  question_id: number;
  blank_answers: string[];
}

export interface QuestionResult {
  question_id: number;
  is_correct: boolean;
  score: number;
  correct_text: string;
  user_input: string;
}

export interface BatchResult {
  results: QuestionResult[];
  all_correct: boolean;
}

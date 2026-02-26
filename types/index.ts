// ── Auth ─────────────────────────────────────────────────────────────────────

export interface Token {
  access_token: string;
  token_type: string;
}

export interface AuthUser {
  email: string;
  role: "company" | "admin";
  entity_id: string;
}

// ── Company ──────────────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  email: string;
  profile_url?: string | null;
  is_active: boolean;
  created_at?: string | null;
}

// ── Meeting ──────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  company_id: string;
  code: string;
  title: string;
  description?: string | null;
  expected_participants?: number | null;
  allowed_languages: string[];
  status: "active" | "ended";
  created_at?: string | null;
  ended_at?: string | null;
  host_name?: string;  // Company name for host display
}

export interface MeetingCreate {
  title: string;
  description?: string;
  expected_participants?: number;
  allowed_languages?: string[];
}

// ── Participant ──────────────────────────────────────────────────────────────

export interface Participant {
  id: string;
  meeting_id: string;
  name: string;
  preferred_language: string;
  profile_url?: string | null;
  joined_at?: string | null;
  left_at?: string | null;
  is_registered: boolean;
  auto_delete_at?: string | null;
}

export interface ParticipantCreate {
  meeting_id: string;
  name: string;
  preferred_language: string;
  profile_url?: string;
  is_registered?: boolean;
}

// ── Transcript ───────────────────────────────────────────────────────────────

export interface Transcript {
  id: string;
  meeting_id: string;
  speaker_id?: string | null;
  original_text: string;
  original_language: string;
  timestamp?: string | null;
}

// ── Translation ──────────────────────────────────────────────────────────────

export interface Translation {
  id: string;
  transcript_id: string;
  language: string;
  translated_text: string;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface Analytics {
  id: string;
  meeting_id: string;
  total_participants?: string | null;
  total_duration?: string | null;
  total_messages?: string | null;
  total_words?: string | null;
  language_distribution?: Record<string, number> | null;
}

// ── Summary ──────────────────────────────────────────────────────────────────

export interface Summary {
  id: string;
  meeting_id: string;
  language: string;
  summary_text: string;
  generated_at?: string | null;
}

// ── Agora ────────────────────────────────────────────────────────────────────

export interface AgoraTokenResponse {
  token: string;
  channel: string;
  uid: number;
  app_id: string;
  expires_in: number;
}

// ── WebSocket transcript message ──────────────────────────────────────────────

export interface TranscriptMessage {
  type: "transcript";
  speaker_id: string;
  speaker_name: string;
  original_text: string;
  original_language: string;
  translations: Record<string, string>;
  timestamp: string;
}

// ── Language options ──────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
];

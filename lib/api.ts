/**
 * Relay API client
 *
 * Thin fetch wrapper that:
 * - Prepends the backend base URL
 * - Attaches the JWT Bearer token from localStorage when present
 * - Throws on non-2xx responses with the server's error detail
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Token helpers ─────────────────────────────────────────────────────────────

export const TOKEN_KEY = "relay_access_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean; // default true — attach JWT if available
}

export async function apiFetch<T>(
  path: string,
  { body, auth = true, ...init }: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err.detail ?? JSON.stringify(err);
    } catch {
      // ignore parse errors
    }
    throw new Error(detail);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

import type { Token, AuthUser, Company } from "@/types";

export async function loginCompany(email: string, password: string): Promise<Token> {
  return apiFetch<Token>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export async function registerCompany(
  name: string,
  email: string,
  password: string
): Promise<Company> {
  return apiFetch<Company>("/auth/register", {
    method: "POST",
    body: { name, email, password },
    auth: false,
  });
}

export async function getMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me");
}

// ── Company endpoints ─────────────────────────────────────────────────────────

export async function getMyCompany(): Promise<Company> {
  return apiFetch<Company>("/companies/me");
}

// ── Meeting endpoints ─────────────────────────────────────────────────────────

import type { Meeting, MeetingCreate, AgoraTokenResponse } from "@/types";

export async function listMeetings(): Promise<Meeting[]> {
  return apiFetch<Meeting[]>("/meetings/");
}

export async function createMeeting(data: MeetingCreate): Promise<Meeting> {
  return apiFetch<Meeting>("/meetings/", { method: "POST", body: data });
}

export async function getMeeting(meetingId: string): Promise<Meeting> {
  return apiFetch<Meeting>(`/meetings/${meetingId}`);
}

export async function getMeetingByCode(code: string): Promise<Meeting> {
  return apiFetch<Meeting>(`/meetings/code/${code}`, { auth: false });
}

export async function endMeeting(meetingId: string): Promise<Meeting> {
  return apiFetch<Meeting>(`/meetings/${meetingId}/end`, { method: "POST" });
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  return apiFetch<void>(`/meetings/${meetingId}`, { method: "DELETE" });
}

export async function getAgoraToken(
  meetingId: string,
  uid: number = 0,
  role: "publisher" | "subscriber" = "publisher"
): Promise<AgoraTokenResponse> {
  return apiFetch<AgoraTokenResponse>(`/meetings/${meetingId}/agora-token`, {
    method: "POST",
    body: { uid, role },
    auth: false,
  });
}

// ── Participant endpoints ─────────────────────────────────────────────────────

import type { Participant, ParticipantCreate } from "@/types";

export async function joinMeeting(data: ParticipantCreate): Promise<Participant> {
  return apiFetch<Participant>("/participants/", {
    method: "POST",
    body: data,
    auth: false,
  });
}

export async function leaveMeeting(participantId: string): Promise<Participant> {
  return apiFetch<Participant>(`/participants/${participantId}/leave`, {
    method: "POST",
    auth: false,
  });
}

export async function listParticipants(meetingId: string): Promise<Participant[]> {
  return apiFetch<Participant[]>(`/participants/meeting/${meetingId}`, { auth: false });
}

// ── Analytics endpoints ───────────────────────────────────────────────────────

import type { Analytics } from "@/types";

export async function getMeetingAnalytics(meetingId: string): Promise<Analytics> {
  return apiFetch<Analytics>(`/analytics/meeting/${meetingId}`);
}

// ── Summary endpoints ─────────────────────────────────────────────────────────

import type { Summary } from "@/types";

export async function getMeetingSummaries(meetingId: string): Promise<Summary[]> {
  return apiFetch<Summary[]>(`/summaries/meeting/${meetingId}`);
}

// ── Transcript endpoints ──────────────────────────────────────────────────────

import type { Transcript } from "@/types";

export async function getMeetingTranscripts(meetingId: string): Promise<Transcript[]> {
  return apiFetch<Transcript[]>(`/transcripts/meeting/${meetingId}`);
}

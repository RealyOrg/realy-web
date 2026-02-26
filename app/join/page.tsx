"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getMeetingByCode, joinMeeting } from "@/lib/api";
import { SUPPORTED_LANGUAGES } from "@/types";
import type { Meeting, Participant } from "@/types";

function JoinPageContent() {
  const router = useRouter();
  // Get code from URL search params
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code") || "";

  const [step, setStep] = useState<"code" | "name" | "joining">(
    initialCode ? "name" : "code"
  );
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [name, setName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restreindre les langues proposées aux participants (fr, en, es)
  const PARTICIPANT_LANGUAGES = SUPPORTED_LANGUAGES.filter((lang) =>
    ["en", "fr", "es"].includes(lang.code)
  );

  // Pré-remplir nom + langue depuis le stockage local si disponible
  useEffect(() => {
    try {
      const storedName = window.localStorage.getItem("relay_participant_name");
      const storedLang = window.localStorage.getItem("relay_participant_language");
      if (storedName) {
        setName(storedName);
      }
      if (storedLang && ["en", "fr", "es"].includes(storedLang)) {
        setPreferredLanguage(storedLang);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Fetch meeting data if initialCode is present in URL
  useEffect(() => {
    if (!initialCode) return;
    setLoading(true);
    getMeetingByCode(initialCode.toUpperCase())
      .then((m) => {
        setMeeting(m);
        setStep("name");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Meeting not found");
        setStep("code");
      })
      .finally(() => setLoading(false));
  }, [initialCode]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const m = await getMeetingByCode(code);
      setMeeting(m);
      setStep("name");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Meeting not found");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meeting) return;
    setError(null);
    setLoading(true);
    try {
      // Mémoriser les préférences du participant côté navigateur
      try {
        window.localStorage.setItem("relay_participant_name", name);
        window.localStorage.setItem("relay_participant_language", preferredLanguage);
      } catch {
        // Ignore storage errors
      }

      const participant: Participant = await joinMeeting({
        meeting_id: meeting.id,
        name,
        preferred_language: preferredLanguage,
      });
      router.push(`/room/${meeting.code}?participantId=${participant.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join meeting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Join a Meeting</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enter the meeting code provided by the host
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {step === "code" && (
          <form onSubmit={handleLookup} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-gray-700"
              >
                Meeting Code
              </label>
              <input
                id="code"
                type="text"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-2xl font-mono tracking-widest focus:border-[#5048E5] focus:outline-none focus:ring-1 focus:ring-[#5048E5]"
                placeholder="ABC123"
                style={{ textTransform: "uppercase" }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full rounded-md bg-[#5048E5] px-4 py-2 font-medium text-white hover:bg-[#4338ca] focus:outline-none focus:ring-2 focus:ring-[#5048E5] focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? "Looking up..." : "Continue"}
            </button>
          </form>
        )}

        {step === "name" && meeting && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
              Meeting found: <strong>{meeting.title}</strong>
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Your Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-[#5048E5] focus:outline-none focus:ring-1 focus:ring-[#5048E5]"
                placeholder="Jean Pierre"
              />
            </div>

            <div>
              <label
                htmlFor="language"
                className="block text-sm font-medium text-gray-700"
              >
                Your Language
              </label>
              <select
                id="language"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-[#5048E5] focus:outline-none focus:ring-1 focus:ring-[#5048E5]"
              >
                {PARTICIPANT_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Transcripts will be translated into this language
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setStep("code");
                  setMeeting(null);
                }}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !name}
                className="flex-1 rounded-md bg-[#5048E5] px-4 py-2 font-medium text-white hover:bg-[#4338ca] focus:outline-none focus:ring-2 focus:ring-[#5048E5] focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? "Joining..." : "Join Meeting"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          Hosting a meeting?{" "}
          <Link
            href="/login"
            className="font-medium text-[#5048E5] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#5048E5] border-t-transparent" />
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}

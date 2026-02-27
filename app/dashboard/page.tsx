"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { listMeetings, createMeeting, endMeeting, deleteMeeting } from "@/lib/api";
import type { Meeting, MeetingCreate } from "@/types";
import { SUPPORTED_LANGUAGES } from "@/types";
import QRCodeModal from "@/components/QRCodeModal";

export default function DashboardPage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState<MeetingCreate>({
    title: "",
    description: "",
    expected_participants: undefined,
    allowed_languages: ["en", "fr", "es"],
  });
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [qrModalMeeting, setQrModalMeeting] = useState<Meeting | null>(null);

  // Load meetings
  useEffect(() => {
    if (isRedirecting) return;
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      loadMeetings();
    }
  }, [user, authLoading, router, isRedirecting]);

  const loadMeetings = async () => {
    try {
      const data = await listMeetings();
      setMeetings(data);
    } catch (err) {
      console.error("Failed to load meetings:", err);
      // If unauthorized, redirect to login
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
        setIsRedirecting(true);
        logout();
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    }
    setLoading(false);
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const meeting = await createMeeting(newMeeting);
      setMeetings([meeting, ...meetings]);
      setShowCreateModal(false);
      setNewMeeting({
        title: "",
        description: "",
        expected_participants: undefined,
        allowed_languages: ["en", "fr", "es"],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  };

  const handleEndMeeting = async (meetingId: string) => {
    try {
      const updated = await endMeeting(meetingId);
      setMeetings(meetings.map((m) => (m.id === meetingId ? updated : m)));
    } catch (err) {
      console.error("Failed to end session:", err);
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm("Are you sure you want to delete this meeting?")) return;
    try {
      await deleteMeeting(meetingId);
      setMeetings(meetings.filter((m) => m.id !== meetingId));
    } catch (err) {
      console.error("Failed to delete meeting:", err);
    }
  };

  const copyJoinLink = (code: string) => {
    const url = `${window.location.origin}/join?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  const firstName =
    (user?.email && user.email.split("@")[0]) || "there";

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="hidden w-60 border-r border-slate-200 bg-white/90 px-4 py-6 sm:flex sm:flex-col">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <span className="text-lg font-semibold">R</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Relay</span>
        </div>
        <nav className="space-y-1 text-sm">
          <button className="flex w-full items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 font-medium text-violet-700">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            Sessions
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            Team
          </button>
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            Settings
          </button>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Welcome back, {firstName}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Manage all your Relay sessions from one place.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-500"
            >
              <span className="text-base leading-none">＋</span>
              Create New Session
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6 gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Recent Sessions
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Sessions created from your company account.
                </p>
              </div>
              <div className="hidden items-center gap-3 text-xs text-slate-400 sm:flex">
                <span>
                  Showing {Math.min(meetings.length, 10)} of {meetings.length} sessions
                </span>
              </div>
            </div>

            {meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-12 text-center text-sm text-slate-500">
                <p>No sessions yet.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 rounded-md bg-violet-600 px-4 py-2 text-xs font-medium text-white hover:bg-violet-500"
                >
                  Create your first session
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        Session name
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        Status
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        Date
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                        Participants
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {meetings.map((meeting) => (
                      <tr key={meeting.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 align-middle">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">
                              {meeting.title || "Untitled session"}
                            </span>
                            {meeting.description && (
                              <span className="mt-1 text-xs text-slate-500">
                                {meeting.description}
                              </span>
                            )}
                            <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                              <span className="font-mono rounded bg-slate-100 px-1.5 py-0.5">
                                {meeting.code}
                              </span>
                              <button
                                onClick={() => copyJoinLink(meeting.code)}
                                className="text-[11px] text-violet-600 hover:underline"
                              >
                                {copiedCode === meeting.code
                                  ? "Link copied"
                                  : "Copy join link"}
                              </button>
                              <button
                                onClick={() => setQrModalMeeting(meeting)}
                                className="text-[11px] text-violet-600 hover:underline"
                              >
                                Show QR
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 align-middle">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              meeting.status === "active"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                                : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                            }`}
                          >
                            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />
                            {meeting.status === "active" ? "Active" : "Ended"}
                          </span>
                        </td>
                        <td className="px-5 py-3 align-middle text-xs text-slate-600">
                          {meeting.created_at
                            ? new Date(meeting.created_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-5 py-3 align-middle text-xs text-slate-600">
                          {typeof meeting.expected_participants === "number"
                            ? `${meeting.expected_participants} participant${
                                meeting.expected_participants > 1 ? "s" : ""
                              }`
                            : "—"}
                        </td>
                        <td className="px-5 py-3 align-middle">
                          <div className="flex justify-end gap-2 text-xs">
                            {meeting.status === "active" && (
                              <>
                                <Link
                                  href={`/room/${meeting.code}`}
                                  className="inline-flex items-center rounded-md bg-violet-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-violet-500"
                                >
                                  Start
                                </Link>
                                <button
                                  onClick={() => handleEndMeeting(meeting.id)}
                                  className="inline-flex items-center rounded-md bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                                >
                                  End
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleDeleteMeeting(meeting.id)}
                              className="inline-flex items-center rounded-md bg-red-50 px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">
              New session
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              Set up the title, description, and allowed languages for this session.
            </p>
            <form onSubmit={handleCreateMeeting} className="space-y-4">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={newMeeting.title}
                  onChange={(e) =>
                    setNewMeeting({ ...newMeeting, title: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  placeholder="Weekly team standup"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={newMeeting.description || ""}
                  onChange={(e) =>
                    setNewMeeting({ ...newMeeting, description: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Expected participants
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newMeeting.expected_participants || ""}
                    onChange={(e) =>
                      setNewMeeting({
                        ...newMeeting,
                        expected_participants: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Allowed languages
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          const current = newMeeting.allowed_languages || [];
                          const isSelected = current.includes(lang.code);
                          const updated = isSelected
                            ? current.filter((c) => c !== lang.code)
                            : [...current, lang.code];
                          setNewMeeting({
                            ...newMeeting,
                            allowed_languages: updated,
                          });
                        }}
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          newMeeting.allowed_languages?.includes(lang.code)
                            ? "bg-violet-600 text-white"
                            : "bg-zinc-100 text-slate-700"
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-violet-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-violet-500"
                >
                  Create session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={qrModalMeeting !== null}
        onClose={() => setQrModalMeeting(null)}
        meetingCode={qrModalMeeting?.code || ""}
        meetingTitle={qrModalMeeting?.title || ""}
      />
    </div>
  );
}

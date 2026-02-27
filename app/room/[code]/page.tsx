"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getMeetingByCode, getAgoraToken, leaveMeeting, getMyCompany, joinMeeting, listParticipants } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RelayWebSocket } from "@/lib/websocket";
import type { Meeting, Company, AgoraTokenResponse, TranscriptMessage } from "@/types";

// Dynamic import AgoraRTC to avoid SSR issues
let AgoraRTC: typeof import("agora-rtc-sdk-ng").default;

async function loadAgoraSDK() {
  if (!AgoraRTC) {
    const module = await import("agora-rtc-sdk-ng");
    AgoraRTC = module.default;
  }
  return AgoraRTC;
}

function RoomPageContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const resolvedParams = useRef<{ code: string } | null>(null);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [tokenData, setTokenData] = useState<AgoraTokenResponse | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [displayName, setDisplayName] = useState<string>("You");
  const [remoteUsers, setRemoteUsers] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [error, setError] = useState<string | null>(null);
  const [mediaPermission, setMediaPermission] = useState<"pending" | "granted" | "denied">("pending");
  const isMutedRef = useRef(isMuted);

  const wsRef = useRef<RelayWebSocket | null>(null);
  const agoraClientRef = useRef<any>(null);
  const localAudioTrackRef = useRef<any>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const participantIdRef = useRef<string | null>(null);
  const initialized = useRef(false);
  const transcriptsEndRef = useRef<HTMLDivElement | null>(null);
  // Keep a ref of the latest participantId for cleanup logic
  useEffect(() => {
    participantIdRef.current = participantId;
  }, [participantId]);

  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);
  // Resolve params
  useEffect(() => {
    params.then((p) => {
      resolvedParams.current = p;
    });
  }, [params]);

  // Check if user can join without authentication (has valid participantId)
  const participantIdFromUrl = searchParams.get("participantId");
  const canJoinWithoutAuth = !!participantIdFromUrl;

  // Redirect if not authenticated (and no participantId)
  useEffect(() => {
    if (!authLoading && !user && !canJoinWithoutAuth) {
      router.push("/login");
    }
  }, [user, authLoading, router, canJoinWithoutAuth]);

  // Initialize meeting + Agora + WebSocket
  useEffect(() => {
    // Prevent multiple initializations
    if (initialized.current) return;
    initialized.current = true;
    
    const init = async () => {
      const p = await params;
      const pid = searchParams.get("participantId");

      // Load meeting by code
      const m = await getMeetingByCode(p.code);
      setMeeting(m);

      // DEBUG: Log meeting details to help identify channel issues
      console.log("[Room] Meeting fetched:", { code: p.code, id: m.id, title: m.title, hostName: m.host_name });

      // Fetch participants list (for host to see participant names)
      try {
        const participantsList = await listParticipants(m.id);
        setParticipants(participantsList);
        console.log("[Room] Participants fetched:", participantsList);
      } catch (err) {
        console.warn("[Room] Failed to fetch participants:", err);
      }

      let participantIdToUse: string;

      if (pid) {
        // Participant joining via link - use the provided participant ID
        console.log("[Room] Participant joined with participantId:", pid);
        participantIdToUse = pid;
        setParticipantId(pid);
        setIsHost(false);
        // Get participant's name from localStorage (stored when they joined)
        const storedName = localStorage.getItem("relay_participant_name");
        setDisplayName(storedName || "Participant");
      } else if (user) {
        // Host joining from dashboard - create participant automatically
        console.log("[Room] Host joined (user detected)");
        // Get company info for host name
        let hostName = user.email;
        try {
          const c = await getMyCompany();
          setCompany(c);
          hostName = c.name;
        } catch {
          // If we can't get company, use email
          setCompany({ id: "", name: user.email, email: user.email, is_active: true } as Company);
        }

        // Create participant automatically for host
        const participant = await joinMeeting({
          meeting_id: m.id,
          name: hostName,
          preferred_language: "en",
          is_registered: true,
        });
        
        participantIdToUse = participant.id;
        setParticipantId(participant.id);
        setIsHost(true);
        setDisplayName(hostName);
      } else {
        setError("Please log in to start a meeting");
        return;
      }

      try {
        // Load Agora SDK dynamically (client-side only)
        const Agora = await loadAgoraSDK();
        
        // Request media permissions first
        setMediaPermission("pending");
        
        // Get Agora token
        const token = await getAgoraToken(m.id, 0, "publisher");
        
        // DEBUG: Log token details to help identify channel issues
        console.log("[Room] Token fetched:", { channel: token.channel, uid: token.uid, appId: token.app_id });
        
        setTokenData(token);

        // Create Agora client
        // Use "rtc" mode for meetings where everyone can speak (not "live" which is for broadcasting)
        const client = Agora.createClient({
          mode: "rtc",
          codec: "vp8",
        });
        agoraClientRef.current = client;

        // In rtc mode, everyone can publish/subscribe - no need to set client role

        // Join Agora channel
        try {
          console.log("[Room] Joining Agora:", {
            appId: token.app_id,
            channel: token.channel,
            uid: token.uid,
            isHost: isHost
          });
          await client.join(token.app_id, token.channel, token.token, token.uid);
          console.log("[Room] Successfully joined channel:", token.channel);
        } catch (e) {
          console.error("Failed to join channel:", e);
          setError("Failed to join meeting. Please try again.");
          return;
        }

        // Create and publish local audio track only (audio-only meeting)
        try {
          const audioTrack = await Agora.createMicrophoneAudioTrack({
            AEC: true,  // Acoustic Echo Cancellation
            AGC: true,  // Automatic Gain Control
            ANS: true,  // Automatic Noise Suppression
          });
          
          localAudioTrackRef.current = audioTrack;
          
          // Publish local audio track to channel (don't play locally - causes echo)
          await client.publish(audioTrack);
          
          // Set up Web Audio API for real-time audio level monitoring
          // Use the same media stream from Agora's audio track so visualization
          // works even if browser-level getUserMedia for STT fails.
          try {
            const mediaStreamTrack = audioTrack.getMediaStreamTrack();
            const agoraMediaStream = new MediaStream([mediaStreamTrack]);

            const AudioCtx =
              (window as any).AudioContext || (window as any).webkitAudioContext;
            const audioContext = new AudioCtx();

            if (audioContext.state === "suspended") {
              await audioContext.resume();
            }

            const source = audioContext.createMediaStreamSource(agoraMediaStream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
          } catch (vizErr) {
            console.error("Failed to set up audio visualization:", vizErr);
          }

          // Also (optionally) capture audio for WebSocket STT processing
          try {
            // Get local media stream for WebSocket audio transmission
            const mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            localMediaStreamRef.current = mediaStream;
            
            // Create MediaRecorder to capture audio chunks
            const mediaRecorder = new MediaRecorder(mediaStream, {
              mimeType: "audio/webm;codecs=opus",
            });
            mediaRecorder.ondataavailable = async (event) => {
              if (event.data.size > 0 && wsRef.current?.isConnected) {
                const arrayBuffer = await event.data.arrayBuffer();
                wsRef.current.sendAudioChunk(arrayBuffer);
              }
            };
            
            // Collect audio data every 2 seconds
            mediaRecorder.start(2000);
            mediaRecorderRef.current = mediaRecorder;
          } catch (captureErr) {
            console.error("Failed to set up audio capture for STT:", captureErr);
            // Continue anyway - STT won't work but meeting can continue
          }
          
          setMediaPermission("granted");
        } catch (mediaErr) {
          console.error("Failed to get microphone:", mediaErr);
          setMediaPermission("denied");
          // Continue without media - user can still see others
        }

        // Handle remote users joining
        client.on("user-published", async (remoteUser, mediaType) => {
          console.log("[Room] Remote user published:", { uid: remoteUser.uid, mediaType });
          try {
            await client.subscribe(remoteUser, mediaType);
            
            if (mediaType === "audio") {
              const remoteAudioTrack = remoteUser.audioTrack;
              if (remoteAudioTrack) {
                remoteAudioTrack.play();
              }
            }
            
            // Add to remote users list
            setRemoteUsers((prev) => {
              if (prev.find((u) => u.uid === remoteUser.uid)) return prev;
              return [...prev, remoteUser];
            });
          } catch (err) {
            console.warn("Failed to subscribe to remote user:", err);
          }
        });

        // Handle remote users leaving
        client.on("user-left", (remoteUser) => {
          console.log("[Room] Remote user left:", { uid: remoteUser.uid });
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== remoteUser.uid));
        });

        // Connect WebSocket for transcripts
        const ws = new RelayWebSocket(
          m.id,
          participantIdToUse,
          (msg) => {
            setTranscripts((prev) => [...prev, msg]);
          },
          (s) => {
            if (s === "open") setStatus("connected");
            else if (s === "closed") setStatus("disconnected");
          }
        );
        ws.connect();
        wsRef.current = ws;

        setStatus("connected");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join meeting");
      }
    };

    init();

    // Audio level monitoring - use Web Audio API analyser for local mic
    isMutedRef.current = isMuted;
    let isMounted = true;
    const audioLevelInterval = setInterval(() => {
      isMutedRef.current = isMuted;
      
      if (!isMounted) return;
      
      try {
        if (audioContextRef.current && !isMutedRef.current) {
          // Get real-time audio data from the microphone using Agora track
          if (localAudioTrackRef.current) {
            // Try to get volume directly from Agora track
            try {
              const volume = localAudioTrackRef.current.getVolumeLevel();
              if (typeof volume === 'number' && volume > 0) {
                const calculatedVolume = Math.min(100, Math.round(volume * 100 * 3));
                console.log("Audio level from Agora:", { volume, calculatedVolume });
                setAudioLevel(calculatedVolume);
                return;
              }
            } catch (e) {
              // getVolumeLevel not available, try analyser
            }
          }
          
          // Fallback: use Web Audio API analyser
          if (analyserRef.current) {
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            
            // Calculate average volume from frequency data
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const volume = Math.min(100, Math.round((average / 255) * 100 * 2));
            console.log("Audio level from analyser:", { average, volume });
            setAudioLevel(volume);
          } else {
            setAudioLevel(0);
          }
        } else {
          setAudioLevel(0);
        }
      } catch (e) {
        console.error("Audio level error:", e);
        setAudioLevel(0);
      }
    }, 100);

    return () => {
      isMounted = false;
      clearInterval(audioLevelInterval);
      
      // Stop MediaRecorder and release media stream
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (localMediaStreamRef.current) {
        localMediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Cleanup: disconnect WebSocket and leave Agora
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      
      // Leave Agora channel
      if (agoraClientRef.current) {
        const client = agoraClientRef.current;
        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
        }
        // Try to leave, but don't fail if already left
        client.leave().catch(() => {
          // Ignore errors when leaving - may already be disconnected
        });
      }
      
      // Leave meeting via API if we have a participantId
      const latestParticipantId = participantIdRef.current;
      if (latestParticipantId) {
        leaveMeeting(latestParticipantId).catch(() => {
          // Ignore errors when leaving meeting
        });
      }
      
      // For cleanup (page unload), we can't redirect - just clean up
      // The redirect on intentional leave is handled in handleLeave
    };
  }, [params, searchParams, user]);

  const toggleMute = async () => {
    if (localAudioTrackRef.current) {
      if (isMuted) {
        await localAudioTrackRef.current.setEnabled(true);
        isMutedRef.current = false;
        setIsMuted(false);
      } else {
        await localAudioTrackRef.current.setEnabled(false);
        isMutedRef.current = true;
        setIsMuted(true);
      }
    }
  };

  const handleLeave = async () => {
    // Stop MediaRecorder and release media stream
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (localMediaStreamRef.current) {
      localMediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Disconnect WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
    
    // Leave Agora
    if (agoraClientRef.current) {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
      }
      // Try to leave, ignore errors
      await agoraClientRef.current.leave().catch(() => {});
    }
    
    // Leave meeting via API
    const latestParticipantId = participantIdRef.current;
    if (latestParticipantId) {
      try {
        await leaveMeeting(latestParticipantId);
      } catch {
        // Ignore errors on leave
      }
    }
    
    // Redirect based on user type
    // Host goes to dashboard, participants go back to join page
    if (isHost) {
      router.push("/dashboard");
    } else {
      router.push("/join");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#5048E5] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg bg-red-50 p-6 text-red-600">
          <p className="font-medium">Error: {error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 text-sm underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (mediaPermission === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-lg bg-yellow-50 p-6 text-yellow-600 max-w-md">
          <p className="font-medium">Microphone Access Required</p>
          <p className="mt-2 text-sm">
            Please allow access to your microphone to join the meeting.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-[#5048E5] px-4 py-2 text-white"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
<div className="flex h-screen bg-gray-100 text-black flex-col md:flex-row">      {/* Left panel — Host / Audio */}
<div className="flex flex-col md:flex-1 h-auto md:h-full">        {/* Audio area */}
        <div className="p-2 md:p-4 md:flex-1">
        <div className="grid grid-cols-2 gap-2 md:gap-4 md:h-full">
            {/* LEFT: Host panel - shows the host or self */}
            <div className="relative rounded-lg bg-gray-200 overflow-hidden flex flex-col items-center justify-center">
              <div className="text-xs text-gray-500 mb-2">{isHost ? "HOST" : "YOU"}</div>
              {mediaPermission === "pending" ? (
                <div className="flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#5048E5] border-t-transparent" />
                  <span className="ml-2">Requesting microphone access...</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center">
                    {/* Audio level visualization */}
                    <div className="mb-4 flex h-20 items-end gap-1.5">
                      {Array.from({ length: 10 }).map((_, i) => {
                        const base = audioLevel;
                        const factor = 0.4 + (i / 9) * 0.8;
                        const height = Math.max(8, Math.min(100, base * factor));

                        return (
                          <div
                            key={i}
                            className="w-2 overflow-hidden rounded-full bg-gray-200"
                          >
                            <div
                              className={`w-full rounded-full bg-gradient-to-t from-[#5048E5] via-purple-400 to-pink-400 transition-all duration-100 ${
                                base > 0 ? "shadow-[0_0_8px_rgba(80,72,229,0.45)]" : ""
                              }`}
                              style={{ height: `${height}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div
                      className={`h-20 w-20 rounded-full flex items-center justify-center text-3xl border-4 ${
                        isMuted
                          ? "border-red-500 bg-red-100"
                          : audioLevel > 0
                          ? "border-blue-500 bg-blue-100 animate-pulse"
                          : "border-blue-500 bg-white"
                      }`}
                    >
                      <span className={isMuted ? "text-red-500" : "text-blue-500"}>
                        {isMuted ? "🔴" : "🎤"}
                      </span>
                    </div>
                    <div className="mt-4 rounded bg-gray-300 px-2 py-1 text-xs">
                      {displayName} {isHost && "(Host)"} {isMuted && "(Muted)"}
                    </div>
                    {audioLevel > 0 && !isMuted && (
                      <div className="mt-3 text-sm font-medium text-[#5048E5] animate-pulse">
                        🎙️ Speaking... {audioLevel}%
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {/* RIGHT: Participants panel - shows other participants */}
            <div className="rounded-lg bg-gray-200 flex flex-col items-center justify-center">
              <div className="text-xs text-gray-500 mb-2">PARTICIPANTS</div>
              {remoteUsers.length === 0 && participants.length <= 1 ? (
                <div className="text-gray-500">
                  Waiting for participants...
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 justify-center">
                  {/* Show other participants (excluding self) */}
                  {participants
                    .filter((p) => p.id !== participantId)
                    .map((p) => (
                      <div key={p.id} className="flex flex-col items-center">
                        <div className="h-12 w-12 md:h-20 md:w-20 rounded-full bg-white border-4 border-[#5048E5] flex items-center justify-center text-3xl">
                          🎤
                        </div>
                        <div className="mt-2 text-xs">{p.name}</div>
                      </div>
                    ))}
                  {/* Show remote Agora users */}
                  {remoteUsers.map((u) => (
                    <div key={u.uid} className="flex flex-col items-center">
                      <div className="h-12 w-12 md:h-20 md:w-20 rounded-full bg-white border-4 border-[#5048E5] flex items-center justify-center text-3xl">
                        🎤
                      </div>
                      <div className="mt-2 text-xs">Participant</div>
                    </div>
                  ))}
                </div>
              )}
              {/* Show host to participants */}
              {!isHost && meeting?.host_name && (
                <div className="mt-4 flex flex-col items-center">
                  <div className="h-12 w-12 md:h-20 md:w-20 rounded-full bg-white border-4 border-[#5048E5] flex items-center justify-center text-3xl">
                    🎤
                  </div>
                  <div className="mt-2 text-xs">{meeting.host_name} (Host)</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-center gap-4 p-4">
          <button
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isMuted ? "bg-red-500" : "bg-blue-500"
            } text-white hover:opacity-80`}
          >
            <span className="text-xl">{isMuted ? "🔴" : "🎤"}</span>
          </button>
          <button
            onClick={handleLeave}
            className="flex h-12 items-center justify-center rounded-full bg-red-500 px-6 text-white hover:opacity-80"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Right panel — Transcripts */}
      <div className="flex flex-1 md:w-96 md:flex-none flex-col border-t md:border-t-0 md:border-l border-gray-300 bg-white">
        {/* Header */}
        <div className="border-b border-gray-300 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Live Transcripts</h2>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
            </select>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "connected" ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
            {status === "connected" ? "Connected" : "Connecting..."}
          </div>
        </div>

        {/* Transcript list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {transcripts.length === 0 ? (
            <p className="text-center text-sm text-gray-500">
              Transcripts will appear here...
            </p>
          ) : (
            transcripts.map((t, i) => (
              <div key={i} className="rounded-lg bg-gray-200 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-black">{t.speaker_name}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{t.original_text}</p>
                {t.translations?.[selectedLanguage] && (
                  <p className="mt-1 text-sm font-medium text-black">
                    {t.translations?.[selectedLanguage]}
                  </p>
                )}
              </div>
            ))
            
          )}
          <div ref={transcriptsEndRef} />
        </div>
      </div>
    </div>
  );
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-100">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#5048E5] border-t-transparent" />
        </div>
      }
    >
      <RoomPageContent params={params} />
    </Suspense>
  );
}

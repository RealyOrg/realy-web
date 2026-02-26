/**
 * WebSocket client for the Relay transcript/translation stream.
 *
 * Connects to: ws://localhost:8000/ws/{meetingId}/{participantId}
 *
 * Incoming messages are JSON with shape TranscriptMessage.
 * Outgoing messages are binary audio chunks (ArrayBuffer / Blob).
 */

import type { TranscriptMessage } from "@/types";

const WS_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    .replace(/^http/, "ws");

export type TranscriptHandler = (msg: TranscriptMessage) => void;
export type StatusHandler = (status: "connecting" | "open" | "closed" | "error") => void;

export class RelayWebSocket {
  private ws: WebSocket | null = null;
  private meetingId: string;
  private participantId: string;
  private onTranscript: TranscriptHandler;
  private onStatus: StatusHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(
    meetingId: string,
    participantId: string,
    onTranscript: TranscriptHandler,
    onStatus: StatusHandler
  ) {
    this.meetingId = meetingId;
    this.participantId = participantId;
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = `${WS_BASE_URL}/ws/${this.meetingId}/${this.participantId}`;
    this.onStatus("connecting");
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.onStatus("open");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as TranscriptMessage;
        this.onTranscript(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    this.ws.onerror = () => {
      this.onStatus("error");
    };

    this.ws.onclose = () => {
      this.onStatus("closed");
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };
  }

  /**
   * Send a binary audio chunk to the backend for STT processing.
   */
  sendAudioChunk(chunk: ArrayBuffer | Blob): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  /**
   * Send a text message (used for testing / non-audio scenarios).
   */
  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

"use client";

import { useState } from "react";
import QRCode from "react-qr-code";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingCode: string;
  meetingTitle: string;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  meetingCode,
  meetingTitle,
}: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const joinUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/join?code=${meetingCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Title */}
        <h3 className="mb-4 text-center text-lg font-semibold text-gray-900">
          Join Meeting
        </h3>
        <p className="mb-4 text-center text-sm text-gray-500">
          {meetingTitle || "Meeting"}
        </p>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="rounded-lg bg-white p-4">
            <QRCode
              value={joinUrl}
              size={200}
              level={"H"}
            />
          </div>
        </div>

        {/* Join link */}
        <div className="mt-4">
          <p className="mb-1 text-xs text-gray-500">Or share this link:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-gray-100 px-3 py-2 text-xs font-mono text-gray-700">
              {joinUrl}
            </code>
            <button
              onClick={handleCopy}
              className={`rounded px-3 py-2 text-sm font-medium text-white ${
                copied ? "bg-green-600" : "bg-violet-600 hover:bg-violet-500"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

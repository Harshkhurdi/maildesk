"use client";
import { useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
export function GuestEntry({ name = "Guest" }: { name?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="button guest-entry-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/guest/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name }),
            });
            const data = await r.json();
            if (!r.ok) throw Error(data.error ?? "Guest signup failed.");
            window.location.assign("/");
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <UserRound size={17} />
        {busy ? "Opening guest workspace…" : "Continue as guest"}
        <ArrowRight size={15} />
      </button>
      {error && (
        <p role="alert" className="guest-entry-error">
          {error}
        </p>
      )}
    </>
  );
}

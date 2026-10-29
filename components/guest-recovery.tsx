"use client";
import { GuestEntry } from "./guest-entry";
import { useState } from "react";
import { download } from "@/lib/exporters";
export function GuestRecovery() {
  const [message, setMessage] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Your full guest workspace.</h1>
        <p>
          Start without an email or password. All five apps are available in
          your own workspace. Your guest access stays in this browser for 30
          days; download important files before signing out or clearing cookies.
          Email and calendar use your own Google account.
        </p>
        <GuestEntry />
        <p>
          Have work from the earlier guest editor? The backup below leaves it
          untouched.
        </p>
        <button
          className="button primary"
          onClick={() => {
            try {
              const raw = localStorage.getItem("maildesk.guest.v1");
              if (!raw)
                throw Error("No earlier guest data was found in this browser.");
              download(
                new Blob([raw], { type: "application/json" }),
                "maildesk-browser-backup.json",
              );
              setMessage(
                "Backup downloaded. Your browser data has not been changed.",
              );
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Download browser backup
        </button>
        {message && <p role="status">{message}</p>}
        <a className="button" href="/auth/sign-in">
          Sign in to MailDesk
        </a>
      </section>
    </main>
  );
}

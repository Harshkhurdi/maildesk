"use client";
import { useState } from "react";
import { download } from "@/lib/exporters";
export function GuestRecovery() {
  const [message, setMessage] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Your earlier work is kept.</h1>
        <p>
          Guest editing has been retired. Download a copy of the tasks, Office
          files and saved tools from this browser before moving to your private
          workspace.
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

"use client";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, ArrowRight, LayoutGrid, Cloud } from "lucide-react";
import { AppIcon } from "./office-brand";
import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
export default function SignIn({
  returnTo,
  signOut = false,
}: {
  returnTo: string;
  signOut?: boolean;
}) {
  const [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (sent) {
        const r = await authClient.signIn.emailOtp({ email, otp });
        if (r.error)
          throw Error(r.error.message || "This code could not be verified.");
        window.location.assign(returnTo);
      } else {
        const r = await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
        });
        if (r.error)
          throw Error(r.error.message || "Could not send your sign-in code.");
        setSent(true);
      }
    } catch (e) {
      setError(authErrorMessage((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page office-auth">
      <div className="office-auth-wrap">
        <section className="auth-card">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <LayoutGrid size={24} />
            </span>
            MailDesk
          </Link>
          <h1>{signOut ? "Sign out of MailDesk" : "Your work starts here."}</h1>
          <p>
            {signOut
              ? "Sign out of your private workspace on this device."
              : "One private workspace for documents, spreadsheets, presentations and email. Sign in to pick up where you left off."}
          </p>
          {error && (
            <div className="utility-notice utility-error" role="alert">
              {error}
            </div>
          )}
          {signOut ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await authClient.signOut();
                  if (r.error) throw Error(r.error.message);
                  window.location.assign("/auth/sign-in");
                } catch (e) {
                  setError(authErrorMessage((e as Error).message));
                  setBusy(false);
                }
              }}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <form onSubmit={submit}>
              <label>
                Email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  disabled={sent}
                  maxLength={254}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="you@example.com"
                />
              </label>
              {sent && (
                <>
                  <p>
                    A sign-in code has been sent to {email}. Check your inbox
                    and spam folder.
                  </p>
                  <label>
                    Verification code
                    <input
                      required
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </label>
                </>
              )}
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : sent
                    ? "Open my workspace"
                    : "Continue with email"}
                <ArrowRight size={14} />
              </button>
              {sent && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setSent(false);
                    setOtp("");
                  }}
                >
                  Use another email / request a new code
                </button>
              )}
            </form>
          )}
          {!signOut && (
            <>
              <a
                href="/guest"
                className="button"
                style={{
                  marginTop: 14,
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                Recover earlier browser data
                <ArrowRight size={14} />
              </a>
              <p className="utility-muted" style={{ marginTop: 10 }}>
                Download a backup of work saved in the earlier guest workspace.
              </p>
            </>
          )}
          <p className="utility-muted" style={{ marginTop: 25 }}>
            <ShieldCheck
              size={13}
              style={{ display: "inline", marginRight: 6 }}
            />
            Your files and conversations stay in your private workspace.
          </p>
        </section>
        <aside className="office-auth-showcase">
          <div className="office-auth-apps">
            {["document", "sheet", "slides", "outlook", "ai"].map((kind) => (
              <AppIcon key={kind} kind={kind} size={44} />
            ))}
          </div>
          <span className="office-auth-eyebrow">
            MAKE ROOM FOR YOUR BEST WORK
          </span>
          <h2>
            From the first idea
            <br />
            to the final <em>version.</em>
          </h2>
          <p>
            Write it. Work it out. Present it.
            <br />
            Everything you need, in one place.
          </p>
          <div className="office-auth-previews">
            <div className="auth-preview-paper">
              <AppIcon kind="document" size={32} />
              <span>Project report</span>
              <strong>
                Good ideas.
                <br />
                Great possibilities.
              </strong>
              <i />
              <i />
              <i />
              <div />
            </div>
            <div className="auth-preview-sheet">
              <AppIcon kind="sheet" size={30} />
              <strong>A clearer view.</strong>
              <div className="auth-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>Your numbers, working together.</span>
            </div>
            <div className="auth-preview-slide">
              <AppIcon kind="slides" size={28} />
              <strong>
                Make your
                <br />
                next move.
              </strong>
              <span>PROJECT UPDATE</span>
            </div>
          </div>
          <small>
            <Cloud size={15} /> Editing runs on your device. Your saved work
            stays with you.
          </small>
        </aside>
      </div>
      <footer className="office-auth-footer">
        MailDesk <span>Your private productivity workspace</span>
      </footer>
    </main>
  );
}

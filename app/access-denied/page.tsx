export default function AccessDenied() {
  return (
    <main style={{ maxWidth: 600, margin: "15vh auto", padding: 24 }}>
      <h1>Open your own workspace.</h1>
      <p>Sign in with email or continue as a guest to use all five apps.</p>
      <a href="/auth/sign-in">Sign in or start as guest</a>
    </main>
  );
}

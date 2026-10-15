export function authErrorMessage(message:string){
  if(/invalid (origin|domain)|origin (is )?not (allowed|trusted)|untrusted origin/i.test(message))return "This web address has not been approved for sign-in. Open https://maildesk-theta.vercel.app. If you are already there, the workspace administrator needs to register that address in the sign-in settings.";
  if(/invalid.*otp|invalid.*code|expired.*code|otp.*expired/i.test(message))return "That sign-in code is incorrect or expired. Use the latest code from your inbox, or request a new one.";
  return message;
}

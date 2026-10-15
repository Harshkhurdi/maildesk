import {redirect} from "next/navigation";
import {auth} from "@/lib/auth-server";
import {readSession} from "@/lib/session-reader";
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{const data=await readSession(()=>auth().getSession());const u=data?.user;if(!u?.email||u.emailVerified!==true)return null;return {userId:u.id,email:u.email,displayName:u.name||u.email,fullName:u.name||null};}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(user)return user;redirect(chatGPTSignInPath(returnTo));}
export function safeReturnPath(value:string){if(!value.startsWith("/")||value.startsWith("//"))return "/";try{const u=new URL(value,"https://app.local");if(u.origin!=="https://app.local"||/^\/(auth|api\/auth|signin-with-chatgpt|signout-with-chatgpt|callback)(\/|$)/.test(u.pathname))return "/";return u.pathname+u.search+u.hash;}catch{return "/";}}
export function chatGPTSignInPath(returnTo:string){return `/auth/sign-in?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;}
export function chatGPTSignOutPath(returnTo="/"){return `/auth/sign-out?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`;}

import SignIn from "@/components/sign-in";
import {safeReturnPath} from "@/app/chatgpt-auth";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{return_to?:string}>}){const p=await searchParams;return <SignIn returnTo={safeReturnPath(p.return_to??"/")}/>;}

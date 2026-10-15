type RuleMessage = { id: string; subject: string; body: string; sender: string; receivedAt: string; labels: string[] };
export function safeUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 4096) return null;
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}
export function gmailUrl(email: string, threadId: string) {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#all/${encodeURIComponent(threadId)}`;
}
export function latestText(body: string) {
  return body.split(/\n\s*(?:On .{5,160}wrote:|From:|_{5,}|-{2,}\s*Original Message)/i)[0].split("\n").filter(l => !l.trim().startsWith("> ")).join("\n");
}
export function explicitDue(text: string): string | null {
  const contextual = text.match(/(?:due|deadline|by|before|on|scheduled|interview)[^\n]{0,65}/ig)?.join(" ") ?? "";
  const iso = contextual.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  const named = contextual.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s-]+(20\d{2})\b/i);
  if (named) return validDate(+named[3], ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(named[2].slice(0,3).toLowerCase())+1, +named[1]);
  return null;
}
function validDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m-1 && dt.getUTCDate() === d ? dt.toISOString().slice(0,10) : null;
}
export function suggestTask(messages: RuleMessage[]) {
  const eligible = [...messages].filter(m => !m.labels.some(l => ["SPAM","TRASH","DRAFT"].includes(l))).sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt));
  const inbound = eligible.filter(m => !m.labels.includes("SENT"));
  const latest = inbound.at(-1);
  if (!latest) return null;
  const body = latestText(latest.body), text = `${latest.subject}\n${body}`;
  if (/\b(unfortunately|not selected|position (?:has been )?filled|application (?:was |has been )?rejected|no (?:further )?action (?:is )?required|request (?:is |has been )?closed|application (?:has been )?withdrawn)\b/i.test(text)) return null;
  const lines = body.split(/\n|(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
  const action = /\b(please|kindly)\s+(?:.{0,35}\s)?(send|submit|complete|confirm|provide|review|upload|fill|sign|attend|schedule|share|respond|reply|update)|\b(action required|response required|complete (?:your|the) (?:application|assessment|questionnaire)|confirm (?:your|the) (?:attendance|availability)|submit (?:your|the) (?:documents|application)|interview invitation)\b/i;
  const evidence = lines.find(l=>action.test(l)) ?? (action.test(latest.subject) ? latest.subject : null);
  if (!evidence) return null;
  if (/\b(unsubscribe|newsletter|sale ends|exclusive offer|shop now)\b/i.test(text) && !/\b(interview|application|questionnaire|purchase order|invoice|contract)\b/i.test(text)) return null;
  const sentAfter = eligible.some(m=>m.labels.includes("SENT") && m.receivedAt > latest.receivedAt);
  const due = explicitDue(text);
  const links = [...body.matchAll(/https?:\/\/[^\s<>"']+/g)].map(m=>safeUrl(m[0].replace(/[).,;]+$/, ""))).filter((v): v is string=>!!v);
  const taskUrl = links.find(link=>!/(unsubscribe|preferences|tracking|privacy|linkedin\.com\/company)/i.test(link)) ?? null;
  return { title: latest.subject.replace(/^(?:(?:re|fwd?):\s*)+/ig, "").slice(0,200) || "Review email action", sourceId: latest.id,
    evidence: evidence.slice(0,700), due, taskUrl,
    category: /\b(interview|application|recruit|assessment|candidate)\b/i.test(text) ? "application" : /\b(invoice|payment|quotation|purchase order)\b/i.test(text) ? "work" : "general",
    priority: /\b(urgent|immediate|final reminder)\b/i.test(text) ? "high" : "normal",
    reason: sentAfter ? "You replied after this request. Check whether it is complete or waiting on someone." : due ? "Action language and an explicit date found. Confirm the date and task status." : "Action language found. Due date and current status need your review.",
    replied: sentAfter };
}

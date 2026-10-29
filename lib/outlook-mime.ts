import { randomUUID } from "node:crypto";
import { emailAddresses, mailHeader } from "./outlook-policy.ts";
export type OutgoingMail = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { name: string; type: string; data: string }[];
};
const b64 = (bytes: Buffer) =>
  bytes
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
export function composeMime(from: string, mail: OutgoingMail, draft = false) {
  const to = emailAddresses(mail.to),
    cc = emailAddresses(mail.cc ?? ""),
    bcc = emailAddresses(mail.bcc ?? "");
  if (!draft && !to && !cc && !bcc)
    throw Error("Enter at least one recipient.");
  mailHeader(mail.subject);
  const subjectParts: string[] = [];
  let part = "";
  for (const character of mail.subject) {
    if (Buffer.byteLength(part + character) > 42) {
      subjectParts.push(part);
      part = character;
    } else part += character;
  }
  if (part) subjectParts.push(part);
  const subject = subjectParts
    .map((value) => `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`)
    .join("\r\n ");
  const boundary = "maildesk-" + randomUUID();
  const headers = [
    `From: ${emailAddresses(from, true)}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  if (mail.inReplyTo) {
    if (!/^<[^\s<>]+>$/.test(mailHeader(mail.inReplyTo)))
      throw Error("Invalid reply reference.");
    headers.push(`In-Reply-To: ${mail.inReplyTo}`);
  }
  if (mail.references)
    headers.push(`References: ${mailHeader(mail.references)}`);
  const parts = [
    headers.join("\r\n"),
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(Buffer.from(mail.html))}`,
  ];
  let total = Buffer.byteLength(mail.html);
  if (total > 650_000)
    throw Error(
      "This message and its attachments exceed the 650 KB sending limit.",
    );
  if ((mail.attachments?.length ?? 0) > 10)
    throw Error("Attach at most ten files.");
  for (const attachment of mail.attachments ?? []) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data))
      throw Error("Invalid attachment data.");
    const data = Buffer.from(attachment.data, "base64");
    total += data.length;
    if (total > 650_000)
      throw Error(
        "This message and its attachments exceed the 650 KB sending limit.",
      );
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(attachment.type))
      throw Error("Invalid attachment type.");
    mailHeader(attachment.name);
    parts.push(
      `--${boundary}\r\nContent-Type: ${attachment.type}\r\nContent-Disposition: attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.name)}\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(data)}`,
    );
  }
  parts.push(`--${boundary}--\r\n`);
  return Buffer.from(parts.join("\r\n\r\n")).toString("base64url");
}

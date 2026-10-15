import type {StoredMessage} from "../storage/db";
import type {ChatSettings} from "./settings";
import type {ChatMessageParam,ContentPart} from "../openrouter/types";
import {chatRequest} from "../chat-request";
import {requestFitsLimits} from "../../request-limits";

export type OutgoingChatRequest = {
  model: string;
  messages: ChatMessageParam[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

export function toChatParam(message: StoredMessage): ChatMessageParam {
  if (!message.attachments?.length) return {role:message.role,content:message.content};
  const parts: ContentPart[] = message.content ? [{type:"text",text:message.content}] : [];
  for (const attachment of message.attachments) {
    parts.push(attachment.kind === "image" ?
      {type:"image_url",image_url:{url:attachment.url}} :
      {type:"file",file:{filename:attachment.name,file_data:attachment.url}});
  }
  return {role:message.role,content:parts};
}

/** Builds the same exact payload for preflight and network transport. */
export function outgoingChatRequest(options: OutgoingChatRequest): OutgoingChatRequest {
  return {
    model:options.model,
    messages:options.messages,
    ...(options.jsonMode ? {jsonMode:true} : {}),
    ...(options.temperature !== undefined ? {temperature:options.temperature} : {}),
    ...(options.maxTokens !== undefined ? {maxTokens:options.maxTokens} : {}),
  };
}

export function conversationChatRequest(model: string, history: StoredMessage[], settings: ChatSettings) {
  return outgoingChatRequest({
    model,
    messages:[...(settings.systemPrompt.trim() ? [{role:"system" as const,content:settings.systemPrompt.trim()}] : []),...history.map(toChatParam)],
    temperature:settings.temperature,
    maxTokens:settings.maxTokens ?? undefined,
    jsonMode:settings.jsonMode,
  });
}

export function serializeChatRequest(options: OutgoingChatRequest): string {
  const payload = outgoingChatRequest(options), serialized = JSON.stringify(payload);
  if (!requestFitsLimits(serialized)) {
    throw Error("This chat's messages and attachments exceed the request limit. Remove attachments or shorten your message. If earlier messages are already large, start a new chat or edit an earlier message before sending again. Nothing has been removed from your chat.");
  }
  const result = chatRequest.safeParse(payload);
  if (!result.success) {
    if (payload.messages.length > 100) throw Error("This chat has reached the 100-message request limit, including its system instructions. Start a new chat or edit an earlier message before continuing. Nothing has been removed from your chat.");
    const textTooLong = payload.messages.some(message => typeof message.content === "string" ? message.content.length > 100000 : message.content.some(part => part.type === "text" && part.text.length > 100000));
    if (textTooLong) throw Error("A message or system instruction exceeds 100,000 characters. Shorten it, or edit the earlier message before continuing. Nothing has been removed from your chat.");
    throw Error("Check your model, message, settings, and attachments before sending. Your draft has been kept.");
  }
  return serialized;
}


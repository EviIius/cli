import type { ChatMessage } from "@relay/contracts";

export function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

export function normalizeMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: textContent(message.content),
    name: message.name,
    tool_call_id: message.toolCallId,
    tool_calls: message.toolCalls?.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }))
  }));
}

export async function providerFetch(url: string, init: RequestInit, timeoutMs = 60_000): Promise<unknown> {
  const response = await providerResponse(url, init, timeoutMs);
  const body = await response.json().catch(() => ({}));
  return body;
}

export class ProviderError extends Error { constructor(message: string, readonly status: number, readonly retryable: boolean) { super(message); this.name="ProviderError"; } }
export async function providerResponse(url: string, init: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) { const body=await response.text().catch(()=>""); throw new ProviderError(`Provider returned ${response.status}: ${body.slice(0,500)||response.statusText}`,response.status,response.status===429||response.status>=500); }
  return response;
}

export async function* parseSse(response: Response): AsyncGenerator<{ event?: string; data: string }> {
  if (!response.body) throw new Error("Provider returned no stream body");
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer="";
  while(true){const {done,value}=await reader.read(); if(done)break; buffer+=decoder.decode(value,{stream:true}); const frames=buffer.split("\n\n"); buffer=frames.pop()??""; for(const frame of frames){let event: string|undefined; const data:string[]=[]; for(const line of frame.split(/\r?\n/)){if(line.startsWith("event:"))event=line.slice(6).trim(); if(line.startsWith("data:"))data.push(line.slice(5).trimStart());} if(data.length)yield{event,data:data.join("\n")};}}
}

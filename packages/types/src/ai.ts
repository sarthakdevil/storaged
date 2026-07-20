// ─── AI / Chat types ──────────────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: MessageRole;
  content: string;
};

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export type ConversationWithMessages = Conversation & {
  messages: Message[];
};

/** Request body for POST /api/ai/chat */
export type ChatRequest = {
  /** Existing conversation to continue (optional — omit to start a new one) */
  conversationId?: string;
  messages: ChatMessage[];
  /** Override the AI model (optional) */
  model?: string;
};

/** Non-streaming response shape for POST /api/ai/chat */
export type ChatResponse = {
  conversationId: string;
  message: Message;
};

/** Request body for POST /api/ai/summarize */
export type SummarizeRequest = {
  /** Plain text content to summarize */
  content: string;
  /** Optional file name for better context */
  fileName?: string;
};

export type SummarizeResponse = {
  summary: string;
};

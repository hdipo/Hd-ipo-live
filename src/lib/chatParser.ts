import {
  BLUEPRINT_LIMITS,
  CHAT_SOURCE_LABELS,
  type ChatMessage,
  type ParsedTurn,
  type SavedChat,
  type SenderRole,
} from '../types/vault';

const USER_LABELS = new Set(['you', 'user', 'me', 'human', 'i', 'myself', 'prompt', 'question']);
const ASSISTANT_LABELS = new Set([
  'ai',
  'assistant',
  'chatgpt',
  'gemini',
  'claude',
  'bot',
  'model',
  'copilot',
  'answer',
  'response',
]);

function classifySpeaker(rawLabel: string): { sender: SenderRole; senderLabel: string } {
  const cleaned = rawLabel.trim().slice(0, BLUEPRINT_LIMITS.SENDER_LABEL_MAX);
  const lower = cleaned.toLowerCase();
  if (USER_LABELS.has(lower)) {
    return { sender: 'user', senderLabel: cleaned || 'You' };
  }
  if (ASSISTANT_LABELS.has(lower)) {
    return { sender: 'assistant', senderLabel: cleaned || 'Assistant' };
  }
  return { sender: 'other', senderLabel: cleaned || 'Participant' };
}

/**
 * Parses pasted temporary chat text into structured turns.
 * Recognizes patterns such as:
 * - "You: ..." / "AI: ..." / "Assistant: ..."
 * - "[11/18/26, 10:15 AM] Name: ..." (WhatsApp / messaging exports)
 * - "10:15 - Name: ..."
 * Falls back cleanly to a single preserved turn if no conversation headers exist.
 */
export function parseRawChatText(input: string): ParsedTurn[] {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const turns: ParsedTurn[] = [];

  // Pattern 1: Messaging export prefix like "[12/11/26, 10:30 PM] Name: text" or "12/11/26, 10:30 - Name: text"
  const timestampLineRegex =
    /^(?:\[?\d{1,4}[/-]\d{1,2}[/-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APMapm]{2})?\]?\s*(?:-|\u2013)?\s*)([^:\n]{1,40}):\s*(.*)$/;

  // Pattern 2: Speaker prefix like "You: text", "Assistant: text", "**You**: text", "ChatGPT said:"
  const speakerLineRegex =
    /^(?:\*{0,2}|#{1,3}\s*)?(You|User|Me|Human|AI|Assistant|ChatGPT|Gemini|Claude|Bot|Model|Copilot|Note)(?:\s+said)?(?:\*{0,2})\s*:\s*(.*)$/i;

  let currentTurn: ParsedTurn | null = null;
  let matchedExplicitSpeakers = 0;

  for (const line of lines) {
    const tsMatch = line.match(timestampLineRegex);
    if (tsMatch) {
      const [, rawSpeaker, firstLineContent] = tsMatch;
      const { sender, senderLabel } = classifySpeaker(rawSpeaker);
      if (currentTurn && currentTurn.content.trim()) {
        turns.push({ ...currentTurn, content: currentTurn.content.trim() });
      }
      currentTurn = {
        sender,
        senderLabel,
        content: firstLineContent || '',
      };
      matchedExplicitSpeakers++;
      continue;
    }

    const spMatch = line.match(speakerLineRegex);
    if (spMatch) {
      const [, rawSpeaker, firstLineContent] = spMatch;
      const { sender, senderLabel } = classifySpeaker(rawSpeaker);
      if (currentTurn && currentTurn.content.trim()) {
        turns.push({ ...currentTurn, content: currentTurn.content.trim() });
      }
      currentTurn = {
        sender,
        senderLabel,
        content: firstLineContent || '',
      };
      matchedExplicitSpeakers++;
      continue;
    }

    if (currentTurn) {
      currentTurn.content = currentTurn.content ? `${currentTurn.content}\n${line}` : line;
    } else {
      currentTurn = {
        sender: 'note',
        senderLabel: 'Saved Chat',
        content: line,
      };
    }
  }

  if (currentTurn && currentTurn.content.trim()) {
    turns.push({ ...currentTurn, content: currentTurn.content.trim() });
  }

  if (matchedExplicitSpeakers === 0 || turns.length === 0) {
    return [
      {
        sender: 'note',
        senderLabel: 'Saved Chat',
        content: normalized.slice(0, BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX),
      },
    ];
  }

  return turns
    .filter((t) => t.content.trim().length > 0)
    .slice(0, 200)
    .map((t) => ({
      sender: t.sender,
      senderLabel: t.senderLabel.slice(0, BLUEPRINT_LIMITS.SENDER_LABEL_MAX) || 'Message',
      content: t.content.slice(0, BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX),
    }));
}

export function deriveTitleFromText(text: string): string {
  const firstMeaningfulLine = text
    .split('\n')
    .map((l) => l.replace(/^(You|User|Me|AI|Assistant|ChatGPT|Gemini)\s*:\s*/i, '').trim())
    .find((l) => l.length > 0);

  if (!firstMeaningfulLine) return 'Saved Temporary Chat';
  const cleaned = firstMeaningfulLine.replace(/[#*_`]/g, '').trim();
  if (cleaned.length <= 68) return cleaned;
  return `${cleaned.slice(0, 65).trim()}...`;
}

export function buildRawSnapshot(turns: Pick<ChatMessage, 'senderLabel' | 'content'>[]): string {
  const joined = turns.map((t) => `${t.senderLabel}: ${t.content}`).join('\n\n');
  return joined.slice(0, BLUEPRINT_LIMITS.RAW_CONTENT_MAX);
}

export function formatChatAsMarkdown(chat: SavedChat, messages: ChatMessage[]): string {
  const lines: string[] = [
    `# ${chat.title}`,
    '',
    `- Source: ${CHAT_SOURCE_LABELS[chat.source]}`,
    `- Tags: ${chat.tags.length > 0 ? chat.tags.join(', ') : 'None'}`,
    `- Messages: ${messages.length}`,
  ];

  if (chat.notes.trim()) {
    lines.push('', '## Personal Notes', '', chat.notes.trim());
  }

  lines.push('', '## Conversation', '');

  for (const msg of messages) {
    lines.push(`### ${msg.senderLabel}`, '', msg.content, '');
  }

  return lines.join('\n');
}

export function formatChatAsText(chat: SavedChat, messages: ChatMessage[]): string {
  const header = [
    chat.title,
    `Source: ${CHAT_SOURCE_LABELS[chat.source]}`,
    chat.tags.length ? `Tags: ${chat.tags.join(', ')}` : null,
    chat.notes.trim() ? `Notes: ${chat.notes.trim()}` : null,
    '----------------------------------------',
  ]
    .filter(Boolean)
    .join('\n');

  const body = messages.map((m) => `${m.senderLabel}:\n${m.content}`).join('\n\n');
  return `${header}\n\n${body}\n`;
}

export function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

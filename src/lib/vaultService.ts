import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  BLUEPRINT_LIMITS,
  type ChatMessage,
  type ChatSource,
  type ChatStatus,
  type Folder,
  type FolderColor,
  type ParsedTurn,
  type SavedChat,
  type SenderRole,
} from '../types/vault';
import { buildRawSnapshot } from './chatParser';
import { db, handleFirestoreError, OperationType } from './firebase';

function makeSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`.slice(0, BLUEPRINT_LIMITS.ID_MAX);
}

export function sanitizeTags(rawTags: string[]): string[] {
  const unique = new Set<string>();
  for (const tag of rawTags) {
    const cleaned = tag.replace(/^#/, '').trim().slice(0, BLUEPRINT_LIMITS.TAG_MAX_LEN);
    if (cleaned.length > 0) {
      unique.add(cleaned);
    }
    if (unique.size >= BLUEPRINT_LIMITS.TAGS_MAX_COUNT) break;
  }
  return Array.from(unique);
}

export function subscribeToFolders(
  uid: string,
  onData: (folders: Folder[]) => void
): Unsubscribe {
  const path = 'folders';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: Folder[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          name: data.name,
          color: data.color,
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      items.sort((a, b) => a.name.localeCompare(b.name));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToChats(
  uid: string,
  onData: (chats: SavedChat[]) => void
): Unsubscribe {
  const path = 'chats';
  const q = query(collection(db, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedChat[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          title: data.title,
          source: data.source,
          folderId: data.folderId ?? '',
          rawContent: data.rawContent ?? '',
          notes: data.notes ?? '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
          isPinned: Boolean(data.isPinned),
          status: data.status === 'archived' ? 'archived' : 'active',
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToChatMessages(
  uid: string,
  chatId: string,
  onData: (messages: ChatMessage[]) => void
): Unsubscribe {
  const path = `chats/${chatId}/messages`;
  const q = query(collection(db, 'chats', chatId, 'messages'), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ChatMessage[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: data.ownerId,
          chatId: data.chatId,
          sender: data.sender,
          senderLabel: data.senderLabel,
          content: data.content,
          orderIndex: typeof data.orderIndex === 'number' ? data.orderIndex : 0,
          isStarred: Boolean(data.isStarred),
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      items.sort((a, b) => a.orderIndex - b.orderIndex);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function createFolder(
  uid: string,
  name: string,
  color: FolderColor
): Promise<string> {
  const trimmedName = name.trim().slice(0, BLUEPRINT_LIMITS.FOLDER_NAME_MAX);
  if (!trimmedName) throw new Error('Folder name is required.');

  const folderId = makeSafeId('fld');
  const path = `folders/${folderId}`;
  try {
    await setDoc(doc(db, 'folders', folderId), {
      ownerId: uid,
      name: trimmedName,
      color,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return folderId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFolder(
  folderId: string,
  name: string,
  color: FolderColor
): Promise<void> {
  const trimmedName = name.trim().slice(0, BLUEPRINT_LIMITS.FOLDER_NAME_MAX);
  if (!trimmedName) throw new Error('Folder name is required.');

  const path = `folders/${folderId}`;
  try {
    await updateDoc(doc(db, 'folders', folderId), {
      name: trimmedName,
      color,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFolderAndUnassignChats(
  uid: string,
  folderId: string,
  chatsInFolder: SavedChat[]
): Promise<void> {
  const path = `folders/${folderId}`;
  try {
    const batch = writeBatch(db);
    for (const chat of chatsInFolder) {
      if (chat.ownerId === uid && chat.folderId === folderId) {
        batch.update(doc(db, 'chats', chat.id), {
          folderId: '',
          updatedAt: serverTimestamp(),
        });
      }
    }
    batch.delete(doc(db, 'folders', folderId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface CreateSavedChatInput {
  title: string;
  source: ChatSource;
  folderId: string;
  notes: string;
  tags: string[];
  turns: ParsedTurn[];
  isPinned?: boolean;
}

export async function createSavedChat(
  uid: string,
  input: CreateSavedChatInput
): Promise<string> {
  const cleanTitle = input.title.trim().slice(0, BLUEPRINT_LIMITS.CHAT_TITLE_MAX) || 'Saved Chat';
  const cleanNotes = input.notes.trim().slice(0, BLUEPRINT_LIMITS.NOTES_MAX);
  const cleanTags = sanitizeTags(input.tags);
  const cleanTurns = input.turns
    .map((t) => ({
      sender: t.sender,
      senderLabel:
        t.senderLabel.trim().slice(0, BLUEPRINT_LIMITS.SENDER_LABEL_MAX) || 'Message',
      content: t.content.trim().slice(0, BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX),
    }))
    .filter((t) => t.content.length > 0)
    .slice(0, 450);

  if (cleanTurns.length === 0) {
    throw new Error('Please provide chat content to save.');
  }

  const chatId = makeSafeId('chat');
  const path = `chats/${chatId}`;
  const rawContent = buildRawSnapshot(cleanTurns);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId), {
      ownerId: uid,
      title: cleanTitle,
      source: input.source,
      folderId: input.folderId || '',
      rawContent,
      notes: cleanNotes,
      tags: cleanTags,
      messageCount: cleanTurns.length,
      isPinned: Boolean(input.isPinned),
      status: 'active' as ChatStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    cleanTurns.forEach((turn, idx) => {
      const msgId = makeSafeId(`msg${idx}`);
      batch.set(doc(db, 'chats', chatId, 'messages', msgId), {
        ownerId: uid,
        chatId,
        sender: turn.sender,
        senderLabel: turn.senderLabel,
        content: turn.content,
        orderIndex: idx,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateSavedChatMeta(
  chatId: string,
  updates: {
    title: string;
    source: ChatSource;
    folderId: string;
    notes: string;
    tags: string[];
  }
): Promise<void> {
  const path = `chats/${chatId}`;
  const cleanTitle = updates.title.trim().slice(0, BLUEPRINT_LIMITS.CHAT_TITLE_MAX);
  if (!cleanTitle) throw new Error('Title cannot be empty.');

  try {
    await updateDoc(doc(db, 'chats', chatId), {
      title: cleanTitle,
      source: updates.source,
      folderId: updates.folderId || '',
      notes: updates.notes.trim().slice(0, BLUEPRINT_LIMITS.NOTES_MAX),
      tags: sanitizeTags(updates.tags),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleChatPin(chatId: string, nextPinned: boolean): Promise<void> {
  const path = `chats/${chatId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      isPinned: nextPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setChatStatus(chatId: string, nextStatus: ChatStatus): Promise<void> {
  const path = `chats/${chatId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function appendMessageToChat(
  uid: string,
  chat: SavedChat,
  existingMessages: ChatMessage[],
  turn: { sender: SenderRole; senderLabel: string; content: string }
): Promise<void> {
  const cleanContent = turn.content.trim().slice(0, BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX);
  if (!cleanContent) return;

  const cleanLabel =
    turn.senderLabel.trim().slice(0, BLUEPRINT_LIMITS.SENDER_LABEL_MAX) || 'Message';
  const nextIndex =
    existingMessages.length > 0
      ? Math.max(...existingMessages.map((m) => m.orderIndex)) + 1
      : 0;
  const msgId = makeSafeId(`msg${nextIndex}`);
  const path = `chats/${chat.id}/messages/${msgId}`;

  const nextTurns = [
    ...existingMessages.map((m) => ({ senderLabel: m.senderLabel, content: m.content })),
    { senderLabel: cleanLabel, content: cleanContent },
  ];

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chat.id, 'messages', msgId), {
      ownerId: uid,
      chatId: chat.id,
      sender: turn.sender,
      senderLabel: cleanLabel,
      content: cleanContent,
      orderIndex: nextIndex,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chats', chat.id), {
      rawContent: buildRawSnapshot(nextTurns),
      messageCount: nextTurns.length,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMessageContent(
  chat: SavedChat,
  existingMessages: ChatMessage[],
  messageId: string,
  updates: { sender: SenderRole; senderLabel: string; content: string }
): Promise<void> {
  const cleanContent = updates.content.trim().slice(0, BLUEPRINT_LIMITS.MESSAGE_CONTENT_MAX);
  if (!cleanContent) return;

  const cleanLabel =
    updates.senderLabel.trim().slice(0, BLUEPRINT_LIMITS.SENDER_LABEL_MAX) || 'Message';
  const path = `chats/${chat.id}/messages/${messageId}`;

  const nextTurns = existingMessages.map((m) =>
    m.id === messageId
      ? { senderLabel: cleanLabel, content: cleanContent }
      : { senderLabel: m.senderLabel, content: m.content }
  );

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'chats', chat.id, 'messages', messageId), {
      sender: updates.sender,
      senderLabel: cleanLabel,
      content: cleanContent,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chats', chat.id), {
      rawContent: buildRawSnapshot(nextTurns),
      messageCount: nextTurns.length,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMessageFromChat(
  chat: SavedChat,
  existingMessages: ChatMessage[],
  messageId: string
): Promise<void> {
  const path = `chats/${chat.id}/messages/${messageId}`;
  const remaining = existingMessages.filter((m) => m.id !== messageId);

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'chats', chat.id, 'messages', messageId));
    batch.update(doc(db, 'chats', chat.id), {
      rawContent: buildRawSnapshot(remaining),
      messageCount: remaining.length,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteSavedChatWithMessages(uid: string, chatId: string): Promise<void> {
  const path = `chats/${chatId}`;
  try {
    const msgSnap = await getDocs(
      query(collection(db, 'chats', chatId, 'messages'), where('ownerId', '==', uid))
    );
    const docsToDelete = msgSnap.docs;

    // Firestore writeBatch limit is 500 ops; chunk cleanly if needed
    const chunkSize = 400;
    for (let i = 0; i < docsToDelete.length; i += chunkSize) {
      const batch = writeBatch(db);
      const slice = docsToDelete.slice(i, i + chunkSize);
      for (const msgDoc of slice) {
        batch.delete(msgDoc.ref);
      }
      if (i + chunkSize >= docsToDelete.length) {
        batch.delete(doc(db, 'chats', chatId));
      }
      await batch.commit();
    }

    if (docsToDelete.length === 0) {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'chats', chatId));
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleMessageStar(
  chatId: string,
  messageId: string,
  nextStarred: boolean
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      isStarred: nextStarred,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bulkMoveChatsToFolder(
  chatIds: string[],
  targetFolderId: string
): Promise<void> {
  if (chatIds.length === 0) return;
  const path = 'chats';
  try {
    const batch = writeBatch(db);
    for (const chatId of chatIds.slice(0, 400)) {
      batch.update(doc(db, 'chats', chatId), {
        folderId: targetFolderId || '',
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bulkSetChatsStatus(
  chatIds: string[],
  nextStatus: ChatStatus
): Promise<void> {
  if (chatIds.length === 0) return;
  const path = 'chats';
  try {
    const batch = writeBatch(db);
    for (const chatId of chatIds.slice(0, 400)) {
      batch.update(doc(db, 'chats', chatId), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function bulkDeleteChats(uid: string, chatIds: string[]): Promise<void> {
  for (const chatId of chatIds) {
    await deleteSavedChatWithMessages(uid, chatId);
  }
}

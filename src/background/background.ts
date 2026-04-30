/**
 * background.ts — Service worker for the Bookmark Memory extension.
 * Handles bookmark syncing, context menu registration, and message routing.
 */

import {
  upsertBookmark,
  deleteBookmark,
  upsertNote,
  getAllBookmarks,
  setMeta,
  getMeta,
  getStats,
  type BookmarkEntry,
  type NoteEntry,
} from '../lib/vectorDb';
import { generateEmbedding, type EmbeddingConfig } from '../lib/embeddings';
import { chat, testConnection, type AIConfig, type ChatMessage } from '../lib/aiProvider';

// ─── Helpers ────────────────────────────────────────────────────────

async function getEmbeddingConfig(): Promise<EmbeddingConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['aiProvider', 'geminiApiKey', 'ollamaEmbedModel', 'embeddingProvider'],
      (result: any) => {
        const provider = result.embeddingProvider ?? result.aiProvider ?? 'local';
        resolve({
          provider: provider === 'ollama' ? 'ollama' : provider === 'gemini' ? 'gemini' : 'local',
          geminiApiKey: result.geminiApiKey,
          ollamaModel: result.ollamaEmbedModel ?? 'nomic-embed-text',
        });
      },
    );
  });
}

async function getAIConfig(): Promise<AIConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['aiProvider', 'geminiApiKey', 'geminiModel', 'ollamaModel', 'ollamaEmbedModel', 'embeddingProvider'],
      (result: any) => {
        const embeddingConfig: EmbeddingConfig = {
          provider: result.embeddingProvider ?? result.aiProvider ?? 'local',
          geminiApiKey: result.geminiApiKey,
          ollamaModel: result.ollamaEmbedModel ?? 'nomic-embed-text',
        };
        resolve({
          provider: result.aiProvider ?? 'gemini',
          geminiApiKey: result.geminiApiKey,
          geminiModel: result.geminiModel ?? 'gemini-flash-latest',
          ollamaModel: result.ollamaModel ?? 'llama3.2',
          embeddingConfig,
        });
      },
    );
  });
}

// ─── Bookmark Sync ──────────────────────────────────────────────────

function getFolderPath(
  nodeId: string,
  tree: chrome.bookmarks.BookmarkTreeNode[],
): string {
  const pathMap = new Map<string, string>();

  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], path: string) {
    for (const node of nodes) {
      const currentPath = path ? `${path}/${node.title}` : node.title;
      pathMap.set(node.id, currentPath);
      if (node.children) walk(node.children, currentPath);
    }
  }

  walk(tree, '');
  return pathMap.get(nodeId) ?? '';
}

async function indexBookmark(
  node: chrome.bookmarks.BookmarkTreeNode,
  folderPath: string,
  embeddingConfig: EmbeddingConfig,
): Promise<void> {
  if (!node.url) return; // skip folders

  const textForEmbedding = `${node.title} ${node.url} ${folderPath}`;
  const embedding = await generateEmbedding(textForEmbedding, embeddingConfig);

  const entry: BookmarkEntry = {
    id: node.id,
    url: node.url,
    title: node.title ?? '',
    folderPath,
    embedding,
    dateAdded: node.dateAdded ?? Date.now(),
    tags: [],
  };

  await upsertBookmark(entry);
}

async function fullSync(): Promise<number> {
  const embeddingConfig = await getEmbeddingConfig();
  const tree = await chrome.bookmarks.getTree();
  let count = 0;

  async function walk(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    path: string,
  ) {
    for (const node of nodes) {
      const currentPath = path ? `${path}/${node.title}` : node.title;
      if (node.url) {
        try {
          await indexBookmark(node, currentPath, embeddingConfig);
          count++;
        } catch (err) {
          console.warn(`[BookmarkMemory] Failed to index ${node.url}:`, err);
        }
      }
      if (node.children) await walk(node.children, currentPath);
    }
  }

  await walk(tree, '');
  await setMeta('lastFullSync', Date.now());
  await setMeta('indexedCount', count);
  return count;
}

// ─── Context Menu ───────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-note',
    title: '💾 Save to Bookmark Memory',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'save-note-important',
    title: '⭐ Save as Important Note',
    contexts: ['selection'],
  });

  // Open side panel on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Initial sync on install
  fullSync().then((count) => {
    console.log(`[BookmarkMemory] Initial sync complete: ${count} bookmarks indexed`);
  });
});

// ─── Context Menu Handler ───────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab?.url) return;

  const embeddingConfig = await getEmbeddingConfig();
  const text = info.selectionText.trim();
  const embedding = await generateEmbedding(text, embeddingConfig);

  const note: NoteEntry = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    url: tab.url,
    pageTitle: tab.title ?? '',
    embedding,
    dateAdded: Date.now(),
    tags: info.menuItemId === 'save-note-important' ? ['important'] : [],
    color: info.menuItemId === 'save-note-important' ? '#FFD700' : undefined,
  };

  await upsertNote(note);

  // Notify content script to show confirmation
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'NOTE_SAVED',
      note: { text: note.text, id: note.id },
    }).catch(() => {});
  }
});

// ─── Bookmark Change Listeners ──────────────────────────────────────

chrome.bookmarks.onCreated.addListener(async (_id, node) => {
  if (!node.url) return;
  try {
    const embeddingConfig = await getEmbeddingConfig();
    const tree = await chrome.bookmarks.getTree();
    const folder = getFolderPath(node.parentId ?? '', tree);
    await indexBookmark(node, folder, embeddingConfig);
    console.log(`[BookmarkMemory] Indexed new bookmark: ${node.title}`);
  } catch (err) {
    console.warn('[BookmarkMemory] Failed to index new bookmark:', err);
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  try {
    const [node] = await chrome.bookmarks.get(id);
    if (!node.url) return;
    const embeddingConfig = await getEmbeddingConfig();
    const tree = await chrome.bookmarks.getTree();
    const folder = getFolderPath(node.parentId ?? '', tree);
    await indexBookmark(node, folder, embeddingConfig);
  } catch (err) {
    console.warn('[BookmarkMemory] Failed to update bookmark:', err);
  }
});

chrome.bookmarks.onRemoved.addListener(async (id) => {
  try {
    await deleteBookmark(id);
  } catch (err) {
    console.warn('[BookmarkMemory] Failed to remove bookmark:', err);
  }
});

// ─── Message Handler ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'CHAT': {
        const config = await getAIConfig();
        const result = await chat(message.messages as ChatMessage[], config);
        return result;
      }

      case 'SAVE_NOTE': {
        const embeddingConfig = await getEmbeddingConfig();
        const embedding = await generateEmbedding(message.note.text, embeddingConfig);
        const note: NoteEntry = {
          ...message.note,
          id: message.note.id ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          embedding,
          dateAdded: message.note.dateAdded ?? Date.now(),
          tags: message.note.tags ?? [],
        };
        await upsertNote(note);
        return { success: true, id: note.id };
      }

      case 'FULL_SYNC': {
        const count = await fullSync();
        return { success: true, count };
      }

      case 'GET_STATS': {
        const stats = await getStats();
        const lastSync = await getMeta('lastFullSync');
        return { ...stats, lastSync };
      }

      case 'TEST_CONNECTION': {
        const config = await getAIConfig();
        return await testConnection(config);
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handler().then(sendResponse).catch((err) => {
    sendResponse({ error: err instanceof Error ? err.message : String(err) });
  });

  return true; // keep channel open for async response
});

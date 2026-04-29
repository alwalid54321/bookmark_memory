/**
 * aiProvider.ts — Unified RAG interface for Gemini and Ollama.
 * Retrieves relevant context from the vector store, builds an augmented
 * prompt, and streams the AI response.
 */

import { searchSimilar, type SearchResult, type BookmarkEntry, type NoteEntry } from './vectorDb';
import { generateEmbedding, type EmbeddingConfig } from './embeddings';

// ─── Types ──────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'ollama';

export interface AIConfig {
  provider: AIProvider;
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaModel?: string;
  embeddingConfig: EmbeddingConfig;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  timestamp: number;
}

// ─── System Prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Bookmark Memory, an intelligent assistant that helps users find information from their saved bookmarks and highlighted notes. You have access to the user's personal collection of web bookmarks and text notes they've saved from websites.

When answering questions:
- Search through the provided context of bookmarks and notes to find relevant information
- Always cite the source (bookmark title + URL, or note text + source page) when referencing saved content
- If you find matching content, present it clearly with the source
- If no relevant content is found in the context, let the user know honestly
- Be conversational and helpful
- If the user asks about a topic, look for bookmarks or notes that relate to that topic
- Format URLs as clickable links when possible

You are privacy-focused: all data stays on the user's device.`;

// ─── Context Builder ────────────────────────────────────────────────

function buildContext(results: SearchResult[]): string {
  if (results.length === 0) {
    return '\n[No relevant bookmarks or notes found in your collection.]\n';
  }

  let context = '\n--- Your Saved Content (most relevant first) ---\n\n';

  for (const r of results) {
    const relevance = (r.score * 100).toFixed(0);
    if (r.type === 'bookmark') {
      const bm = r.item as BookmarkEntry;
      context += `📌 BOOKMARK [${relevance}% match]\n`;
      context += `   Title: ${bm.title}\n`;
      context += `   URL: ${bm.url}\n`;
      context += `   Folder: ${bm.folderPath}\n`;
      if (bm.tags.length > 0) context += `   Tags: ${bm.tags.join(', ')}\n`;
      if (bm.summary) context += `   Summary: ${bm.summary}\n`;
      context += '\n';
    } else {
      const note = r.item as NoteEntry;
      context += `📝 NOTE [${relevance}% match]\n`;
      context += `   Text: "${note.text}"\n`;
      context += `   From: ${note.pageTitle} (${note.url})\n`;
      if (note.tags.length > 0) context += `   Tags: ${note.tags.join(', ')}\n`;
      context += '\n';
    }
  }

  context += '--- End of saved content ---\n';
  return context;
}

// ─── Gemini API ─────────────────────────────────────────────────────

async function queryGemini(
  messages: ChatMessage[],
  context: string,
  apiKey: string,
  model: string = 'gemini-2.0-flash',
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  // Inject context into the last user message
  const lastUserIdx = contents.length - 1;
  if (lastUserIdx >= 0) {
    contents[lastUserIdx].parts[0].text =
      `${context}\n\nUser question: ${contents[lastUserIdx].parts[0].text}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response generated.';
}

// ─── Ollama API ─────────────────────────────────────────────────────

async function queryOllama(
  messages: ChatMessage[],
  context: string,
  model: string = 'llama3.2',
): Promise<string> {
  const ollamaMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const m of messages) {
    let content = m.content;
    // Inject context into the last user message
    if (m === messages[messages.length - 1] && m.role === 'user') {
      content = `${context}\n\nUser question: ${content}`;
    }
    ollamaMessages.push({ role: m.role, content });
  }

  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 2048,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = await response.json();
  return data.message?.content ?? 'No response generated.';
}

// ─── Public RAG Interface ───────────────────────────────────────────

export async function chat(
  messages: ChatMessage[],
  config: AIConfig,
): Promise<{ reply: string; sources: SearchResult[] }> {
  // 1. Get the latest user message
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error('Last message must be from user');
  }

  // 2. Generate embedding for the query
  const queryEmbedding = await generateEmbedding(lastMessage.content, config.embeddingConfig);

  // 3. Retrieve relevant context from vector store
  const results = await searchSimilar(queryEmbedding, 8, 0.15);

  // 4. Build context string
  const context = buildContext(results);

  // 5. Query the AI provider
  let reply: string;

  try {
    switch (config.provider) {
      case 'gemini':
        if (!config.geminiApiKey) throw new Error('No Gemini API key configured');
        reply = await queryGemini(messages, context, config.geminiApiKey, config.geminiModel);
        break;

      case 'ollama':
        reply = await queryOllama(messages, context, config.ollamaModel ?? 'llama3.2');
        break;

      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    reply = `⚠️ AI request failed: ${errorMsg}\n\nHere's what I found in your saved content:\n${context}`;
  }

  return { reply, sources: results };
}

/**
 * Test connection to the configured AI provider.
 */
export async function testConnection(config: AIConfig): Promise<{ success: boolean; message: string }> {
  try {
    const testMessages: ChatMessage[] = [
      { role: 'user', content: 'Hello, are you working?', timestamp: Date.now() },
    ];

    switch (config.provider) {
      case 'gemini': {
        if (!config.geminiApiKey) return { success: false, message: 'No API key provided' };
        await queryGemini(testMessages, '', config.geminiApiKey, config.geminiModel);
        return { success: true, message: 'Gemini connected successfully!' };
      }
      case 'ollama': {
        const res = await fetch('http://localhost:11434/api/tags');
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return { success: true, message: 'Ollama connected successfully!' };
      }
      default:
        return { success: false, message: 'Unknown provider' };
    }
  } catch (err) {
    return {
      success: false,
      message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

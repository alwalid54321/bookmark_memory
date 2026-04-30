import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, 
  RefreshCw, 
  Settings, 
  MessageSquare, 
  FileText, 
  Bookmark, 
  Search, 
  User, 
  Bot, 
  Link, 
  Trash2, 
  Send,
  ExternalLink,
  Plus,
  Edit2,
  X,
  Check
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  timestamp: number;
}

interface SearchResult {
  item: BookmarkEntry | NoteEntry;
  score: number;
  type: 'bookmark' | 'note';
}

interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  folderPath: string;
  dateAdded: number;
  tags: string[];
  summary?: string;
}

interface NoteEntry {
  id: string;
  text: string;
  details?: string;
  url: string;
  pageTitle: string;
  dateAdded: number;
  tags: string[];
  color?: string;
}

interface Stats {
  bookmarkCount: number;
  noteCount: number;
  lastSync: number | null;
}

type TabId = 'chat' | 'notes' | 'bookmarks';

// ─── Component ──────────────────────────────────────────────────────

export default function SidePanel() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState<Stats>({ bookmarkCount: 0, noteCount: 0, lastSync: null });
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDetails, setEditDetails] = useState('');
  const [editTags, setEditTags] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Effects ────────────────────────────────────────────────────

  useEffect(() => {
    loadStats();
    loadNotes();
    loadBookmarks();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // ─── Data Loaders ──────────────────────────────────────────────

  const loadStats = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (response && !response.error) {
        setStats(response);
      }
    });
  }, []);

  const loadNotes = useCallback(() => {
    // IndexedDB access via background
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, () => {});
    // We'll load notes from IndexedDB directly in the side panel context
    const request = indexedDB.open('BookmarkMemoryDB', 2);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('notes', 'readonly');
        const store = tx.objectStore('notes');
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const sorted = (getAll.result as NoteEntry[]).sort((a, b) => b.dateAdded - a.dateAdded);
          setNotes(sorted);
        };
      } catch {
        // Store might not exist yet
      }
    };
  }, []);

  const loadBookmarks = useCallback(() => {
    const request = indexedDB.open('BookmarkMemoryDB', 2);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('bookmarks', 'readonly');
        const store = tx.objectStore('bookmarks');
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const sorted = (getAll.result as BookmarkEntry[]).sort((a, b) => b.dateAdded - a.dateAdded);
          setBookmarks(sorted);
        };
      } catch {
        // Store might not exist yet
      }
    };
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await new Promise<{ reply: string; sources: SearchResult[] }>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'CHAT', messages: newMessages },
          (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (res?.error) {
              reject(new Error(res.error));
            } else {
              resolve(res);
            }
          },
        );
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        sources: response.sources,
        timestamp: Date.now(),
      };
      setMessages([...newMessages, assistantMsg]);
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `⚠️ Error: ${err instanceof Error ? err.message : 'Something went wrong'}.\n\nPlease check your AI settings in the Options page.`,
        timestamp: Date.now(),
      };
      setMessages([...newMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    chrome.runtime.sendMessage({ type: 'FULL_SYNC' }, (response) => {
      setIsSyncing(false);
      loadStats();
      loadBookmarks();
      if (response?.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ Sync complete! Indexed **${response.count}** bookmarks.`,
          timestamp: Date.now(),
        }]);
      }
    });
  };

  const handleDeleteNote = (id: string) => {
    const request = indexedDB.open('BookmarkMemoryDB', 2);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').delete(id);
      tx.oncomplete = () => {
        loadNotes();
        loadStats();
      };
    };
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const startEditingNote = (note: NoteEntry) => {
    setEditingNoteId(note.id);
    setEditDetails(note.details || '');
    setEditTags(note.tags.join(', '));
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditDetails('');
    setEditTags('');
  };

  const saveNoteEdit = async (id: string) => {
    setIsLoading(true);
    const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
    
    chrome.runtime.sendMessage(
      { type: 'UPDATE_NOTE', id, details: editDetails.trim(), tags: tagsArray },
      (response) => {
        setIsLoading(false);
        setEditingNoteId(null);
        if (response?.success) {
          loadNotes();
        } else {
          console.error('Failed to update note', response?.error);
        }
      }
    );
  };

  // ─── Filtered lists ────────────────────────────────────────────

  const filteredBookmarks = searchQuery
    ? bookmarks.filter(b =>
        b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.folderPath.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : bookmarks;

  const filteredNotes = searchQuery
    ? notes.filter(n =>
        n.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.pageTitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-top">
          <div className="header-title">
            <span className="header-logo"><Brain size={20} /></span>
            <h1>Bookmark Memory</h1>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={handleSync} title="Sync bookmarks" disabled={isSyncing}>
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            </button>
            <button className="icon-btn" onClick={openOptions} title="Settings">
              <Settings size={14} />
            </button>
          </div>
        </div>
        <div className="header-stats">
          <span className="stat-chip"><Bookmark size={11} /> <span className="num">{stats.bookmarkCount}</span></span>
          <span className="stat-chip"><FileText size={11} /> <span className="num">{notes.length}</span></span>
        </div>
      </div>

      {/* Sync Progress */}
      {isSyncing && (
        <div className="sync-bar">
          <span>Indexing your bookmarks...</span>
          <div className="sync-progress" style={{ width: '100%' }} />
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
          <MessageSquare size={14} /> Chat
        </button>
        <button className={`tab ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => { setActiveTab('notes'); loadNotes(); }}>
          <FileText size={14} /> Notes
        </button>
        <button className={`tab ${activeTab === 'bookmarks' ? 'active' : ''}`} onClick={() => { setActiveTab('bookmarks'); loadBookmarks(); }}>
          <Bookmark size={14} /> Bookmarks
        </button>
      </div>

      {/* Content */}
      {activeTab === 'chat' && (
        <div className="chat-container">
          <div className="messages">
            {messages.length === 0 ? (
              <div className="welcome">
                <span className="welcome-icon"><Brain size={48} /></span>
                <h2>What are you looking for?</h2>
                <p>Ask me about your bookmarks and saved notes. I'll search through everything you've saved.</p>
                <div className="suggestions">
                  <button className="suggestion-btn" onClick={() => handleSuggestion('What websites do I have about programming?')}>
                    What websites do I have about programming?
                  </button>
                  <button className="suggestion-btn" onClick={() => handleSuggestion('Find my notes about machine learning')}>
                    Find my notes about machine learning
                  </button>
                  <button className="suggestion-btn" onClick={() => handleSuggestion('What was that website for design tools?')}>
                    What was that website for design tools?
                  </button>
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className="message-bubble">
                    <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="message-sources">
                        <details>
                          <summary><Link size={11} /> {msg.sources.length} source(s) used</summary>
                          {msg.sources.map((s, j) => (
                            <div key={j} className="source-item">
                              <span className={`source-badge ${s.type}`}>
                                {s.type === 'bookmark' ? <Bookmark size={10} /> : <FileText size={10} />}
                              </span>
                              <span>
                                {s.type === 'bookmark'
                                  ? (s.item as BookmarkEntry).title
                                  : (s.item as NoteEntry).text.slice(0, 60) + '...'}
                              </span>
                            </div>
                          ))}
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="message assistant">
                <div className="message-avatar"><Bot size={14} /></div>
                <div className="message-bubble">
                  <div className="typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <div className="input-wrapper">
              <textarea
                ref={inputRef}
                className="input-field"
                placeholder="Ask about your bookmarks..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isLoading}
              />
              <button className="send-btn" onClick={handleSend} disabled={isLoading || !input.trim()}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <>
          {notes.length > 3 && (
            <div className="search-bar">
              <input
                className="search-input"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
          <div className="notes-container">
            {filteredNotes.length === 0 ? (
              <div className="empty-state">
                <span className="icon"><FileText size={40} /></span>
                <p>No notes yet. Select text on any page and right-click → <strong>Save to Bookmark Memory</strong></p>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div key={note.id} className="note-card" style={note.color ? { borderLeftColor: note.color, borderLeftWidth: 3 } : {}}>
                  {editingNoteId === note.id ? (
                    <div className="note-edit-form">
                      <div className="note-card-text" style={{ opacity: 0.7, marginBottom: 12 }}>"{note.text}"</div>
                      <textarea
                        className="input-field"
                        placeholder="Add details, comments, or thoughts..."
                        value={editDetails}
                        onChange={e => setEditDetails(e.target.value)}
                        rows={3}
                        style={{ marginBottom: 8 }}
                      />
                      <input
                        className="input-field"
                        placeholder="Tags (comma separated, e.g., projectX, idea)"
                        value={editTags}
                        onChange={e => setEditTags(e.target.value)}
                        style={{ marginBottom: 12 }}
                      />
                      <div className="note-edit-actions">
                        <button className="btn btn-outline btn-sm" onClick={cancelEditingNote} disabled={isLoading}>
                          <X size={14} /> Cancel
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => saveNoteEdit(note.id)} disabled={isLoading}>
                          <Check size={14} /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="note-card-text">"{note.text}"</div>
                      {note.details && <div className="note-card-details">{note.details}</div>}
                      <div className="note-card-meta">
                        <div>
                          {note.tags.map(t => (
                            <span key={t} className={`note-tag ${t === 'important' ? 'important' : ''}`}>{t}</span>
                          ))}
                          <a
                            className="note-card-source"
                            href={note.url}
                            title={note.url}
                            onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: note.url }); }}
                          >
                            <Link size={10} style={{ marginRight: 4 }} />
                            {note.pageTitle || note.url}
                          </a>
                        </div>
                        <div className="note-actions">
                          <button className="note-action-btn" onClick={() => startEditingNote(note)} title="Edit note details and tags">
                            <Edit2 size={14} />
                          </button>
                          <button className="note-action-btn delete" onClick={() => handleDeleteNote(note.id)} title="Delete note">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'bookmarks' && (
        <>
          <div className="search-bar">
            <input
              className="search-input"
              placeholder="Filter bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="bookmarks-container">
            {filteredBookmarks.length === 0 ? (
              <div className="empty-state">
                <span className="icon"><Bookmark size={40} /></span>
                <p>{bookmarks.length === 0 ? 'No bookmarks indexed yet. Click Re-sync to begin.' : 'No bookmarks match your search.'}</p>
              </div>
            ) : (
              filteredBookmarks.slice(0, 100).map((bm) => (
                <div
                  key={bm.id}
                  className="bookmark-card"
                  onClick={() => chrome.tabs.create({ url: bm.url })}
                >
                  <div className="bookmark-favicon">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=32`}
                      width="16"
                      height="16"
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div className="bookmark-info">
                    <div className="bookmark-title">{bm.title}</div>
                    <div className="bookmark-url">{bm.url}</div>
                  </div>
                  {bm.folderPath && (
                    <span className="bookmark-folder">{bm.folderPath.split('/').pop()}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatMessage(text: string): string {
  // Sanitize HTML to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // URLs
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    // Newlines
    .replace(/\n/g, '<br>');
}

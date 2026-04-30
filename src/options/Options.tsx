import React, { useState, useEffect } from 'react';

type Provider = 'gemini' | 'ollama';
type EmbedProvider = 'gemini' | 'ollama' | 'local';

interface Settings {
  aiProvider: Provider;
  geminiApiKey: string;
  geminiModel: string;
  ollamaModel: string;
  ollamaEmbedModel: string;
  embeddingProvider: EmbedProvider;
}

interface Stats {
  bookmarkCount: number;
  noteCount: number;
  lastSync: number | null;
}

export default function Options() {
  const [settings, setSettings] = useState<Settings>({
    aiProvider: 'gemini',
    geminiApiKey: '',
    geminiModel: 'gemini-flash-latest',
    ollamaModel: 'llama3.2',
    ollamaEmbedModel: 'nomic-embed-text',
    embeddingProvider: 'local',
  });
  const [stats, setStats] = useState<Stats>({ bookmarkCount: 0, noteCount: 0, lastSync: null });
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // ─── Load ──────────────────────────────────────────────────────

  useEffect(() => {
    chrome.storage.local.get(
      ['aiProvider', 'geminiApiKey', 'geminiModel', 'ollamaModel', 'ollamaEmbedModel', 'embeddingProvider'],
      (result) => {
        setSettings((prev) => ({
          ...prev,
          ...Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined)),
        }));
      },
    );
    loadStats();
  }, []);

  const loadStats = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
      if (response && !response.error) setStats(response);
    });
  };

  // ─── Save ──────────────────────────────────────────────────────

  const handleSave = () => {
    chrome.storage.local.set(settings, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  };

  // ─── Test ──────────────────────────────────────────────────────

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    // Save first so background picks up new settings
    chrome.storage.local.set(settings, () => {
      chrome.runtime.sendMessage({ type: 'TEST_CONNECTION' }, (response) => {
        setTesting(false);
        setTestResult(response);
      });
    });
  };

  // ─── Sync ──────────────────────────────────────────────────────

  const handleSync = () => {
    setSyncing(true);
    chrome.runtime.sendMessage({ type: 'FULL_SYNC' }, () => {
      setSyncing(false);
      loadStats();
    });
  };

  // ─── Clear ─────────────────────────────────────────────────────

  const handleClear = () => {
    if (confirm('This will delete ALL indexed bookmarks, notes, and embeddings. Continue?')) {
      const request = indexedDB.open('BookmarkMemoryDB', 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['bookmarks', 'notes', 'meta'], 'readwrite');
        tx.objectStore('bookmarks').clear();
        tx.objectStore('notes').clear();
        tx.objectStore('meta').clear();
        tx.oncomplete = () => loadStats();
      };
    }
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="options-page">
      <div className="options-header">
        <span className="logo">BM</span>
        <h1>Bookmark Memory</h1>
        <p>Configure your AI-powered bookmark assistant</p>
      </div>

      {/* Stats */}
      <div className="section">
        <div className="section-title">
          <span className="icon">Stat</span>
          Database Status
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.bookmarkCount}</div>
            <div className="stat-label">Bookmarks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.noteCount}</div>
            <div className="stat-label">Notes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.lastSync ? 'Yes' : 'No'}</div>
            <div className="stat-label">Last Sync</div>
          </div>
        </div>
        {stats.lastSync && (
          <p className="form-hint" style={{ textAlign: 'center' }}>
            Last synced: {new Date(stats.lastSync).toLocaleString()}
          </p>
        )}
        <div className="btn-group" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing...' : 'Re-sync Bookmarks'}
          </button>
          <button className="btn btn-danger" onClick={handleClear}>
            Clear Data
          </button>
        </div>
      </div>

      {/* AI Provider */}
      <div className="section">
        <div className="section-title">
          <span className="icon">AI</span>
          AI Provider
        </div>
        <div className="provider-cards">
          <div
            className={`provider-card ${settings.aiProvider === 'gemini' ? 'selected' : ''}`}
            onClick={() => setSettings({ ...settings, aiProvider: 'gemini' })}
          >
            <span className="icon">Cloud</span>
            <div className="name">Gemini</div>
            <div className="desc">Fast, cloud-based AI by Google</div>
          </div>
          <div
            className={`provider-card ${settings.aiProvider === 'ollama' ? 'selected' : ''}`}
            onClick={() => setSettings({ ...settings, aiProvider: 'ollama' })}
          >
            <span className="icon">Local</span>
            <div className="name">Ollama</div>
            <div className="desc">100% local, private AI</div>
          </div>
        </div>

        {settings.aiProvider === 'gemini' && (
          <>
            <div className="form-group">
              <label className="form-label">Gemini API Key</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  type={showKey ? 'text' : 'password'}
                  value={settings.geminiApiKey}
                  onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value })}
                  placeholder="AIza..."
                />
                <button
                  className="btn btn-outline"
                  onClick={() => setShowKey(!showKey)}
                  style={{ flexShrink: 0 }}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="form-hint">
                Get your free API key from{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                  Google AI Studio
                </a>. Stored locally, never sent to third parties.
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <select
                className="form-select"
                value={settings.geminiModel}
                onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
              >
                <option value="gemini-flash-latest">Gemini Flash Latest (Fast & Default)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
              </select>
            </div>
          </>
        )}

        {settings.aiProvider === 'ollama' && (
          <>
            <div className="form-group">
              <label className="form-label">Chat Model</label>
              <input
                className="form-input"
                value={settings.ollamaModel}
                onChange={(e) => setSettings({ ...settings, ollamaModel: e.target.value })}
                placeholder="llama3.2"
              />
              <p className="form-hint">
                The Ollama model for chat. Make sure it's pulled: <code style={{ color: 'var(--accent)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>ollama pull llama3.2</code>
              </p>
            </div>
            <div className="form-group">
              <label className="form-label">Embedding Model</label>
              <input
                className="form-input"
                value={settings.ollamaEmbedModel}
                onChange={(e) => setSettings({ ...settings, ollamaEmbedModel: e.target.value })}
                placeholder="nomic-embed-text"
              />
            </div>
          </>
        )}

        {/* Test Connection */}
        <div className="btn-group">
          <button className="btn btn-primary" onClick={handleTest} disabled={testing}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        {testResult && (
          <div style={{ marginTop: 12 }}>
            <span className={`status-badge ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? 'Success' : 'Error'}: {testResult.message}
            </span>
          </div>
        )}
      </div>

      {/* Embedding Provider */}
      <div className="section">
        <div className="section-title">
          <span className="icon">Vector</span>
          Embedding Engine
        </div>
        <div className="form-group">
          <label className="form-label">How to generate search vectors</label>
          <select
            className="form-select"
            value={settings.embeddingProvider}
            onChange={(e) => setSettings({ ...settings, embeddingProvider: e.target.value as EmbedProvider })}
          >
            <option value="local">Local (Zero-dependency, instant, works offline)</option>
            <option value="gemini">Gemini Embedding API (Best quality)</option>
            <option value="ollama">Ollama nomic-embed-text (Local, high quality)</option>
          </select>
          <p className="form-hint">
            "Local" uses a lightweight built-in algorithm. For better search accuracy, use Gemini or Ollama embeddings.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="btn-group" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave} style={{ padding: '12px 40px', fontSize: 14 }}>
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      {/* Security Notice */}
      <div className="security-notice">
        <h4>Privacy and Security</h4>
        <ul>
          <li>All bookmarks, notes, and embeddings are stored locally in your browser</li>
          <li>API keys are stored in Chrome's secure extension storage</li>
          <li>No data is ever sent to third-party servers (except to your chosen AI provider)</li>
          <li>With Ollama, everything stays 100% on your machine</li>
          <li>Open source — audit the code anytime on GitHub</li>
        </ul>
      </div>
    </div>
  );
}

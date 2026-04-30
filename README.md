# Bookmark Memory

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-v1.0.0-blue?style=flat-square&logo=google-chrome&logoColor=white)](#)
[![Privacy First](https://img.shields.io/badge/Privacy-First-008aff?style=flat-square)](#)

Bookmark Memory is a privacy-focused, local-first Chrome Extension that acts as your personal "Second Brain". Using Retrieval-Augmented Generation (RAG), it allows you to semantically search and chat with your saved bookmarks and highlighted notes.

## ⚡ Quick Start

1. **Install**: Clone this repo and run `npm install && npm run build`.
2. **Load**: Go to `chrome://extensions/`, enable **Developer Mode**, and click **Load Unpacked**. Select the `dist` folder.
3. **Set Up AI**: Open the extension **Options** (gear icon) and:
   - **Gemini**: Paste your API key from [Google AI Studio](https://aistudio.google.com/apikey).
   - **Ollama**: Ensure Ollama is running with `OLLAMA_ORIGINS="chrome-extension://*"` (See setup below).
4. **Chat**: Click the extension icon to open the side panel and start asking about your bookmarks!

---

## Features

- **Semantic Search & Chat**: Don't just search for keywords; ask questions like "Where did I save that article about quantum computing?"
- **Local Smart Notes**: Highlight any text on the web, right-click, and save it directly to your searchable memory.
- **Hybrid AI Engine**: Supports **Google Gemini** for high performance and **Ollama** for 100% private, offline use.
- **Privacy by Design**: All data stays on your machine in IndexedDB. We never see your bookmarks or notes.
- **Premium Dark UI**: A sleek, modern interface with professional Lucide icons and a responsive design.
- **Zero Configuration Sync**: Automatically indexes your browser bookmarks upon installation and updates.

## Privacy & Security

Bookmark Memory is built on the principle of data sovereignty:

- **100% Open Source**: Transparent code that you can audit and verify.
- **Local-First Storage**: Your semantic vectors and notes are stored in your browser's IndexedDB.
- **No Tracking**: No telemetry, no analytics, no external trackers.
- **Encrypted Storage**: Sensitive data like API keys are kept in Chrome's isolated storage.
- **Offline Capabilities**: Use the built-in embedding engine and Ollama to run the entire pipeline without an internet connection.

## Installation & Setup

### Detailed Setup

#### 1. Gemini (Cloud-Based)
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Enter the key in the settings and select a model (e.g., `gemini-2.0-flash`).

#### 2. Ollama (100% Local)
1. Install [Ollama](https://ollama.com/).
2. Pull models: `ollama pull llama3.2` and `ollama pull nomic-embed-text`.
3. **CORS Configuration**:
   - **Windows**: Add Environment Variable `OLLAMA_ORIGINS` = `chrome-extension://*`
   - **macOS/Linux**: `launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"` or export in your shell.
4. Restart Ollama.

## Developer Guide

If you want to contribute or build from source:

```bash
# Clone the repository
git clone https://github.com/alwalid54321/bookmark_memory.git

# Install dependencies
npm install

# Build the extension
npm run build

# Development with hot-reload
npm run dev
```

## License

This project is licensed under the **GNU General Public License v3.0**. See the [LICENSE](LICENSE) file for details.


# Bookmark Memory 🧠

Bookmark Memory is a privacy-first, open-source Chrome Extension that acts as your personal "Second Brain". It uses Retrieval-Augmented Generation (RAG) to let you semantically search and chat with your saved bookmarks and highlighted text notes. 

Say goodbye to endlessly scrolling through disorganized bookmark folders. Just ask, "What was that website about machine learning deployment?" and Bookmark Memory will find it.

## ✨ Features

- **Semantic Chat**: Chat with your bookmarks. The AI understands the *meaning* of your search, not just exact keywords.
- **Smart Notes**: Highlight text on any website, right-click, and select "Save to Bookmark Memory" to store it as a searchable note.
- **Dual AI Support**: Choose between **Gemini** (fast, cloud-based via API) or **Ollama** (100% local, private AI).
- **Three Embedding Engines**: Generate semantic vectors using Gemini, Ollama, or a built-in zero-dependency local engine for instant, offline performance.
- **Premium UI**: Enjoy a sleek, dark-themed, glassmorphism UI designed for focus and aesthetics.
- **Automatic Sync**: Your bookmarks are automatically indexed when added, changed, or removed.

## 🔒 Privacy & Security

Your data is yours. We built Bookmark Memory with a strict "Local First" approach:

- **100% Open Source**: The entire codebase is transparent and available for auditing.
- **Local Storage**: All your bookmarks, notes, and vector embeddings are stored securely inside your browser using IndexedDB. They never leave your device unless you explicitly use a cloud-based AI.
- **Secure API Keys**: If you use Gemini, your API key is stored locally using `chrome.storage.local`, which is isolated from web pages and not synced to the cloud.
- **Zero-Backend Architecture**: There is no central server. You communicate directly with the AI providers.
- **Total Local Control**: By combining the built-in local embedding engine with **Ollama**, you can run the entire semantic search pipeline completely offline and 100% locally on your machine.

## 🚀 Installation & Setup

### 1. Load the Extension
1. Clone this repository or download the source code.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the `dist` folder generated after running the build step (see Developer Guide below).

### 2. Configure Your AI Provider

Open the extension's Options page (right-click the extension icon and select "Options", or click the gear icon in the side panel) and choose your AI backend:

#### Option A: Gemini (Recommended for most users)
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Enter the key in the settings.
3. Select your preferred Gemini model (e.g., `gemini-2.0-flash`).

#### Option B: Ollama (100% Local & Private)
To use local AI models, you need to configure Ollama to accept requests from the Chrome extension.

1. Install [Ollama](https://ollama.com/) on your machine.
2. Pull the required models via your terminal:
   ```bash
   ollama pull llama3.2          # For chat
   ollama pull nomic-embed-text  # For embeddings
   ```
3. **Crucial Step (CORS setup)**: By default, Ollama blocks browser extensions. You must set the `OLLAMA_ORIGINS` environment variable to allow the extension.
   - **Windows**: Search for "Environment Variables" in the Start menu -> Add `OLLAMA_ORIGINS` with value `chrome-extension://*` -> Restart Ollama.
   - **macOS/Linux**: Run `OLLAMA_ORIGINS="chrome-extension://*" ollama serve` or configure your `systemd` service/`launchctl` to include this variable.
4. Restart the Ollama application completely.
5. In the extension Options, select "Ollama" and click "Test Connection".

## 🛠️ Developer Guide

To build the extension from source:

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Watch mode for active development
npm run dev
```

The output will be generated in the `dist` directory, which you can load into Chrome.

## 📜 License

This project is open-source under the GNU GPL v3 License.

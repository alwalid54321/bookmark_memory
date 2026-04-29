/**
 * content.ts — Content script for Bookmark Memory.
 * Shows toast notifications when notes are saved and provides
 * a floating save button on text selection.
 */

// ─── Toast Notification ─────────────────────────────────────────────

function showToast(message: string, type: 'success' | 'info' = 'success') {
  const existing = document.getElementById('bm-memory-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'bm-memory-toast';
  toast.setAttribute('role', 'alert');

  const colors = type === 'success'
    ? { bg: 'linear-gradient(135deg, #10b981, #059669)', icon: '✅' }
    : { bg: 'linear-gradient(135deg, #6366f1, #4f46e5)', icon: 'ℹ️' };

  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    padding: 14px 20px;
    background: ${colors.bg};
    color: white;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 10px;
    transform: translateY(100px);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(8px);
    pointer-events: none;
  `;

  toast.textContent = `${colors.icon} ${message}`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.transform = 'translateY(100px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ─── Floating Save Button ───────────────────────────────────────────

let floatingBtn: HTMLElement | null = null;

function removeFloatingBtn() {
  if (floatingBtn) {
    floatingBtn.remove();
    floatingBtn = null;
  }
}

function createFloatingBtn(x: number, y: number, selectedText: string) {
  removeFloatingBtn();

  const btn = document.createElement('div');
  btn.id = 'bm-memory-save-btn';
  btn.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y - 48}px;
    z-index: 2147483647;
    padding: 8px 14px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border-radius: 10px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(99,102,241,0.5);
    display: flex;
    align-items: center;
    gap: 6px;
    transform: scale(0.8);
    opacity: 0;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  `;
  btn.innerHTML = '💾 Save Note';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    chrome.runtime.sendMessage({
      type: 'SAVE_NOTE',
      note: {
        text: selectedText,
        url: window.location.href,
        pageTitle: document.title,
      },
    }, (response) => {
      if (response?.success) {
        showToast('Note saved to Bookmark Memory!');
      } else {
        showToast('Failed to save note', 'info');
      }
    });

    removeFloatingBtn();
  });

  document.body.appendChild(btn);
  floatingBtn = btn;

  requestAnimationFrame(() => {
    btn.style.transform = 'scale(1)';
    btn.style.opacity = '1';
  });
}

// ─── Selection Listener ─────────────────────────────────────────────

document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 5) {
      createFloatingBtn(e.clientX, e.clientY, text);
    } else {
      removeFloatingBtn();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (floatingBtn && !floatingBtn.contains(e.target as Node)) {
    removeFloatingBtn();
  }
});

// ─── Message Listener ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'NOTE_SAVED') {
    showToast('Note saved to Bookmark Memory!');
  }
});

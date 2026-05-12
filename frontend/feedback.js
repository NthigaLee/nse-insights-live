/**
 * NSE Insights — Feedback widget
 *
 * Drop-in modal. Call openFeedback() to show. Submissions try the
 * backend (POST /api/feedback) and fall back to mailto: if that
 * endpoint isn't configured.
 *
 *   window.NSE_CONFIG.PAYMENTS_API   (reused for feedback endpoint)
 *   window.NSE_CONFIG.FEEDBACK_EMAIL (defaults to feedback@nseinsights.co.ke)
 */
(function () {
  const CFG = window.NSE_CONFIG || {};
  const API = (CFG.PAYMENTS_API || '').replace(/\/$/, '');
  const EMAIL = CFG.FEEDBACK_EMAIL || 'feedback@nseinsights.co.ke';

  // Inject styles once
  function injectStyles() {
    if (document.getElementById('fb-styles')) return;
    const css = `
      .fb-backdrop {
        position: fixed; inset: 0;
        background: rgba(10, 23, 38, 0.60);
        backdrop-filter: blur(6px);
        z-index: 9500;
        display: none;
        align-items: center; justify-content: center;
        padding: 1rem;
      }
      .fb-backdrop.open { display: flex; animation: fbFade 0.18s ease; }
      @keyframes fbFade { from { opacity: 0; } to { opacity: 1; } }
      .fb-modal {
        background: var(--bg-card, #ffffff);
        color: var(--text-primary, #0b1726);
        border: 1px solid var(--border, rgba(10,37,64,0.10));
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(10,37,64,0.20);
        width: 100%; max-width: 480px;
        padding: 1.8rem 1.7rem 1.5rem;
        position: relative;
        font-family: var(--font-sans, 'Inter', system-ui, sans-serif);
      }
      .fb-modal h3 {
        font-family: var(--font-serif, Georgia, serif);
        font-size: 1.3rem; font-weight: 600;
        margin: 0 0 0.3rem 0;
        color: var(--text-primary, #0b1726);
        letter-spacing: -0.01em;
      }
      .fb-modal .fb-sub {
        font-size: 0.86rem;
        color: var(--text-muted, #64748b);
        margin-bottom: 1.2rem;
      }
      .fb-close {
        position: absolute; top: 0.7rem; right: 0.9rem;
        width: 30px; height: 30px;
        border: none; background: transparent;
        font-size: 1.3rem; cursor: pointer;
        color: var(--text-muted, #64748b);
        border-radius: 50%;
        display: grid; place-items: center;
      }
      .fb-close:hover { background: var(--bg-sunk, #f4efe4); color: var(--text-primary, #0b1726); }
      .fb-row { margin-bottom: 0.9rem; }
      .fb-row label {
        display: block;
        font-size: 0.78rem; font-weight: 600;
        margin-bottom: 0.35rem;
        color: var(--text-secondary, #334155);
      }
      .fb-row input, .fb-row select, .fb-row textarea {
        width: 100%;
        padding: 0.6rem 0.8rem;
        border: 1px solid var(--border-strong, rgba(10,37,64,0.18));
        background: var(--bg-surface, #ffffff);
        color: var(--text-primary, #0b1726);
        border-radius: 8px;
        font-family: inherit;
        font-size: 0.92rem;
        box-sizing: border-box;
      }
      .fb-row textarea { min-height: 110px; resize: vertical; }
      .fb-row input:focus, .fb-row select:focus, .fb-row textarea:focus {
        outline: none;
        border-color: var(--gold-500, #c9a961);
        box-shadow: 0 0 0 3px rgba(201,169,97,0.18);
      }
      .fb-actions {
        display: flex; gap: 0.55rem; justify-content: flex-end;
        margin-top: 0.3rem;
      }
      .fb-btn {
        padding: 0.6rem 1.1rem; border-radius: 8px; font-weight: 600;
        font-size: 0.88rem; cursor: pointer; border: 1px solid transparent;
        font-family: inherit;
      }
      .fb-btn-primary {
        background: var(--navy-900, #0a3d7a); color: #f7f2e6;
        border-color: var(--navy-900, #0a3d7a);
      }
      .fb-btn-primary:hover { background: var(--navy-700, #1565c0); }
      .fb-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .fb-btn-ghost {
        background: transparent; color: var(--text-secondary, #334155);
        border-color: var(--border, rgba(10,37,64,0.10));
      }
      .fb-btn-ghost:hover { background: var(--bg-sunk, #f4efe4); }
      .fb-status {
        padding: 0.7rem 0.9rem;
        border-radius: 8px;
        font-size: 0.85rem;
        margin-top: 0.8rem;
        display: none;
      }
      .fb-status.visible { display: block; }
      .fb-status.success {
        background: rgba(15,157,88,0.10);
        color: #0f9d58;
        border: 1px solid rgba(15,157,88,0.25);
      }
      .fb-status.error {
        background: rgba(192,57,43,0.10);
        color: #c0392b;
        border: 1px solid rgba(192,57,43,0.25);
      }
      .fb-status.info {
        background: var(--gold-100, #faf3e1);
        color: var(--gold-700, #8a6f2b);
        border: 1px solid var(--border-gold, rgba(201,169,97,0.45));
      }
      body.dark .fb-modal { background: #0f2339; color: #f2ece0; }
      body.dark .fb-row input, body.dark .fb-row select, body.dark .fb-row textarea {
        background: #0a1b2e; color: #f2ece0; border-color: rgba(201,169,97,0.25);
      }
    `;
    const style = document.createElement('style');
    style.id = 'fb-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Inject modal DOM once
  function injectModal() {
    if (document.getElementById('fb-backdrop')) return;
    const html = `
      <div class="fb-backdrop" id="fb-backdrop" role="dialog" aria-modal="true" aria-labelledby="fb-title">
        <div class="fb-modal">
          <button class="fb-close" aria-label="Close" id="fb-close">×</button>
          <h3 id="fb-title">Send us feedback</h3>
          <p class="fb-sub">Spotted a bug, have a feature idea, or just want to say hi? We read every message.</p>

          <form id="fb-form" autocomplete="on">
            <div class="fb-row">
              <label for="fb-type">Type</label>
              <select id="fb-type" required>
                <option value="suggestion">Suggestion</option>
                <option value="bug">Bug report</option>
                <option value="question">Question</option>
                <option value="data">Data correction</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="fb-row">
              <label for="fb-name">Your name <span style="color: var(--text-muted,#64748b); font-weight: 400;">(optional)</span></label>
              <input id="fb-name" type="text" placeholder="Jane Mutiso" maxlength="100" />
            </div>
            <div class="fb-row">
              <label for="fb-email">Email</label>
              <input id="fb-email" type="email" placeholder="you@example.com" required maxlength="150" />
            </div>
            <div class="fb-row">
              <label for="fb-message">Message</label>
              <textarea id="fb-message" placeholder="Tell us what's on your mind…" required maxlength="4000"></textarea>
            </div>

            <div class="fb-actions">
              <button type="button" class="fb-btn fb-btn-ghost" id="fb-cancel">Cancel</button>
              <button type="submit" class="fb-btn fb-btn-primary" id="fb-submit">Send feedback</button>
            </div>
            <div class="fb-status" id="fb-status" role="status"></div>
          </form>
        </div>
      </div>
    `;
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host.firstElementChild);

    // Wire up controls
    document.getElementById('fb-close').addEventListener('click', closeFeedback);
    document.getElementById('fb-cancel').addEventListener('click', closeFeedback);
    document.getElementById('fb-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'fb-backdrop') closeFeedback();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFeedback();
    });
    document.getElementById('fb-form').addEventListener('submit', submitFeedback);

    // Pre-fill email if the user is signed in (via AuthAPI)
    (async () => {
      try {
        if (window.AuthAPI && window.AuthAPI.getUser) {
          const u = await window.AuthAPI.getUser();
          if (u && u.email) document.getElementById('fb-email').value = u.email;
          if (u && u.user_metadata) {
            const nm = u.user_metadata.full_name || u.user_metadata.name;
            if (nm) document.getElementById('fb-name').value = nm;
          }
        }
      } catch (e) { /* noop */ }
    })();
  }

  function showStatus(kind, message) {
    const el = document.getElementById('fb-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'fb-status visible ' + kind;
  }

  async function submitFeedback(e) {
    e.preventDefault();
    const btn = document.getElementById('fb-submit');
    const type    = document.getElementById('fb-type').value;
    const name    = document.getElementById('fb-name').value.trim();
    const email   = document.getElementById('fb-email').value.trim();
    const message = document.getElementById('fb-message').value.trim();

    if (!email || !message) {
      showStatus('error', 'Please enter your email and a message.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';

    const payload = {
      type, name, email, message,
      page:       location.pathname,
      user_agent: navigator.userAgent,
      tier:       (typeof getCurrentTier === 'function' ? getCurrentTier() : null),
    };

    let ok = false;

    if (API) {
      try {
        const res = await fetch(API + '/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        ok = res.ok;
        if (!ok) console.warn('[feedback] backend returned', res.status);
      } catch (err) {
        console.warn('[feedback] backend unreachable:', err);
      }
    }

    if (ok) {
      showStatus('success', 'Thanks! Your feedback is on its way. We\'ll reply within 1–2 business days.');
      document.getElementById('fb-message').value = '';
      btn.textContent = 'Sent';
      setTimeout(closeFeedback, 1800);
    } else {
      // Fall back to mailto
      const subject = encodeURIComponent(`[NSE Insights feedback] ${type} — from ${name || email}`);
      const body = encodeURIComponent(
        `Type: ${type}\n` +
        `Name: ${name || '(not provided)'}\n` +
        `Email: ${email}\n` +
        `Page: ${payload.page}\n` +
        `Tier: ${payload.tier || '(unknown)'}\n\n` +
        `${message}`
      );
      showStatus('info', 'Opening your email client — you can send the message from there.');
      setTimeout(() => {
        window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
        btn.disabled = false;
        btn.textContent = 'Send feedback';
      }, 400);
    }
  }

  function openFeedback() {
    injectStyles();
    injectModal();
    const el = document.getElementById('fb-backdrop');
    el.classList.add('open');
    setTimeout(() => {
      const t = document.getElementById('fb-type');
      if (t) t.focus();
    }, 80);
  }

  function closeFeedback() {
    const el = document.getElementById('fb-backdrop');
    if (el) el.classList.remove('open');
    const status = document.getElementById('fb-status');
    if (status) status.className = 'fb-status';
    const btn = document.getElementById('fb-submit');
    if (btn) { btn.disabled = false; btn.textContent = 'Send feedback'; }
  }

  window.openFeedback = openFeedback;
  window.closeFeedback = closeFeedback;
})();

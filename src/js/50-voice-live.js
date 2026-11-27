(() => {
  'use strict';

  const MODEL = 'models/gemini-3.8-live';
  const TOKEN_FUNCTION = 'gemini-live-token';
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M8 6v12M4 9v6M16 6v12M20 9v6"/></svg>';
  let session = null;

  function ui() {
    let root = document.getElementById('ai-live-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'ai-live-root';
    document.body.appendChild(root);
    return root;
  }

  function show(status, caption = '', active = false) {
    ui().innerHTML = `<div class="ai-live-overlay" role="dialog" aria-modal="true" aria-labelledby="ai-live-title">
      <div class="ai-live-card"><div class="ai-live-top"><div class="ai-live-title" id="ai-live-title">Live voice chat</div><button type="button" class="ai-live-close" onclick="stopGeminiVoice()" aria-label="Close">×</button></div>
      <div class="ai-live-orb ${active ? 'is-active' : ''}">${ICON}</div><div class="ai-live-status" id="ai-live-status">${status}</div>
      <div class="ai-live-hint">Speak naturally; you can interrupt the assistant at any time. This voice chat does not place orders or change your account data.</div>
      <div class="ai-live-caption" id="ai-live-caption">${caption}</div>
      <button type="button" class="ai-live-stop" onclick="stopGeminiVoice()">End chat</button></div></div>`;
  }

  function setStatus(status, caption, active) {
    const statusEl = document.getElementById('ai-live-status');
    const capEl = document.getElementById('ai-live-caption');
    const orb = document.querySelector('.ai-live-orb');
    if (statusEl) statusEl.textContent = status;
    if (capEl && caption) capEl.textContent = caption;
    if (orb) orb.classList.toggle('is-active', !!active);
  }

  function audioBytesToBase64(float32) {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    const bytes = new Uint8Array(pcm.buffer);
    let binary = '';
    const block = 0x8000;
    for (let i = 0; i < bytes.length; i += block) binary += String.fromCharCode(...bytes.subarray(i, i + block));
    return btoa(binary);
  }

  function downsample(buffer, inputRate, outputRate = 16000) {
    if (inputRate === outputRate) return buffer;
    const ratio = inputRate / outputRate;
    const output = new Float32Array(Math.floor(buffer.length / ratio));
    for (let i = 0; i < output.length; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(Math.floor((i + 1) * ratio), buffer.length);
      let sum = 0;
      for (let j = start; j < end; j++) sum += buffer[j];
      output[i] = sum / Math.max(1, end - start);
    }
    return output;
  }

  function playPcm(base64, sampleRate = 24000) {
    if (!session?.audioContext) return;
    const raw = atob(base64);
    const pcm = new Int16Array(raw.length / 2);
    for (let i = 0; i < pcm.length; i++) pcm[i] = (raw.charCodeAt(i * 2) & 255) | (raw.charCodeAt(i * 2 + 1) << 8);
    const samples = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;
    const audioBuffer = session.audioContext.createBuffer(1, samples.length, sampleRate);
    audioBuffer.copyToChannel(samples, 0);
    const source = session.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(session.audioContext.destination);
    session.sources.add(source);
    source.onended = () => session?.sources.delete(source);
    const when = Math.max(session.nextPlayAt, session.audioContext.currentTime + 0.025);
    source.start(when);
    session.nextPlayAt = when + audioBuffer.duration;
  }

  function stopPlayback() {
    if (!session) return;
    for (const source of session.sources) {
      try { source.stop(); } catch (_) {}
    }
    session.sources.clear();
    if (session.audioContext) session.nextPlayAt = session.audioContext.currentTime;
  }

  function storeContext() {
    try {
      const products = (typeof S !== 'undefined' ? S.products : []).slice(0, 40).map(p => ({
        name: p.name, price: p.price, description: p.description || ''
      }));
      return JSON.stringify(products);
    } catch (_) { return '[]'; }
  }

  async function startGeminiVoice() {
    if (session) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.WebSocket) {
      show('Live voice needs a modern browser and an HTTPS connection.');
      return;
    }
    show('Preparing the voice chat…');
    const button = document.getElementById('ai-live-voice');
    if (button) button.disabled = true;
    const current = { socket: null, stream: null, audioContext: null, processor: null, source: null, sources: new Set(), nextPlayAt: 0, ready: false, stopped: false };
    session = current;
    try {
      current.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await current.audioContext.resume();
      current.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });

      if (!sb?.auth) throw new Error('auth_required');
      const { data: authData } = await sb.auth.getSession();
      if (!authData?.session?.access_token) throw new Error('auth_required');

      const { data, error } = await sb.functions.invoke(TOKEN_FUNCTION, { body: {} });
      if (error || !data?.token) {
        let detail = data?.error || '';
        if (!detail && error?.context && typeof error.context.json === 'function') {
          try { const body = await error.context.clone().json(); detail = body?.error || body?.message || ''; } catch (_) {}
        }
        if (!detail && error?.context?.status) detail = `HTTP ${error.context.status}`;
        if (!detail && error?.message) detail = error.message;
        throw new Error(detail || 'token_failed');
      }
      if (session !== current || current.stopped) return;

      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(data.token)}`;
      current.socket = new WebSocket(url);
      current.socket.onopen = () => current.socket.send(JSON.stringify({ setup: {
        model: MODEL,
        responseModalities: ['AUDIO'],
        systemInstruction: { parts: [{ text: `You are a friendly voice assistant for the Dash Lebanon store. Answer in English and keep it short. Here is the list of available products at the start of the call (it may become outdated): ${storeContext()}. Do not guess prices or availability, and never confirm an order, payment or cancellation; direct the customer to the text chat or the Orders page for those actions.` }] }
      } }));
      current.socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (message.setupComplete) {
          current.ready = true;
          setStatus('I am listening now', 'Speak naturally in English.', true);
          current.source = current.audioContext.createMediaStreamSource(current.stream);
          current.processor = current.audioContext.createScriptProcessor(4096, 1, 1);
          current.processor.onaudioprocess = e => {
            if (!current.ready || current.socket?.readyState !== WebSocket.OPEN) return;
            const mono = e.inputBuffer.getChannelData(0);
            const pcm = downsample(mono, current.audioContext.sampleRate, 16000);
            current.socket.send(JSON.stringify({ realtimeInput: { audio: { data: audioBytesToBase64(pcm), mimeType: 'audio/pcm;rate=16000' } } }));
          };
          current.source.connect(current.processor);
          current.processor.connect(current.audioContext.destination);
        }
        const content = message.serverContent;
        if (content?.interrupted) stopPlayback();
        for (const part of content?.modelTurn?.parts || []) {
          const inline = part.inlineData || part.inline_data;
          if (inline?.data) playPcm(inline.data, 24000);
        }
        if (content?.turnComplete) setStatus('Go ahead, I am listening', 'You can keep talking or end the call.', true);
      };
      current.socket.onerror = () => setStatus('Could not connect to the voice service.', 'Check the Gemini setup or try again.', false);
      current.socket.onclose = event => {
        if (!current.stopped && session === current) setStatus('The voice connection ended.', event.code === 1008 ? 'You may need to try again after signing in.' : 'Start a new chat when needed.', false);
        cleanup(current, false);
      };
      setStatus('Connecting…', 'Allow the browser to use the microphone if asked.', false);
    } catch (error) {
      console.error('Gemini Live voice error:', error);
      const detail = String(error?.message || '');
      let message = 'We could not start the chat. Try again.';
      if (detail === 'auth_required' || /sign in is required/i.test(detail)) message = 'Sign in to your account to use voice chat.';
      else if (/not configured/i.test(detail)) message = 'The Gemini service is not configured on Supabase. Make sure to save GEMINI_API_KEY then deploy the voice function.';
      else if (/origin not allowed/i.test(detail)) message = 'The site URL is not in the allowed-sites list of the voice function.';
      else if (/failed to send|failed to fetch|networkerror|http 404|http 500/i.test(detail)) message = 'Could not reach the voice function on Supabase. Make sure gemini-live-token is deployed to the correct project.';
      else if (error?.name === 'NotAllowedError' || /permission denied/i.test(detail)) message = 'Allow microphone access in your browser settings, then try again.';
      else if (error?.name === 'NotFoundError') message = 'No microphone was found on this device.';
      else if (/Gemini could not start/i.test(detail)) message = 'Gemini The session was refused. Check the key permissions and the Live API status in Google AI Studio.';
      setStatus(message, '', false);
      cleanup(current, true);
      const stop = document.querySelector('.ai-live-stop');
      if (stop) stop.textContent = 'Close';
    } finally {
      if (button) button.disabled = false;
    }
  }

  function cleanup(target, closeSocket) {
    if (!target) return;
    target.stopped = true;
    target.ready = false;
    try { target.processor?.disconnect(); } catch (_) {}
    try { target.source?.disconnect(); } catch (_) {}
    target.stream?.getTracks().forEach(track => track.stop());
    if (closeSocket && target.socket && target.socket.readyState < WebSocket.CLOSING) target.socket.close();
    target.audioContext?.close().catch(() => {});
    for (const source of target.sources) { try { source.stop(); } catch (_) {} }
    target.sources.clear();
    if (session === target) session = null;
  }

  function stopGeminiVoice() {
    const current = session;
    if (current) cleanup(current, true);
    const root = document.getElementById('ai-live-root');
    if (root) root.innerHTML = '';
    const button = document.getElementById('ai-live-voice');
    if (button) button.disabled = false;
  }

  window.startGeminiVoice = startGeminiVoice;
  window.stopGeminiVoice = stopGeminiVoice;
})();

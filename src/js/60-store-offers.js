/* Global Gemini Live visibility, AI visibility and category slug helper. */
(() => {
  'use strict';
  const escText = value => typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '');
  const money = value => typeof fmt === 'function' ? fmt(Number(value) || 0) : `$${(Number(value) || 0).toFixed(2)}`;
  let liveEnabled = false;
  let liveConfigAvailable = false;
  const aiUiSelectors = ['#ai-fab', '#mnav-ai', '#ai-panel', '#ai-panel-ov'];

  function setLiveButton(enabled) {
    liveEnabled = enabled === true;
    const button = document.getElementById('ai-live-voice');
    if (button) button.classList.toggle('hide', !liveEnabled || !S.aiPublic?.enabled);
  }
  function syncAiVisibility() {
    const enabled = !!S.aiPublic?.enabled;
    aiUiSelectors.forEach(selector => document.querySelectorAll(selector).forEach(el => el.classList.toggle('hide', !enabled)));
    if (!enabled && typeof closeAiPanel === 'function') closeAiPanel();
    setLiveButton(liveEnabled);
  }
  async function loadLiveSetting() {
    try {
      const { data, error } = await sb.from('ai_voice_config').select('is_enabled').eq('id', 1).maybeSingle();
      if (error) throw error;
      liveConfigAvailable = !!data;
      setLiveButton(!!data?.is_enabled);
    } catch (e) {
      liveConfigAvailable = false;
      setLiveButton(false);
      console.info('Gemini Live stays hidden until its SQL setup is applied.');
    }
  }
  const originalRenderAI = window.renderAdminAI;
  if (typeof originalRenderAI === 'function') window.renderAdminAI = async function (main) {
    await originalRenderAI.apply(this, arguments);
    const { data, error } = await sb.from('ai_voice_config').select('is_enabled').eq('id', 1).maybeSingle();
    liveConfigAvailable = !error && !!data;
    const card = document.createElement('div'); card.className = 'card so-live-card';
    card.innerHTML = `<div class="toggle-row"><div><div class="toggle-lbl">Gemini Live Voice</div><div class="toggle-sub">Show or hide the Live voice button for all visitors.</div></div><label class="switch"><input id="so-live-toggle" type="checkbox" ${data?.is_enabled ? 'checked' : ''} ${liveConfigAvailable ? '' : 'disabled'}><span class="switch-track"></span></label></div>${liveConfigAvailable ? '' : '<div class="muted-note">Run the attached SQL file to enable this setting.</div>'}<button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="saveGeminiLiveSetting()" ${liveConfigAvailable ? '' : 'disabled'}>Save Live setting</button>`;
    main.prepend(card);
  };
  window.saveGeminiLiveSetting = async function () {
    if (!liveConfigAvailable) { toast('Run the attached SQL file first.'); return; }
    const enabled = !!document.getElementById('so-live-toggle')?.checked;
    const { error } = await sb.from('ai_voice_config').update({ is_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) { toast('Could not save the Gemini Live setting.'); return; }
    setLiveButton(enabled); toast(enabled ? 'Live voice is now visible to visitors.' : 'Live voice is now hidden from visitors.');
  };

  const originalInitAiWidget = window.initAiWidget;
  if (typeof originalInitAiWidget === 'function') window.initAiWidget = function () {
    const result = originalInitAiWidget.apply(this, arguments);
    syncAiVisibility();
    return result;
  };
  async function refreshAiPublicSetting() {
    try {
      const { data, error } = await sb.from('ai_public_settings').select('*').maybeSingle();
      if (!error && data) { S.aiPublic = data; if (typeof window.initAiWidget === 'function') window.initAiWidget(); else syncAiVisibility(); }
    } catch (_) { /* Keep the last known visibility state if the connection is unavailable. */ }
  }

  function categorySlug(name) {
    const arabic = { 'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z','ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','ة':'a','و':'w','ي':'y','ى':'a','ئ':'y','ؤ':'w' };
    return String(name || '').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '').toLowerCase()
      .replace(/[\u0621-\u064A]/g, ch => arabic[ch] || '')
      .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  }
  const originalOpenCategory = window.openCategoryModal;
  if (typeof originalOpenCategory === 'function') window.openCategoryModal = function () {
    const result = originalOpenCategory.apply(this, arguments);
    const slugInput = document.getElementById('cm-slug');
    if (slugInput) {
      const group = slugInput.closest('.fgroup');
      if (group) group.classList.add('hide');
      slugInput.required = false;
      slugInput.tabIndex = -1;
    }
    return result;
  };
  const originalSaveCategory = window.saveCategory;
  if (typeof originalSaveCategory === 'function') window.saveCategory = async function (id) {
    const name = document.getElementById('cm-name')?.value.trim() || '';
    const slugInput = document.getElementById('cm-slug');
    if (slugInput) slugInput.value = categorySlug(name);
    if (!slugInput?.value) { toast('Use a category name with at least one letter or number.'); return; }
    const { data, error } = await sb.from('categories').select('id').eq('slug', slugInput.value);
    if (error) { toast('Could not check the generated category URL. Try again.'); return; }
    if ((data || []).some(row => row.id !== id)) { toast('That category URL is already in use. Change the name slightly.'); return; }
    return originalSaveCategory.apply(this, arguments);
  };

  document.addEventListener('DOMContentLoaded', async () => { await Promise.all([loadLiveSetting(), refreshAiPublicSetting()]); });
  window.addEventListener('pageshow', loadLiveSetting);
  window.setInterval(loadLiveSetting, 30000);
  window.setInterval(refreshAiPublicSetting, 30000);
  setLiveButton(false);
  syncAiVisibility();
})();

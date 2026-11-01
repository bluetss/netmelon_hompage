/* Shared web appearance behavior. Palette values remain app-owned tokens. */
(() => {
  const root = document.documentElement;
  const key = 'appearance.theme_mode';
  const modes = ['system', 'light', 'dark'];
  const media = matchMedia('(prefers-color-scheme: dark)');
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Storage is optional. */ }
  root.dataset.themeMode = modes.includes(saved) ? saved : 'system';
  const apply = () => {
    const mode = root.dataset.themeMode;
    root.dataset.theme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    root.style.colorScheme = `only ${root.dataset.theme}`;
    const color = getComputedStyle(root).getPropertyValue('--npq-color-surface').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    document.querySelectorAll('button[data-theme-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeMode === mode));
    });
  };
  apply();
  media.addEventListener('change', apply);
  addEventListener('pageshow', apply);
  addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    root.dataset.themeMode = modes.includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
  document.addEventListener('DOMContentLoaded', apply);
  let dialog;
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-theme-open]')) {
      if (!dialog) {
        const en = root.lang.startsWith('en');
        dialog = document.createElement('dialog');
        dialog.className = 'web-theme-dialog';
        dialog.setAttribute('aria-labelledby', 'web-theme-title');
        dialog.innerHTML = `<header><h2 id="web-theme-title">${en ? 'Theme' : '화면 테마'}</h2><button type="button" data-theme-close>${en ? 'Close' : '닫기'}</button></header><div role="group" aria-labelledby="web-theme-title">${modes.map((mode, i) => `<button type="button" data-theme-mode="${mode}">${(en ? ['System setting', 'Light mode', 'Dark mode'] : ['시스템 설정', '라이트 모드', '다크 모드'])[i]}</button>`).join('')}</div>`;
        document.body.append(dialog);
        dialog.addEventListener('click', event => {
          if (event.target !== dialog) return;
          const box = dialog.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
        });
      }
      apply();
      dialog.showModal();
    }
    if (target?.closest('[data-theme-close]')) dialog?.close();
    const choice = target?.closest('button[data-theme-mode]');
    if (choice && modes.includes(choice.dataset.themeMode)) {
      root.dataset.themeMode = choice.dataset.themeMode;
      try { localStorage.setItem(key, root.dataset.themeMode); } catch { /* Keep the in-page selection. */ }
      apply();
      dialog?.close();
    }
  });
})();

(() => {
  'use strict';
  const storageKey = 'reestr-color-theme';
  let theme = 'light';
  try { theme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light'; } catch {}
  const apply = value => {
    theme = value;
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const dark = value === 'dark';
      button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      button.querySelector('.theme-toggle-icon').textContent = dark ? '☀' : '☾';
      button.querySelector('.theme-toggle-label').textContent = dark ? 'Светлая тема' : 'Тёмная тема';
    });
  };
  apply(theme);
  document.addEventListener('DOMContentLoaded', () => {
    apply(theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        apply(theme === 'dark' ? 'light' : 'dark');
        try { localStorage.setItem(storageKey, theme); } catch {}
      });
    });
  });
  let themeBeforePrint = null;
  window.addEventListener('beforeprint', () => {
    themeBeforePrint = theme;
    apply('light');
  });
  window.addEventListener('afterprint', () => {
    if (themeBeforePrint) apply(themeBeforePrint);
    themeBeforePrint = null;
  });
})();

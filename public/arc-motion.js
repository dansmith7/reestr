/* UIArc motion presets, adapted to the registry's DOM UI.
 * Source: https://github.com/kuratlielia/arc-library/blob/main/registry/motion-tokens.ts
 * MIT, copyright (c) 2026 Elia Kuratli. See vendor/LICENSES.txt.
 * Engine: Motion 14.4.0, bundled locally in vendor/motion.js.
 */
(() => {
  const tokens = {
    duration: { instant: 0.12, fast: 0.16, exit: 0.18, standard: 0.24 },
    ease: { enter: [0.16, 1, 0.3, 1], standard: [0.22, 1, 0.36, 1] },
    spring: {
      snappy: { type: 'spring', visualDuration: 0.26, bounce: 0.12 },
      smooth: { type: 'spring', visualDuration: 0.4, bounce: 0 },
      morph: { type: 'spring', visualDuration: 0.42, bounce: 0.16 },
    },
    stagger: { item: 0.035 },
    blur: { subtle: 2 },
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animate = (...args) => window.ReestrMotion?.animate(...args);
  const disclosures = new WeakMap();
  const dialogAnimations = new WeakMap();
  const projectAnimations = new WeakMap();

  function resetProject(root) {
    projectAnimations.get(root)?.forEach(animation => animation.cancel());
    projectAnimations.delete(root);
  }
  function projectEnter(root) {
    resetProject(root);
    if (reduced.matches) return;
    // Animate disposable content blocks, leaving the interactive root untouched.
    // No forwards fill or inline styles survive the transition.
    const animations = [...root.children].filter(element => element.animate).map((element, index) => {
      const animation = element.animate([
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], {
        duration: tokens.spring.smooth.visualDuration * 1000,
        delay: Math.min(index, 4) * tokens.stagger.item * 1000,
        easing: `cubic-bezier(${tokens.ease.enter.join(',')})`,
        fill: 'backwards',
      });
      animation.onfinish = () => animation.cancel();
      return animation;
    });
    projectAnimations.set(root, animations);
  }

  function attach(root = document) {
    root.querySelectorAll('details.stage, details.past-stages').forEach(element => {
      if (disclosures.has(element)) return;
      const summary = element.querySelector(':scope > summary');
      const panel = element.querySelector(':scope > .stage-details, :scope > .past-stages-content');
      if (!summary || !panel) return;
      const state = { open: element.open, generation: 0, height: null, content: null };
      disclosures.set(element, state);
      panel.inert = !state.open;
      const arrow = summary.querySelector('.chevron');
      if (arrow) arrow.style.transform = `rotate(${state.open ? 180 : 0}deg)`;
      if (!state.open && !reduced.matches && window.ReestrMotion) {
        panel.style.opacity = '0';
        panel.style.transform = 'translateY(6px)';
        panel.style.filter = 'blur(2px)';
      }
      summary.setAttribute('aria-expanded', String(state.open));
      summary.addEventListener('click', event => {
        if (event.target.closest('button, a, input')) return;
        if (!window.ReestrMotion || reduced.matches) return;
        event.preventDefault();
        const from = element.getBoundingClientRect().height;
        state.height?.stop();
        state.content?.stop();
        state.open = !state.open;
        const generation = ++state.generation;
        if (arrow) animate(arrow, { rotate: state.open ? 180 : 0 }, tokens.spring.snappy);
        summary.setAttribute('aria-expanded', String(state.open));
        panel.inert = !state.open;
        element.open = true;
        element.style.height = 'auto';
        const border = parseFloat(getComputedStyle(element).borderTopWidth) + parseFloat(getComputedStyle(element).borderBottomWidth);
        const to = state.open ? element.getBoundingClientRect().height : summary.getBoundingClientRect().height + border;
        element.style.height = from + 'px';
        element.style.overflow = 'hidden';
        state.height = animate(element, { height: to }, tokens.spring.smooth);
        state.content = animate(panel, {
          opacity: state.open ? 1 : 0,
          y: state.open ? 0 : 6,
          filter: state.open ? 'blur(0px)' : `blur(${tokens.blur.subtle}px)`,
        }, { duration: state.open ? tokens.duration.standard : tokens.duration.fast, ease: tokens.ease.standard });
        state.height.then(() => {
          if (generation !== state.generation) return;
          element.open = state.open;
          element.style.height = '';
          element.style.overflow = '';
        });
      });
      element.addEventListener('toggle', () => {
        // Native toggles remain the fallback for reduced motion and script failure.
        if (reduced.matches || !window.ReestrMotion) {
          state.open = element.open;
          if (arrow) arrow.style.transform = `rotate(${state.open ? 180 : 0}deg)`;
          panel.inert = !element.open;
          summary.setAttribute('aria-expanded', String(element.open));
          panel.style.opacity = '';
          panel.style.filter = '';
          panel.style.transform = '';
        }
      });
    });
  }

  reduced.addEventListener('change', () => {
    document.querySelectorAll('details.stage, details.past-stages').forEach(element => {
      const state = disclosures.get(element);
      if (!state) return;
      state.generation++;
      state.height?.stop();
      state.content?.stop();
      element.open = state.open;
      const arrow = element.querySelector(':scope > summary .chevron');
      if (arrow) arrow.style.transform = `rotate(${state.open ? 180 : 0}deg)`;
      element.style.height = '';
      element.style.overflow = '';
      const panel = element.querySelector(':scope > .stage-details, :scope > .past-stages-content');
      panel?.removeAttribute('style');
    });
  });

  function enter(element) {
    if (!element || !window.ReestrMotion) return;
    animate(element, reduced.matches ? { opacity: [0, 1] } : { opacity: [0, 1], y: [8, 0] },
      reduced.matches ? { duration: tokens.duration.instant } : tokens.spring.smooth);
    attach(element);
  }
  function cards(root) {
    if (!window.ReestrMotion || reduced.matches) return;
    root.querySelectorAll('.project').forEach((element, i) => {
      animate(element, { opacity: [0, 1], y: [8, 0] }, {
        ...tokens.spring.smooth, delay: Math.min(i, 8) * tokens.stagger.item,
      })?.then(() => { element.style.transform = ''; });
    });
  }
  function resetDialog(element) {
    const previous = dialogAnimations.get(element);
    if (previous) {
      previous.controls?.stop();
      previous.surface.style.removeProperty('opacity');
      previous.surface.style.removeProperty('transform');
      dialogAnimations.delete(element);
    }
  }
  function dialog(element, opening) {
    resetDialog(element);
    if (!opening || !window.ReestrMotion) return null;
    // Animate the contents, never the native dialog/top-layer surface itself.
    const surface = element.querySelector(':scope > form') || element.querySelector('.history-list') || element.firstElementChild;
    if (!surface) return null;
    const controls = animate(surface,
      reduced.matches ? { opacity: [0, 1] } : { opacity: [0, 1], y: [8, 0] },
      reduced.matches ? { duration: tokens.duration.instant } : tokens.spring.smooth);
    dialogAnimations.set(element, { surface, controls });
    return controls;
  }
  window.ArcMotion = { tokens, attach, enter, cards, dialog, resetDialog, projectEnter, resetProject };
})();


    'use strict';
    let data = { stages: [], projects: [], details: {} };
    const state = { id: null, search: '', routes: {} };
    let selectedDate;
    let requestGeneration = 0;
    let editor = null;
    const main = document.getElementById('main');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dateOnly = value => value ? String(value).slice(0,10) : '';
    const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
    function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value+'T12:00:00Z').getTime()) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value ? value : null; }
    selectedDate = validDate(new URLSearchParams(location.search).get('date')) || today();
    const stamp = value => value ? new Date(dateOnly(value) + 'T12:00:00Z').getTime() : null;
    const days = (start,end) => start && end ? Math.round((stamp(end) - stamp(start)) / 86400000) : null;
    function fmt(value, format = 'long') {
      if (!value) return '—';
      return new Date(dateOnly(value) + 'T12:00:00Z').toLocaleDateString('ru-RU', format === 'short' ? { day:'2-digit', month:'2-digit', year:'2-digit' } : { day:'numeric', month:'short', year:'numeric' });
    }
    const currentProject = () => data.projects.find(p => p.id === state.id);
    const detail = p => data.details[String(p.id)] || { history: [], milestones: [] };
    const position = p => p.stage_index == null ? -1 : Number(p.stage_index);
    let orderedStages = [];
    const stageOrdinal = p => orderedStages.findIndex(s => Number(s.id) === Number(p.stage_id));
    const finished = p => /реестр получен/i.test(p.status || '');
    const icon = id => `<svg aria-hidden="true"><use href="#icon-${id}"/></svg>`;
    const findStage = name => orderedStages.find(s => s.name === name);
    function point(p, name) { const s = findStage(name); return detail(p).milestones.find(m => Number(m.stage_id) === Number(s?.id)) || {}; }
    function alerts(p) {
      if (finished(p)) return [];
      const notes = [];
      if (p.stale) notes.push(`Статус не обновлялся ${Math.max(0, days(p.updated_at, selectedDate) || 0)} дн. Уточните текущее состояние проекта.`);
      const submission = findStage('Заявка в ГИСП подана');
      if (p.planned_submission_date && dateOnly(p.planned_submission_date) < selectedDate && position(p) < Number(submission?.position ?? 6)) notes.push(`Плановая дата подачи прошла ${fmt(p.planned_submission_date)}. Подача заявки ещё не отражена в статусе.`);
      if (p.planned_registry_received_date && dateOnly(p.planned_registry_received_date) < selectedDate) notes.push(`Плановая дата получения записи прошла ${fmt(p.planned_registry_received_date)}. Уточните прогноз.`);
      return notes;
    }
    function renderProjects() {
      const list = data.projects.filter(p => p.name.toLowerCase().includes(state.search.toLowerCase()));
      document.getElementById('project-count').textContent = data.projects.length;
      document.getElementById('project-list').innerHTML = list.map(p => `<button class="project-button ${p.id === state.id ? 'active' : ''}" data-project="${p.id}" ${p.id === state.id ? 'aria-current="page"' : ''}>
        <span class="project-dot ${finished(p) ? 'finished' : alerts(p).length ? 'attention' : 'active-stage'}"></span>
        <span class="project-label"><span class="project-name-text">${esc(p.name)}</span><small>${finished(p) ? 'Запись получена' : `Этап ${stageOrdinal(p) + 1} из ${orderedStages.length}`}</small></span>
        <span class="project-progress">${finished(p) ? '✓' : '›'}</span></button>`).join('') || '<p class="empty-note">Проект не найден</p>';
    }
    function submissionPassed(p) {
      const submission = findStage('Заявка в ГИСП подана');
      if (submission && position(p) >= Number(submission.position)) return true;
      const actual = point(p, 'Заявка в ГИСП подана').actual_date;
      return Boolean(actual && dateOnly(actual) <= selectedDate);
    }
    function agreementsCard(p) {
      return `<section class="card side-card agreements-card"><h2>Текущие договорённости</h2><div class="note-block"><div class="note-label">Срок / ожидание</div>${p.timing ? `<p class="note-value">${esc(p.timing)}</p>` : '<p class="empty-note">Не указано в последнем статусе</p>'}</div><div class="note-block"><div class="note-label">Комментарий</div>${p.comment ? `<p class="note-value">${esc(p.comment)}</p>` : '<p class="empty-note">Комментарий не добавлен</p>'}</div></section>`;
    }
    function forecastClass(forecast, actual) {
      if (!forecast) return '';
      return dateOnly(actual || today()) > dateOnly(forecast) ? 'forecast-overdue' : 'forecast-on-track';
    }
    function keyDate(p, title, target, stageName) {
      const m = point(p, stageName);
      const fact = m.actual_date;
      const secondary = fact || m.forecast_date;
      return `<section class="card key-date"><div class="key-date-head"><span>${title}</span>${icon('calendar')}</div><div class="key-date-columns">
        <div><small>План проекта</small><strong class="${target ? '' : 'missing'}">${target ? fmt(target) : 'Не указан'}</strong></div>
        <div><small>${fact ? 'Подтверждённый факт' : 'Текущий прогноз'}</small><strong class="${secondary ? fact ? 'fact-date' : forecastClass(secondary) : 'missing'}">${secondary ? fmt(secondary) : 'Не указан'}</strong></div>
      </div></section>`;
    }
    const phases = [
      { label:'Подготовка', from:0, to:4 }, { label:'Подача заявки', from:5, to:6 },
      { label:'Проверки', from:7, to:11 }, { label:'Экспертиза', from:12, to:14 }, { label:'Реестровая запись', from:15, to:Infinity }
    ];
    function stageDetails(p,s,m) {
      const delta = days(m.baseline_date, m.actual_date || m.forecast_date);
      const note = [];
      if (delta !== null) note.push(`<p><b>${m.actual_date ? 'Факт' : 'Прогноз'} к плану этапа:</b> ${delta > 0 ? '+' : ''}${delta} дн.</p>`);
      if (m.delay_reason) note.push(`<p><b>Причина переноса:</b> ${esc(m.delay_reason)}</p>`);
      if (m.comment) note.push(`<p><b>Комментарий к вехе:</b> ${esc(m.comment)}</p>`);
      if (!m.actual_date && Number(s.position) < position(p)) note.push('<p>Текущий статус проекта расположен дальше по маршруту. Фактическая дата этого этапа отдельно не подтверждена.</p>');
      if (!note.length) note.push('<p>Дополнительные сведения по этапу не заполнены.</p>');
      return note.join('') + `<button class="button stage-edit" data-editor="milestone" data-stage="${Number(s.id)}">Изменить даты этапа</button>`;
    }
    function routeRow(p,s,index) {
      const m = detail(p).milestones.find(v => Number(v.stage_id) === Number(s.id)) || {};
      const current = Number(s.id) === Number(p.stage_id);
      const before = Number(s.position) < position(p);
      const delta = days(m.baseline_date, m.actual_date || m.forecast_date);
      const label = current ? 'Текущий статус' : m.actual_date ? 'Факт подтверждён' : before ? 'До текущего статуса' : '';
      const cell = (value, late, label, forecast = '') => `<span data-label="${label}" class="route-date ${!value ? 'blank' : forecast || (late ? 'late' : '')}">${fmt(value,'short')}</span>`;
      const stored = state.routes[p.id];
      const opened = stored ? stored.stages.includes(Number(s.id)) : current;
      return `<details data-stage="${Number(s.id)}" class="stage ${current ? 'current' : ''} ${m.actual_date ? 'actual' : ''}" ${opened ? 'open' : ''}>
        <summary><span class="stage-node">${m.actual_date ? '✓' : index + 1}</span><span class="stage-title">${esc(s.name)}${label ? `<span class="stage-label" style="display:block">${label}</span>` : ''}</span>
        ${cell(m.baseline_date,false,'План')}${cell(m.forecast_date,false,'Прогноз',forecastClass(m.forecast_date,m.actual_date))}${cell(m.actual_date,!!m.actual_date && delta > 0,'Факт')}<span class="chevron" aria-hidden="true">⌄</span></summary>
        <div class="stage-details">${stageDetails(p,s,m)}</div></details>`;
    }
    function renderRoute(p) {
      const previous = orderedStages.filter(s => Number(s.position) < position(p));
      const visible = orderedStages.filter(s => Number(s.position) >= position(p));
      function groupedRows(stages) {
        return phases.map((phase,i) => {
          const group = stages.filter(s => Number(s.position) >= phase.from && Number(s.position) <= phase.to);
          if (!group.length) return '';
          return `<div class="phase-heading"><span class="phase-number">0${i+1}</span>${phase.label}<span class="phase-line"></span></div>${group.map(s => routeRow(p,s,orderedStages.indexOf(s))).join('')}`;
        }).join('');
      }
      const past = previous.length ? `<details class="past-stages" ${state.routes[p.id]?.past ? 'open' : ''}><summary><span>Пройденные этапы</span><span class="past-count">${previous.length}</span><span class="past-action"><span class="past-open">Показать</span><span class="past-close">Скрыть</span></span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="past-stages-content">${groupedRows(previous)}</div></details>` : '';
      return `<div class="route-labels"><span>Этап</span><span>План</span><span>Прогноз</span><span>Факт</span><span></span></div>${past}${groupedRows(visible)}<div class="legend"><span><i class="legend-dot current"></i>Текущий этап</span><span><i class="legend-dot actual"></i>Подтверждённый факт</span><span><i class="legend-dot"></i>Без фактической даты</span></div>`;
    }
    function upcoming(p) {
      if (finished(p)) return '<p class="empty-note">Реестровая запись получена. Маршрут проекта завершён.</p>';
      const dates = detail(p).milestones.filter(m => !m.actual_date && Number(m.stage_position) >= position(p) && (m.forecast_date || m.baseline_date)).map(m => ({ name:m.stage_name, date:m.forecast_date || m.baseline_date, source:m.forecast_date ? 'Прогноз этапа' : 'План этапа' }));
      const submissionStage = findStage('Заявка в ГИСП подана');
      if (p.planned_submission_date && position(p) < Number(submissionStage?.position ?? 6)) dates.push({ name:'Подача заявки', date:p.planned_submission_date, source:'План проекта' });
      if (p.planned_registry_received_date) dates.push({ name:'Получение реестровой записи', date:p.planned_registry_received_date, source:'План проекта' });
      const seen = new Set();
      const sorted = dates.sort((a,b) => dateOnly(a.date).localeCompare(dateOnly(b.date))).filter(x => { const key = x.name + dateOnly(x.date); if(seen.has(key)) return false; seen.add(key); return true; }).slice(0,3);
      return sorted.length ? sorted.map(x => { const d = new Date(dateOnly(x.date)+'T12:00:00Z'); return `<div class="upcoming-item"><div class="calendar"><strong>${d.getUTCDate()}</strong>${d.toLocaleDateString('ru-RU',{month:'short'})}</div><div><b>${esc(x.name)}</b><small>${esc(x.source)} · ${fmt(x.date)}</small></div></div>`; }).join('') : '<p class="empty-note">Даты следующих этапов пока не заполнены.</p>';
    }
    function historyHtml(history) {
      if (!history.length) return '<li class="empty-note">История изменений пока пуста.</li>';
      return history.map(h => `<li class="history-item"><time datetime="${esc(dateOnly(h.effective_date || h.created_at))}">${fmt(h.effective_date || h.created_at)}</time><b>${esc(h.stage_name || 'Статус обновлён')}</b>${h.comment ? `<p>${esc(h.comment)}</p>` : ''}${h.timing ? `<p>${esc(h.timing)}</p>` : ''}</li>`).join('');
    }
    function renderMain() {
      const p = currentProject();
      captureRouteState();
      if (!p) { main.innerHTML = '<p>В срезе нет проектов.</p>'; return; }
      const done = finished(p), ordinal = stageOrdinal(p), next = orderedStages[ordinal + 1];
      const history = detail(p).history;
      const submitted = submissionPassed(p);
      const submissionCard = keyDate(p,'Подача заявки в ГИСП',p.planned_submission_date,'Заявка в ГИСП подана');
      const agreements = agreementsCard(p);
      main.innerHTML = `
        <div class="breadcrumb"><a href="${overviewUrl()}">Проекты</a> <span>/</span><span>Паспорт № ${String(p.id).padStart(3,'0')}</span></div>
        <div class="heading"><div><h1>${esc(p.name)}</h1><div class="project-meta"><span class="status ${done ? 'finished' : ''}">${done ? 'Реестр получен' : 'В работе'}</span><span>·</span><span>Статус от ${fmt(p.updated_at)}</span></div></div><button class="button print-button" data-action="print">${icon('print')}Печать</button></div>
        <div class="heading-actions"><button class="button button-primary" data-editor="status">Обновить статус</button><button class="button" data-editor="targets">Плановые даты проекта</button></div>
        ${selectedDate !== today() ? '<div class="historical-note">Статус и история показаны на выбранную дату. Плановые даты и вехи — актуальные.</div>' : ''}
        <section class="card current-card"><div><div class="overline">${done ? 'Результат проекта' : 'Где проект сейчас'}</div><h2>${esc(p.status || 'Статус ещё не указан')}</h2><div class="next-line">${done ? 'Все этапы маршрута пройдены по текущему статусу.' : next ? `Следующий этап: <b>${esc(next.name)}</b>` : 'Следующий этап пока не определён.'}</div></div><div class="stage-position"><strong>${String(ordinal + 1).padStart(2,'0')} <span>/ ${orderedStages.length}</span></strong><small>Положение в маршруте</small><div class="segment-track" aria-hidden="true">${orderedStages.map((s,i) => `<i class="${i < ordinal ? 'passed' : i === ordinal ? 'current' : ''}"></i>`).join('')}</div></div></section>
        ${alerts(p).map(a => `<div class="alert">${icon('alert')}<span>${esc(a)}</span></div>`).join('')}
        <div class="key-dates">${submitted ? agreements : submissionCard}${keyDate(p,'Получение реестровой записи',p.planned_registry_received_date,'Реестр получен')}</div>
        <div class="content-grid"><section><div class="section-title"><h2>Маршрут проекта</h2><small>${orderedStages.length} этапов</small></div><div class="route-subtitle">Текущий и будущие этапы · пройденные свёрнуты</div><div class="card route" id="route">${renderRoute(p)}</div></section>
        <aside class="right-column" aria-label="Сведения о проекте">${submitted ? submissionCard : agreements}
        <section class="card side-card"><h2>Контрольные даты ${icon('calendar')}</h2>${upcoming(p)}</section>
        <section class="card side-card"><h2>Последние изменения <span class="count">${history.length}</span></h2><ol class="history-list">${historyHtml(history.slice(0,4))}</ol>${history.length > 4 ? `<button class="button history-more" data-action="history">Вся история · ${history.length} записей →</button>` : ''}</section></aside></div>
        <div class="footer-actions"><div class="footer">Срез на ${fmt(selectedDate)} Фактические даты показаны только там, где они заполнены отдельно.</div><button class="button button-danger" data-action="delete-project">Удалить проект</button></div>`;
      main.dataset.projectId = String(p.id);
      document.title = `${p.name} — карточка проекта`;
      // Never transform the interactive root: re-rendering it can leave stale hit-test regions.
      main.style.removeProperty('transform');
      main.style.removeProperty('opacity');
      window.ArcMotion?.attach(main);
    }

    function overviewUrl() { return '/index.html?date=' + encodeURIComponent(selectedDate); }
    function syncNavigation(push = false) {
      const url = new URL(location.href);
      if (state.id != null) url.searchParams.set('id', String(state.id));
      url.searchParams.set('date', selectedDate);
      history[push ? 'pushState' : 'replaceState']({}, '', url);
      document.getElementById('snapshot-date').value = selectedDate;
      document.getElementById('overview-link').href = overviewUrl();
      document.getElementById('overview-brand').href = overviewUrl();
    }
    function captureRouteState() {
      const id = main.dataset.projectId;
      if (!id) return;
      const open = element => element.querySelector(':scope > summary')?.getAttribute('aria-expanded') === 'true' ||
        (!element.querySelector(':scope > summary')?.hasAttribute('aria-expanded') && element.open);
      const past = main.querySelector('.past-stages');
      state.routes[id] = {
        past: past ? open(past) : false,
        stages: [...main.querySelectorAll('details.stage')].filter(open).map(s => Number(s.dataset.stage)),
      };
    }
    function loading() {
      captureRouteState();
      main.dataset.projectId = '';
      main.setAttribute('aria-busy', 'true');
      main.innerHTML = '<div class="loading-state" role="status">Загружаем карточку проекта…</div>';
    }
    function showError(error) {
      main.removeAttribute('aria-busy');
      main.innerHTML = `<div class="error-state" role="alert">${esc(error.message || 'Не удалось загрузить проект')}</div><button class="button" data-action="retry">Повторить загрузку</button><a class="button" href="${overviewUrl()}">Все проекты</a>`;
    }
    async function api(path, options = {}) {
      const response = await fetch(path, { credentials: 'same-origin', ...options });
      let result;
      try { result = await response.json(); }
      catch { throw new Error(response.status === 401 ? 'Сессия недоступна. Откройте реестр и войдите снова.' : 'Сервер вернул неожиданный ответ. Попробуйте ещё раз.'); }
      if (!response.ok || result.error) throw new Error(result.error || 'Не удалось выполнить запрос');
      return result;
    }
    async function loadDetails(id, target = data, snapshotDate = selectedDate) {
      if (target.details[id]) return;
      const [historyResult, milestonesResult] = await Promise.all([
        api('/api/history/' + id), api('/api/milestones/' + id),
      ]);
      if (!Array.isArray(historyResult.history) || !Array.isArray(milestonesResult.milestones)) throw new Error('Неверный формат истории или вех проекта');
      target.details[id] = {
        history: historyResult.history.filter(h => dateOnly(h.created_at) <= snapshotDate),
        milestones: milestonesResult.milestones,
      };
    }
    async function loadRegistry({ showLoading = true } = {}) {
      const generation = ++requestGeneration;
      if (showLoading) loading();
      try {
        const snapshotDate = selectedDate;
        const result = await api('/api/data?date=' + encodeURIComponent(snapshotDate));
        if (generation !== requestGeneration) return false;
        if (!Array.isArray(result.projects) || !Array.isArray(result.stages)) throw new Error('Не удалось прочитать список проектов');
        const next = { ...result, details: {} };
        const id = state.id ?? next.projects[0]?.id;
        if (!next.projects.some(p => p.id === id)) {
          data = next;
          orderedStages = [...data.stages].sort((a,b) => Number(a.position) - Number(b.position));
          renderProjects();
          throw new Error('Проект не найден на выбранную дату. Выберите другой проект или измените дату среза.');
        }
        // Build a complete fresh snapshot before replacing the visible card.
        await loadDetails(id, next, snapshotDate);
        if (generation !== requestGeneration) return false;
        data = next;
        state.id = id;
        orderedStages = [...data.stages].sort((a,b) => Number(a.position) - Number(b.position));
        syncNavigation();
        renderProjects();
        main.removeAttribute('aria-busy');
        renderMain();
        return true;
      } catch (error) {
        if (generation === requestGeneration) {
          if (showLoading) showError(error);
          else toast('Изменения сохранены. Обновить карточку не удалось: ' + error.message);
        }
        return false;
      }
    }
    async function selectProject(id, push = true) {
      captureRouteState();
      state.id = Number(id);
      const generation = ++requestGeneration;
      syncNavigation(push);
      renderProjects();
      loading();
      try {
        if (!currentProject()) throw new Error('Проект не найден на выбранную дату');
        await loadDetails(state.id);
        if (generation !== requestGeneration) return;
        main.removeAttribute('aria-busy');
        renderMain();
      } catch (error) { if (generation === requestGeneration) showError(error); }
    }

    const editorDialog = document.getElementById('editor-dialog');
    const editorForm = document.getElementById('editor-form');
    let saving = false;
    let toastTimer;
    function toast(message) {
      const element = document.getElementById('save-toast');
      clearTimeout(toastTimer);
      element.textContent = message;
      element.hidden = false;
      window.ArcMotion?.enter(element);
      toastTimer = setTimeout(() => { element.hidden = true; }, 3000);
    }
    function field(name, label, type, value, required = false) {
      const input = type === 'textarea'
        ? `<textarea id="field-${name}" name="${name}">${esc(value)}</textarea>`
        : `<input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''}>`;
      return `<div class="field"><label for="field-${name}">${label}</label>${input}</div>`;
    }
    function openEditor(mode, stageId) {
      const p = currentProject();
      if (!p) return;
      let title, fields;
      if (mode === 'status') {
        title = 'Обновить статус';
        fields = field('effective_date', 'Дата события (факт этапа)', 'date', selectedDate, true) +
          `<div class="field"><label for="field-stage_id">Этап</label><select id="field-stage_id" name="stage_id" required>${orderedStages.map((s,i) => `<option value="${Number(s.id)}" ${Number(s.id) === Number(p.stage_id) ? 'selected' : ''}>${i+1}. ${esc(s.name)}</option>`).join('')}</select></div>` +
          field('timing', 'Срок / ожидание', 'text', p.timing || '') + field('comment', 'Комментарий', 'textarea', '');
      } else if (mode === 'targets') {
        title = 'Плановые даты проекта';
        fields = field('planned_submission_date', 'Подача заявки в ГИСП', 'date', dateOnly(p.planned_submission_date)) +
          field('planned_registry_received_date', 'Получение реестровой записи', 'date', dateOnly(p.planned_registry_received_date));
      } else if (mode === 'milestone') {
        const m = detail(p).milestones.find(m => Number(m.stage_id) === Number(stageId));
        if (!m) return;
        title = m.stage_name;
        fields = field('baseline_date', 'Базовый план', 'date', dateOnly(m.baseline_date)) +
          field('forecast_date', 'Текущий прогноз', 'date', dateOnly(m.forecast_date)) +
          field('actual_date', 'Фактическая дата события', 'date', dateOnly(m.actual_date)) +
          field('delay_reason', 'Причина переноса', 'text', m.delay_reason || '') +
          field('comment', 'Комментарий', 'textarea', m.comment || '');
      } else return;
      editor = { mode, stageId: Number(stageId), projectId: p.id };
      document.getElementById('editor-title').textContent = title;
      document.getElementById('editor-subtitle').textContent = p.name;
      document.getElementById('editor-fields').innerHTML = fields;
      document.getElementById('editor-error').hidden = true;
      editorDialog.showModal();
      window.ArcMotion?.dialog(editorDialog, true);
    }
    function hideDialog(element) {
      // Close the native modal synchronously so no invisible top-layer surface can intercept clicks.
      window.ArcMotion?.resetDialog(element);
      if (element.open) element.close();
      element.style.removeProperty('opacity');
      element.style.removeProperty('transform');
    }
    document.getElementById('cancel-editor').addEventListener('click', () => { if (!saving) hideDialog(editorDialog); });
    editorDialog.addEventListener('cancel', event => { event.preventDefault(); if (!saving) hideDialog(editorDialog); });
    editorForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (saving || !editor || !editorForm.reportValidity()) return;
      saving = true;
      const button = document.getElementById('save-editor');
      button.disabled = true;
      button.textContent = 'Сохраняем…';
      editorForm.setAttribute('aria-busy', 'true');
      document.getElementById('editor-error').hidden = true;
      const savedEditor = { ...editor };
      try {
        const values = Object.fromEntries(new FormData(editorForm));
        let path, method = 'PUT', payload;
        if (savedEditor.mode === 'status') {
          path = '/api/status'; method = 'POST';
          payload = { project_id: savedEditor.projectId, stage_id: Number(values.stage_id), effective_date: values.effective_date, timing: values.timing, comment: values.comment };
        } else if (savedEditor.mode === 'targets') {
          path = '/api/projects/' + savedEditor.projectId + '/targets';
          payload = { planned_submission_date: values.planned_submission_date || null, planned_registry_received_date: values.planned_registry_received_date || null };
        } else {
          path = '/api/milestones/' + savedEditor.projectId;
          payload = { stage_id: savedEditor.stageId, baseline_date: values.baseline_date || null, forecast_date: values.forecast_date || null, actual_date: values.actual_date || null, delay_reason: values.delay_reason, comment: values.comment };
        }
        await api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        captureRouteState();
        if (savedEditor.mode === 'status') {
          selectedDate = values.effective_date;
          delete state.routes[savedEditor.projectId];
          main.dataset.projectId = '';
        }
        hideDialog(editorDialog);
        editorDialog.removeAttribute('style');
        toast(savedEditor.mode === 'status' ? 'Статус проекта обновлён' : savedEditor.mode === 'targets' ? 'Плановые даты сохранены' : 'Даты этапа сохранены');
        await loadRegistry({ showLoading: false });
        const selector = `[data-editor="${savedEditor.mode}"]` + (savedEditor.mode === 'milestone' ? `[data-stage="${savedEditor.stageId}"]` : '');
        main.querySelector(selector)?.focus({ preventScroll: true });
      } catch (error) {
        const element = document.getElementById('editor-error');
        element.textContent = error.message;
        element.hidden = false;
      } finally {
        saving = false;
        button.disabled = false;
        button.textContent = 'Сохранить';
        editorForm.removeAttribute('aria-busy');
      }
    });
    document.getElementById('search').addEventListener('input', event => { state.search = event.target.value; renderProjects(); });
    document.getElementById('snapshot-date').addEventListener('change', event => {
      const value = validDate(event.target.value);
      if (!value) return;
      selectedDate = value;
      state.routes = {};
      syncNavigation(true);
      loadRegistry();
    });
    document.addEventListener('click', async event => {
      const project = event.target.closest('[data-project]');
      if (project) { selectProject(project.dataset.project); return; }
      const edit = event.target.closest('[data-editor]');
      if (edit) { openEditor(edit.dataset.editor, edit.dataset.stage); return; }
      const action = event.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'delete-project') {
        const p = currentProject();
        if (!p || !confirm(`Удалить проект «${p.name}» из списка? История останется в базе.`)) return;
        action.disabled = true;
        try {
          await api('/api/projects/' + p.id, { method: 'DELETE' });
          location.assign(overviewUrl());
        } catch (error) {
          toast('Не удалось удалить проект: ' + error.message);
          action.disabled = false;
        }
        return;
      }
      if (action.dataset.action === 'retry') loadRegistry();
      if (action.dataset.action === 'print') window.print();
      if (action.dataset.action === 'history') {
        const p = currentProject();
        document.getElementById('history-subtitle').textContent = p.name;
        document.getElementById('full-history').innerHTML = historyHtml(detail(p).history);
        const dialog = document.getElementById('history-dialog');
        dialog.showModal();
        window.ArcMotion?.dialog(dialog, true);
      }

    });
    document.getElementById('close-history').addEventListener('click', () => hideDialog(document.getElementById('history-dialog')));
    document.getElementById('history-dialog').addEventListener('cancel', event => { event.preventDefault(); hideDialog(event.currentTarget); });
    window.addEventListener('popstate', () => {
      const query = new URLSearchParams(location.search);
      state.id = Number(query.get('id')) || null;
      const date = validDate(query.get('date')) || today();
      if (date !== selectedDate) { selectedDate = date; state.routes = {}; loadRegistry(); }
      else selectProject(state.id, false);
    });
    state.id = Number(new URLSearchParams(location.search).get('id')) || null;
    document.getElementById('snapshot-date').value = selectedDate;
    syncNavigation();
    loadRegistry();

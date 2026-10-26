
    'use strict';
    let data = { stages: [], projects: [], details: {} };
    const state = { id: null, search: '', routes: {}, calendarMonth: null };
    let selectedDate;
    let requestGeneration = 0;
    let editor = null;
    let editingCriticalId = null;
    let calendarDrag = null;
    let calendarSaving = false;
    let suppressCalendarClickUntil = 0;
    const main = document.getElementById('main');
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dateOnly = value => value ? String(value).slice(0,10) : '';
    const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
    state.calendarMonth = today().slice(0, 7);
    function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value+'T12:00:00Z').getTime()) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value ? value : null; }
    selectedDate = validDate(new URLSearchParams(location.search).get('date')) || today();
    const stamp = value => value ? new Date(dateOnly(value) + 'T12:00:00Z').getTime() : null;
    const days = (start,end) => start && end ? Math.round((stamp(end) - stamp(start)) / 86400000) : null;
    function fmt(value, format = 'long') {
      if (!value) return '—';
      return new Date(dateOnly(value) + 'T12:00:00Z').toLocaleDateString('ru-RU', format === 'short' ? { day:'2-digit', month:'2-digit', year:'2-digit' } : { day:'numeric', month:'short', year:'numeric' });
    }
    const currentProject = () => data.projects.find(p => p.id === state.id);
    const detail = p => data.details[String(p.id)] || { history: [], milestones: [], criticalPoints: [] };
    const position = p => p.stage_index == null ? -1 : Number(p.stage_index);
    let orderedStages = [];
    const stageOrdinal = p => {
      const index = orderedStages.findIndex(s => Number(s.id) === Number(p.stage_id));
      return index >= 0 ? index : position(p);
    };
    const finished = p => /реестр получен/i.test(p.status || '');
    const icon = id => `<svg aria-hidden="true"><use href="#icon-${id}"/></svg>`;
    const rubles = value => value === null || value === undefined || value === '' ? '—' : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value))} ₽`;
    function safeLink(value) {
      try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
      catch { return null; }
    }
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
      { label:'Проверки', from:7, to:10 }, { label:'Экспертиза', from:11, to:13 }, { label:'Реестровая запись', from:14, to:Infinity }
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
      const upcoming = orderedStages.filter(s => Number(s.position) >= position(p));
      const visible = upcoming.slice(0, 5);
      const later = upcoming.slice(5);
      function groupedRows(stages) {
        return phases.map((phase,i) => {
          const group = stages.filter(s => Number(s.position) >= phase.from && Number(s.position) <= phase.to);
          if (!group.length) return '';
          return `<div class="phase-heading"><span class="phase-number">0${i+1}</span>${phase.label}<span class="phase-line"></span></div>${group.map(s => routeRow(p,s,orderedStages.indexOf(s))).join('')}`;
        }).join('');
      }
      const past = previous.length ? `<details class="past-stages" ${state.routes[p.id]?.past ? 'open' : ''}><summary><span>Пройденные этапы</span><span class="past-count">${previous.length}</span><span class="past-action"><span class="past-open">Показать</span><span class="past-close">Скрыть</span></span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="past-stages-content">${groupedRows(previous)}</div></details>` : '';
      const future = later.length ? `<details class="future-stages" ${state.routes[p.id]?.future ? 'open' : ''}><summary><span>Дальнейшие этапы</span><span class="past-count">${later.length}</span><span class="past-action"><span class="past-open">Показать</span><span class="past-close">Скрыть</span></span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="future-stages-content">${groupedRows(later)}</div></details>` : '';
      return `<div class="route-labels"><span>Этап</span><span>План</span><span>Прогноз</span><span>Факт</span><span></span></div>${past}${groupedRows(visible)}${future}<div class="legend"><span><i class="legend-dot current"></i>Текущий этап</span><span><i class="legend-dot actual"></i>Подтверждённый факт</span><span><i class="legend-dot"></i>Без фактической даты</span></div>`;
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
    function passportHtml(p) {
      const passport = p.passport || {};
      const gisp = safeLink(passport.gisp_url);
      const application = safeLink(passport.application_url);
      return `<section class="passport-section" aria-labelledby="passport-title">
        <div class="passport-heading"><div><span class="overline">Дополнительные сведения</span><h2 id="passport-title">Паспорт проекта</h2></div><button class="button" data-editor="passport">Изменить данные</button></div>
        <div class="passport-grid">
          <div class="card passport-card"><h3>Экономика</h3><dl><div><dt>Стоимость тестовой партии</dt><dd>${rubles(passport.pilot_cost)}</dd></div><div><dt>Стоимость массового производства</dt><dd>${rubles(passport.production_cost)}</dd></div></dl></div>
          <div class="card passport-card"><h3>Заявка в ГИСП</h3><dl><div><dt>Номер заявки</dt><dd>${passport.application_number ? esc(passport.application_number) : '—'}</dd></div><div><dt>Ссылка на ГИСП</dt><dd>${gisp ? `<a href="${esc(gisp)}" target="_blank" rel="noopener noreferrer">Открыть ГИСП ↗</a>` : '—'}</dd></div><div><dt>Ссылка на заявку</dt><dd>${application ? `<a href="${esc(application)}" target="_blank" rel="noopener noreferrer">Открыть заявку ↗</a>` : '—'}</dd></div></dl></div>
        </div>
      </section>`;
    }
    function calendarEvents(p) {
      const events = [];
      for (const milestone of detail(p).milestones) {
        const plan = dateOnly(milestone.baseline_date);
        const forecast = dateOnly(milestone.forecast_date);
        if (plan) events.push({ key: `milestone:${milestone.stage_id}:baseline_date`, date: plan, title: milestone.stage_name, type: 'plan', label: 'План этапа', stageId: milestone.stage_id, field: 'baseline_date' });
        if (forecast && forecast !== plan) events.push({ key: `milestone:${milestone.stage_id}:forecast_date`, date: forecast, title: milestone.stage_name, type: 'forecast', label: 'Прогноз этапа', stageId: milestone.stage_id, field: 'forecast_date' });
      }
      if (p.planned_submission_date) events.push({ key: 'target:planned_submission_date', date: dateOnly(p.planned_submission_date), title: 'Подача заявки в ГИСП', type: 'target', label: 'План проекта', field: 'planned_submission_date' });
      if (p.planned_registry_received_date) events.push({ key: 'target:planned_registry_received_date', date: dateOnly(p.planned_registry_received_date), title: 'Получение реестровой записи', type: 'target', label: 'План проекта', field: 'planned_registry_received_date' });
      for (const item of detail(p).criticalPoints || []) {
        if (validDate(item.date)) events.push({ ...item, key: `critical:${item.id}`, type: 'critical', label: 'Критическая точка' });
      }
      return events;
    }
    function calendarHtml(p) {
      const [year, month] = state.calendarMonth.split('-').map(Number);
      const first = new Date(Date.UTC(year, month - 1, 1));
      const offset = (first.getUTCDay() + 6) % 7;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
      const title = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const byDay = new Map();
      for (const event of calendarEvents(p)) {
        if (!byDay.has(event.date)) byDay.set(event.date, []);
        byDay.get(event.date).push(event);
      }
      const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      const daysHtml = Array.from({ length: cells }, (_, index) => {
        const day = new Date(Date.UTC(year, month - 1, index - offset + 1));
        const key = day.toISOString().slice(0, 10);
        const outside = day.getUTCMonth() !== month - 1;
        const events = byDay.get(key) || [];
        return `<div class="calendar-day ${outside ? 'outside' : ''} ${key === today() ? 'is-today' : ''}" data-calendar-day="${key}">
          <button class="calendar-day-number" data-calendar-date="${key}" aria-label="Показать события за ${fmt(key)}">${day.getUTCDate()}</button>
          <div class="calendar-day-events">${events.map(event => event.type === 'critical'
            ? `<button class="calendar-event critical" data-calendar-key="${esc(event.key)}" data-calendar-event-date="${key}" aria-label="${esc(event.title)}, критическая точка. Показать события дня или перетащить на другую дату">${esc(event.title)}</button>`
            : `<button class="calendar-event ${event.type}" data-calendar-key="${esc(event.key)}" data-calendar-event-date="${key}" aria-label="${esc(event.title)}, ${esc(event.label)}. Показать события дня или перетащить на другую дату"><i aria-hidden="true"></i><span>${esc(event.title)}</span></button>`).join('')}</div>
        </div>`;
      }).join('');
      return `<section class="project-calendar" id="project-calendar" aria-labelledby="project-calendar-title">
        <div class="project-calendar-head"><div><span class="overline">Планирование</span><h2 id="project-calendar-title">Календарь проекта</h2><p>Перетащите маркер на другую дату. Изменить дату можно и через просмотр дня.</p></div><button class="button button-primary" data-calendar-add>+ Критическая точка</button></div>
        <div class="project-calendar-toolbar"><div class="calendar-navigation"><button class="button calendar-nav" data-calendar-shift="-1" aria-label="Предыдущий месяц">←</button><h3 aria-live="polite">${esc(title)}</h3><button class="button calendar-nav" data-calendar-shift="1" aria-label="Следующий месяц">→</button><button class="button calendar-today" data-calendar-today>Сегодня</button></div><div class="calendar-key"><span><i class="plan"></i>План этапа</span><span><i class="forecast"></i>Прогноз</span><span><i class="target"></i>План проекта</span><span><i class="critical"></i>Критическая точка</span></div></div>
        <div class="calendar-scroll"><div class="calendar-board"><div class="calendar-weekdays">${weekdays.map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${daysHtml}</div></div></div>
        <p class="calendar-feedback" id="calendar-feedback" role="status" aria-live="polite"></p>
      </section>`;
    }
    function refreshCalendar(direction = 0) {
      const p = currentProject();
      const old = document.getElementById('project-calendar');
      if (p && old) {
        old.outerHTML = calendarHtml(p);
        window.ArcMotion?.calendarEnter(document.getElementById('project-calendar'), direction);
      }
    }
    function openCriticalDialog(date = today(), id = null) {
      const p = currentProject();
      if (!p) return;
      const item = id ? detail(p).criticalPoints.find(point => Number(point.id) === Number(id)) : null;
      editingCriticalId = item?.id || null;
      const dialog = document.getElementById('critical-dialog');
      document.getElementById('critical-dialog-title').textContent = item ? 'Изменить критическую точку' : 'Новая критическая точка';
      document.getElementById('critical-dialog-project').textContent = p.name;
      document.getElementById('critical-date').value = item?.date || date;
      document.getElementById('critical-name').value = item?.title || '';
      document.getElementById('critical-delete').hidden = !item;
      document.getElementById('critical-error').hidden = true;
      dialog.showModal();
      window.ArcMotion?.dialog(dialog, true);
      document.getElementById('critical-name').focus();
    }
    function closeCriticalDialog() {
      const dialog = document.getElementById('critical-dialog');
      if (dialog.open) { window.ArcMotion?.resetDialog(dialog); dialog.close(); }
      editingCriticalId = null;
    }
    function openCalendarDay(date) {
      const p = currentProject();
      if (!p || !validDate(date)) return;
      const items = calendarEvents(p).filter(item => item.date === date);
      document.getElementById('calendar-day-title').textContent = fmt(date);
      document.getElementById('calendar-day-events').innerHTML = items.length
        ? items.map(item => `<li class="calendar-day-item ${item.type}"><span class="calendar-day-item-kind">${esc(item.label)}</span><p>${esc(item.title)}</p>${item.type === 'critical' ? `<button class="button" data-day-edit="${Number(item.id)}">Изменить точку</button>` : `<button class="button" data-day-edit-event="${esc(item.key)}">Изменить дату</button>`}</li>`).join('')
        : '<li class="empty-note">На эту дату событий пока нет.</li>';
      const add = document.getElementById('calendar-day-add');
      add.dataset.date = date;
      const dialog = document.getElementById('calendar-day-dialog');
      dialog.showModal();
      window.ArcMotion?.dialog(dialog, true);
    }
    function closeCalendarDay() {
      const dialog = document.getElementById('calendar-day-dialog');
      if (dialog.open) { window.ArcMotion?.resetDialog(dialog); dialog.close(); }
    }
    function calendarFeedback(message, error = false) {
      const element = document.getElementById('calendar-feedback');
      if (!element) return;
      element.textContent = message;
      element.classList.toggle('error', error);
      element.setAttribute('role', error ? 'alert' : 'status');
    }
    async function moveCalendarEvent(key, date) {
      const p = currentProject();
      const item = p && calendarEvents(p).find(event => event.key === key);
      if (!item || !validDate(date) || item.date === date || calendarSaving) return;
      calendarSaving = true;
      calendarFeedback('Сохраняем новую дату…');
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (item.type === 'critical') {
          const result = await api('/api/projects/' + p.id + '/critical-points', {
            method: 'PUT', headers, body: JSON.stringify({ point_id: item.id, date, title: item.title }),
          });
          const index = detail(p).criticalPoints.findIndex(point => Number(point.id) === Number(item.id));
          if (index >= 0) detail(p).criticalPoints[index] = result.point;
        } else if (item.type === 'target') {
          const payload = {
            planned_submission_date: dateOnly(p.planned_submission_date) || null,
            planned_registry_received_date: dateOnly(p.planned_registry_received_date) || null,
          };
          payload[item.field] = date;
          const result = await api('/api/projects/' + p.id + '/targets', { method: 'PUT', headers, body: JSON.stringify(payload) });
          Object.assign(p, result.targets);
        } else {
          const milestone = detail(p).milestones.find(value => Number(value.stage_id) === Number(item.stageId));
          if (!milestone) throw new Error('Этап больше не найден. Обновите страницу.');
          const payload = {
            stage_id: milestone.stage_id,
            baseline_date: dateOnly(milestone.baseline_date) || null,
            forecast_date: dateOnly(milestone.forecast_date) || null,
            actual_date: dateOnly(milestone.actual_date) || null,
            delay_reason: milestone.delay_reason || null,
            comment: milestone.comment || null,
          };
          payload[item.field] = date;
          const result = await api('/api/milestones/' + p.id, { method: 'PUT', headers, body: JSON.stringify(payload) });
          Object.assign(milestone, result.milestone);
        }
        if (state.id !== p.id) return;
        const scrollY = window.scrollY;
        renderProjects();
        renderMain();
        window.scrollTo(0, scrollY);
        calendarFeedback(`${item.label}: «${item.title}» перенесено на ${fmt(date)}.`);
        const moved = [...main.querySelectorAll('[data-calendar-key]')].find(element => element.dataset.calendarKey === key);
        moved?.focus({ preventScroll: true });
        window.ArcMotion?.calendarPlaced(moved);
      } catch (error) {
        calendarFeedback(`Не удалось перенести событие: ${error.message}`, true);
      } finally { calendarSaving = false; }
    }
    function clearCalendarDrag() {
      if (!calendarDrag) return;
      calendarDrag.source?.classList.remove('is-dragging');
      calendarDrag.target?.classList.remove('is-drop-target');
      calendarDrag.ghost?.remove();
      calendarDrag = null;
    }
    function startCalendarDrag(event) {
      const source = event.target.closest('[data-calendar-key]');
      if (!source || calendarSaving || event.button !== 0 || !event.isPrimary) return;
      const p = currentProject();
      const item = p && calendarEvents(p).find(value => value.key === source.dataset.calendarKey);
      if (!item) return;
      calendarDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, source, item, active: false, target: null, ghost: null };
    }
    function updateCalendarDrag(event) {
      const drag = calendarDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      if (!drag.active) {
        drag.active = true;
        drag.source.classList.add('is-dragging');
        calendarFeedback('Перетащите событие на нужную дату и отпустите.');
        const ghost = document.createElement('div');
        ghost.className = `calendar-drag-ghost ${drag.item.type}`;
        ghost.textContent = drag.item.title;
        ghost.setAttribute('aria-hidden', 'true');
        document.body.append(ghost);
        drag.ghost = ghost;
      }
      event.preventDefault();
      drag.ghost.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-calendar-day]') || null;
      if (target !== drag.target) {
        drag.target?.classList.remove('is-drop-target');
        drag.target = target;
        drag.target?.classList.add('is-drop-target');
        if (target) calendarFeedback(`Новая дата: ${fmt(target.dataset.calendarDay)}.`);
      }
      if (event.clientY < 70) window.scrollBy(0, -8);
      else if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 8);
      const scroll = document.querySelector('.calendar-scroll');
      if (scroll) {
        const rect = scroll.getBoundingClientRect();
        if (event.clientX > rect.right - 35 && event.clientX < rect.right) scroll.scrollLeft += 12;
        else if (event.clientX < rect.left + 35 && event.clientX > rect.left) scroll.scrollLeft -= 12;
      }
    }
    function finishCalendarDrag(event) {
      const drag = calendarDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const date = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-calendar-day]')?.dataset.calendarDay;
      const key = drag.item.key;
      const active = drag.active;
      clearCalendarDrag();
      if (!active) return;
      suppressCalendarClickUntil = Date.now() + 350;
      if (date) moveCalendarEvent(key, date);
      else calendarFeedback('Перетащите событие на ячейку календаря.');
    }
    function renderMain() {
      const p = currentProject();
      captureRouteState();
      window.ArcMotion?.resetProject(main);
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
        ${selectedDate !== today() ? '<div class="historical-note">Статус и история показаны на выбранную дату. Плановые даты, вехи, календарные точки и паспорт проекта — актуальные.</div>' : ''}
        <section class="card current-card"><div><div class="overline">${done ? 'Результат проекта' : 'Где проект сейчас'}</div><h2>${esc(p.status || 'Статус ещё не указан')}</h2><div class="next-line">${done ? 'Все этапы маршрута пройдены по текущему статусу.' : next ? `Следующий этап: <b>${esc(next.name)}</b>` : 'Следующий этап пока не определён.'}</div></div><div class="stage-position"><strong>${String(ordinal + 1).padStart(2,'0')} <span>/ ${orderedStages.length}</span></strong><small>Положение в маршруте</small><div class="segment-track" aria-hidden="true">${orderedStages.map((s,i) => `<i class="${i < ordinal ? 'passed' : i === ordinal ? 'current' : ''}"></i>`).join('')}</div></div></section>
        ${alerts(p).map(a => `<div class="alert">${icon('alert')}<span>${esc(a)}</span></div>`).join('')}
        <div class="key-dates">${submitted ? agreements : submissionCard}${keyDate(p,'Получение реестровой записи',p.planned_registry_received_date,'Реестр получен')}</div>
        <div class="content-grid"><section><div class="section-title"><h2>Маршрут проекта</h2><small>${orderedStages.length} этапов</small></div><div class="route-subtitle">Текущий этап и четыре следующих · остальные свёрнуты</div><div class="card route" id="route">${renderRoute(p)}</div></section>
        <aside class="right-column" aria-label="Сведения о проекте">${submitted ? submissionCard : agreements}
        <section class="card side-card"><h2>Контрольные даты ${icon('calendar')}</h2>${upcoming(p)}</section>
        <section class="card side-card"><h2>Последние изменения <span class="count">${history.length}</span></h2><ol class="history-list">${historyHtml(history.slice(0,4))}</ol>${history.length > 4 ? `<button class="button history-more" data-action="history">Вся история · ${history.length} записей →</button>` : ''}</section></aside></div>
        ${calendarHtml(p)}
        ${passportHtml(p)}
        <div class="footer-actions"><div class="footer">Срез на ${fmt(selectedDate)} Фактические даты показаны только там, где они заполнены отдельно.</div><button class="button button-danger" data-action="delete-project">Удалить проект</button></div>`;
      main.dataset.projectId = String(p.id);
      document.title = `${p.name} — карточка проекта`;
      // Never transform the interactive root: re-rendering it can leave stale hit-test regions.
      main.style.removeProperty('transform');
      main.style.removeProperty('opacity');
      window.ArcMotion?.attach(main);
      window.ArcMotion?.calendarEnter(document.getElementById('project-calendar'));
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
      const future = main.querySelector('.future-stages');
      state.routes[id] = {
        past: past ? open(past) : false,
        future: future ? open(future) : false,
        stages: [...main.querySelectorAll('details.stage')].filter(open).map(s => Number(s.dataset.stage)),
      };
    }
    function loading() {
      captureRouteState();
      window.ArcMotion?.resetProject(main);
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
      const [historyResult, milestonesResult, criticalResult] = await Promise.all([
        api('/api/history/' + id), api('/api/milestones/' + id), api('/api/projects/' + id + '/critical-points'),
      ]);
      if (!Array.isArray(historyResult.history) || !Array.isArray(milestonesResult.milestones) || !Array.isArray(criticalResult.critical_points)) throw new Error('Неверный формат данных проекта');
      target.details[id] = {
        history: historyResult.history.filter(h => dateOnly(h.created_at) <= snapshotDate),
        milestones: milestonesResult.milestones,
        criticalPoints: criticalResult.critical_points,
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
        if (showLoading) window.ArcMotion?.projectEnter(main);
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
        window.ArcMotion?.projectEnter(main);
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
      } else if (mode === 'passport') {
        const passport = p.passport || {};
        title = 'Паспорт проекта';
        fields = field('pilot_cost', 'Стоимость тестовой партии, ₽', 'number', passport.pilot_cost ?? '') +
          field('production_cost', 'Стоимость массового производства, ₽', 'number', passport.production_cost ?? '') +
          field('gisp_url', 'Ссылка на ГИСП', 'url', passport.gisp_url || '') +
          field('application_number', 'Номер заявки', 'text', passport.application_number || '') +
          field('application_url', 'Ссылка на заявку', 'url', passport.application_url || '');
        fields = fields.replaceAll('type="number"', 'type="number" min="0" step="0.01"');
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
        } else if (savedEditor.mode === 'passport') {
          path = '/api/projects/' + savedEditor.projectId + '/passport';
          payload = { pilot_cost: values.pilot_cost, production_cost: values.production_cost, gisp_url: values.gisp_url, application_number: values.application_number, application_url: values.application_url };
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
        toast(savedEditor.mode === 'status' ? 'Статус проекта обновлён' : savedEditor.mode === 'targets' ? 'Плановые даты сохранены' : savedEditor.mode === 'passport' ? 'Паспорт проекта сохранён' : 'Даты этапа сохранены');
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
    document.getElementById('critical-form').addEventListener('submit', async event => {
      event.preventDefault();
      const p = currentProject();
      const date = document.getElementById('critical-date').value;
      const title = document.getElementById('critical-name').value.trim();
      if (!p || !validDate(date) || !title) return;
      const button = document.getElementById('critical-save');
      button.disabled = true;
      try {
        const result = await api('/api/projects/' + p.id + '/critical-points', {
          method: editingCriticalId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ point_id: editingCriticalId, date, title }),
        });
        const points = detail(p).criticalPoints;
        if (editingCriticalId) {
          const index = points.findIndex(item => Number(item.id) === Number(editingCriticalId));
          if (index >= 0) points[index] = result.point;
        } else points.push(result.point);
        state.calendarMonth = date.slice(0, 7);
        closeCriticalDialog();
        refreshCalendar();
        toast('Критическая точка сохранена');
      } catch (error) {
        const alert = document.getElementById('critical-error');
        alert.textContent = error.message;
        alert.hidden = false;
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById('critical-cancel').addEventListener('click', closeCriticalDialog);
    document.getElementById('critical-dialog').addEventListener('cancel', event => { event.preventDefault(); closeCriticalDialog(); });
    document.getElementById('calendar-day-close').addEventListener('click', closeCalendarDay);
    document.getElementById('calendar-day-dialog').addEventListener('cancel', event => { event.preventDefault(); closeCalendarDay(); });
    document.getElementById('calendar-day-add').addEventListener('click', event => { const date = event.currentTarget.dataset.date; closeCalendarDay(); openCriticalDialog(date); });
    document.getElementById('critical-delete').addEventListener('click', async () => {
      const p = currentProject();
      if (!p || !editingCriticalId) return;
      const button = document.getElementById('critical-delete');
      button.disabled = true;
      try {
        await api('/api/projects/' + p.id + '/critical-points', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ point_id: editingCriticalId }),
        });
        detail(p).criticalPoints = detail(p).criticalPoints.filter(point => Number(point.id) !== Number(editingCriticalId));
        closeCriticalDialog();
        refreshCalendar();
        toast('Критическая точка удалена');
      } catch (error) {
        const alert = document.getElementById('critical-error');
        alert.textContent = error.message;
        alert.hidden = false;
      } finally { button.disabled = false; }
    });
    document.addEventListener('pointerdown', startCalendarDrag);
    document.addEventListener('pointermove', updateCalendarDrag, { passive: false });
    document.addEventListener('pointerup', finishCalendarDrag);
    document.addEventListener('pointercancel', clearCalendarDrag);
    document.addEventListener('click', async event => {
      if (Date.now() < suppressCalendarClickUntil && event.target.closest('.project-calendar')) {
        event.preventDefault();
        return;
      }
      const project = event.target.closest('[data-project]');
      if (project) { selectProject(project.dataset.project); return; }
      const month = event.target.closest('[data-calendar-shift]');
      if (month) {
        const [year, number] = state.calendarMonth.split('-').map(Number);
        state.calendarMonth = new Date(Date.UTC(year, number - 1 + Number(month.dataset.calendarShift), 1)).toISOString().slice(0, 7);
        refreshCalendar(Number(month.dataset.calendarShift));
        return;
      }
      if (event.target.closest('[data-calendar-today]')) { const direction = state.calendarMonth < today().slice(0, 7) ? 1 : -1; state.calendarMonth = today().slice(0, 7); refreshCalendar(direction); return; }
      const dayEdit = event.target.closest('[data-day-edit]');
      if (dayEdit) { const id = dayEdit.dataset.dayEdit; closeCalendarDay(); openCriticalDialog(today(), id); return; }
      const planEdit = event.target.closest('[data-day-edit-event]');
      if (planEdit) {
        const p = currentProject();
        const item = p && calendarEvents(p).find(value => value.key === planEdit.dataset.dayEditEvent);
        closeCalendarDay();
        if (item) openEditor(item.type === 'target' ? 'targets' : 'milestone', item.stageId);
        return;
      }
      const calendarEvent = event.target.closest('[data-calendar-event-date]');
      if (calendarEvent) { openCalendarDay(calendarEvent.dataset.calendarEventDate); return; }
      const day = event.target.closest('[data-calendar-date]');
      if (day) { openCalendarDay(day.dataset.calendarDate); return; }
      if (event.target.closest('[data-calendar-add]')) { openCriticalDialog(state.calendarMonth === today().slice(0, 7) ? today() : state.calendarMonth + '-01'); return; }
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
    state.id = Number(new URLSearchParams(location.search).get('id')) || 2;
    document.getElementById('snapshot-date').value = selectedDate;
    syncNavigation();
    loadRegistry();

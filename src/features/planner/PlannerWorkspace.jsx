import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../../lib/supabase';
import { Modal, Field } from '../../components/ui';
import {
  SUBJECTS, GOAL_SUBJECTS, COLORS, GRADIENTS, MATH_TAGS, IMPORTANT_DATES, MONTHS,
  DEFAULT_GOALS, cloneGoals, formatDate, parseDate, addDays, initialRange,
  rangeDates, globalWeek, scheduleColor, eventLanes,
} from './plannerModel';
import './planner.css';

async function checked(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

function useDateDrag(setRange, dayWidth) {
  const drag = useRef(null);
  const moved = useRef(false);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    function move(event) {
      if (!drag.current || event.pointerId !== drag.current.id) return;
      const dx = event.clientX - drag.current.x;
      if (Math.abs(dx) > 5) moved.current = true;
      if (moved.current) {
        event.preventDefault();
        drag.current.dx = dx;
        setOffset(dx);
      }
    }
    function finish(event) {
      if (!drag.current || event.pointerId !== drag.current.id) return;
      const days = event.type === 'pointercancel' ? 0 : -Math.round(drag.current.dx / drag.current.width);
      if (moved.current && days) setRange(range => ({ start: addDays(range.start, days), end: addDays(range.end, days) }));
      drag.current = null;
      setOffset(0);
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [setRange]);
  return {
    offset,
    onPointerDown(event) {
      if (event.button !== 0 || event.target.closest('button, input, select, textarea')) return;
      moved.current = false;
      drag.current = { x: event.clientX, dx: 0, id: event.pointerId, width: dayWidth() };
    },
    onClickCapture(event) {
      if (moved.current) {
        moved.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}

function DateRange({ range, onChange }) {
  return <div className="planner-date-range">
    <input aria-label="开始日期" type="date" value={range.start} onChange={event => {
      const start = event.target.value;
      if (start) onChange({ start, end: start > range.end ? start : range.end });
    }} />
    <span>至</span>
    <input aria-label="结束日期" type="date" value={range.end} min={range.start} onChange={event => {
      const end = event.target.value;
      if (end && end >= range.start) onChange({ ...range, end });
    }} />
    <small>可左右拖动查看</small>
  </div>;
}

function GoalCalendar({ goals, events, onEditTask }) {
  const today = formatDate(new Date());
  const renderedWeeks = new Set();
  return <>
    <div className="planner-months">{MONTHS.map(month => {
      const goal = goals.find(item => item.month === month.month);
      const first = `2026-${String(month.monthNum).padStart(2, '0')}-01`;
      const offset = parseDate(first).getDay();
      const rows = Array.from({ length: Math.ceil((offset + month.days) / 7) }, (_, row) => {
        const dates = Array.from({ length: 7 }, (_, col) => {
          const day = row * 7 + col - offset + 1;
          return day > 0 && day <= month.days ? addDays(first, day - 1) : null;
        });
        const week = globalWeek(dates.find(Boolean));
        const showWeek = week >= month.weekStart && week < month.weekStart + month.weekCount && !renderedWeeks.has(week);
        if (showWeek) renderedWeeks.add(week);
        const weekGoals = showWeek ? GOAL_SUBJECTS.map(subject => ({ subject, text: goal?.subjects?.[subject]?.weeks?.[week - month.weekStart + 1] })).filter(item => item.text?.trim()) : [];
        return <Fragment key={row}>
          <div className="planner-calendar-week">{dates.map((date, col) => {
            if (!date) return <div key={`empty-${col}`} />;
            const important = IMPORTANT_DATES.find(item => item.date === date);
            const ending = events.filter(item => item.end_date === date);
            const highlight = date === today ? '#e74c3c' : important?.color;
            return <div key={date} className="planner-calendar-day" title={[date, important?.label, ...ending.map(item => item.label)].filter(Boolean).join(' · ')} style={{ background: highlight || (ending.length ? '#f0f6ff' : undefined), color: highlight ? '#fff' : undefined }}>
              <span>{parseDate(date).getDate()}</span>
              {important && <small>{important.label}</small>}
              {ending.map(event => <button key={event.id} type="button" onClick={() => onEditTask(event)} style={{ color: highlight ? '#fff' : COLORS[event.subject] }}>{event.label}</button>)}
            </div>;
          })}</div>
          {weekGoals.length > 0 && <div className="planner-week-goals">{weekGoals.map(({ subject, text }) => <div key={subject}><small>W{week} </small><b style={{ color: COLORS[subject] }}>{subject} </b>{text}</div>)}</div>}
        </Fragment>;
      });
      return <section key={month.month} className="planner-month">
        <h3>{month.month}</h3>
        {GOAL_SUBJECTS.filter(subject => goal?.subjects?.[subject]?.goal).map(subject => <div className="planner-goal-summary" key={subject} style={{ borderColor: COLORS[subject], background: `${COLORS[subject]}18` }}>
          <b style={{ color: COLORS[subject] }}>{subject}</b><div>{goal.subjects[subject].goal.split(/;|\r?\n/).filter(part => part.trim()).map((part, i) => <div key={i}>{part}</div>)}</div>
        </div>)}
        <div className="planner-calendar-week planner-weekdays">{['日', '一', '二', '三', '四', '五', '六'].map(day => <div key={day}>{day}</div>)}</div>
        {rows}
      </section>;
    })}</div>
    <div className="planner-important">重要节点：{IMPORTANT_DATES.map(item => <span key={item.date} style={{ color: item.color }}>{item.date} {item.label}</span>)}</div>
  </>;
}

function GoalTable({ goals, draft, setDraft, busy, onSave }) {
  function change(month, subject, week, value) {
    setDraft(current => {
      const next = cloneGoals(current);
      let target = next.find(item => item.month === month.month);
      if (!target) {
        target = { month: month.month, monthNum: month.monthNum, days: month.days, subjects: {} };
        next.push(target);
      }
      target.subjects ||= {};
      target.subjects[subject] ||= { goal: '', weeks: {} };
      if (week) {
        target.subjects[subject].weeks ||= {};
        target.subjects[subject].weeks[week] = value;
      } else target.subjects[subject].goal = value;
      return next;
    });
  }
  function cell(month, subject, week) {
    const data = (draft || goals).find(item => item.month === month.month)?.subjects?.[subject];
    const value = (week ? data?.weeks?.[week] : data?.goal) || '';
    if (week > month.weekCount) return <td key={month.month} className="planner-unused" />;
    return <td key={month.month} className={week ? '' : 'planner-total-goal'}>
      {draft ? <textarea aria-label={`${month.month}${subject}${week ? `第${week}周` : '总目标'}`} value={value} onChange={event => change(month, subject, week, event.target.value)} /> : <>
        {week ? <small>W{month.weekStart + week - 1} </small> : null}{value || (!week ? '—' : '')}
      </>}
    </td>;
  }
  return <section className="planner-card">
    <div className="planner-toolbar"><h3>目标一览表</h3><div className="planner-actions">
      {draft ? <><button type="button" disabled={busy} onClick={onSave}>保存</button><button type="button" disabled={busy} onClick={() => setDraft(null)}>取消</button></> : <button type="button" onClick={() => setDraft(cloneGoals(goals))}>编辑</button>}
    </div></div>
    <div className="planner-overflow"><table className="planner-goal-table"><thead><tr><th>科目</th><th>目标</th>{MONTHS.map((month, index) => <th key={month.month} style={{ color: `rgb(${180 - index * 28},${180 - index * 28},${180 - index * 28})` }}>{month.month} W{month.weekStart}-{month.weekStart + month.weekCount - 1}</th>)}</tr></thead>
      <tbody>{GOAL_SUBJECTS.map(subject => <Fragment key={subject}><tr><th rowSpan={6} style={{ background: `${COLORS[subject]}18`, color: COLORS[subject] }}>{subject}</th><th>总目标</th>{MONTHS.map(month => cell(month, subject, 0))}</tr>
        {[1, 2, 3, 4, 5].map(week => <tr key={week}><th>第{week}周</th>{MONTHS.map(month => cell(month, subject, week))}</tr>)}
      </Fragment>)}</tbody></table></div>
  </section>;
}

export default function PlannerWorkspace({ notify }) {
  const [mode, setMode] = useState('gantt');
  const [events, setEvents] = useState([]);
  const [slots, setSlots] = useState([]);
  const [records, setRecords] = useState([]);
  const [goals, setGoals] = useState(() => cloneGoals(DEFAULT_GOALS));
  const [goalDraft, setGoalDraft] = useState(null);
  const [timelineRange, setTimelineRange] = useState(() => initialRange(7, 35));
  const [scheduleRange, setScheduleRange] = useState(() => initialRange(15, 15));
  const [task, setTask] = useState(null);
  const [record, setRecord] = useState(null);
  const [slotDraft, setSlotDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const timelineRef = useRef(null);
  const scheduleRef = useRef(null);
  const scheduleRequest = useRef(0);
  const message = useCallback(text => notify?.(text), [notify]);
  const loadEvents = useCallback(async () => setEvents(await checked(sb.from('timeline_events').select('*').order('start_date'))), []);
  const loadSlots = useCallback(async () => {
    const data = await checked(sb.from('schedule_time_slots').select('*').order('sort_order', { ascending: true }).order('id'));
    setSlots(data.map(item => item.slot_name));
  }, []);
  const loadSchedule = useCallback(async () => {
    const request = ++scheduleRequest.current;
    const data = await checked(sb.from('daily_schedule').select('*').gte('record_date', scheduleRange.start).lte('record_date', scheduleRange.end).order('record_date'));
    if (request === scheduleRequest.current) setRecords(data);
  }, [scheduleRange]);
  useEffect(() => {
    let active = true;
    async function load() {
      const results = await Promise.allSettled([
        checked(sb.from('timeline_events').select('*').order('start_date')),
        checked(sb.from('schedule_time_slots').select('*').order('sort_order', { ascending: true }).order('id')),
        sb.from('month_goals').select('data').eq('id', 1).single(),
      ]);
      if (!active) return;
      if (results[0].status === 'fulfilled') setEvents(results[0].value);
      if (results[1].status === 'fulfilled') setSlots(results[1].value.map(item => item.slot_name));
      const stored = results[2].status === 'fulfilled' ? results[2].value : null;
      if (!stored?.error && Array.isArray(stored?.data?.data) && stored.data.data.length) setGoals(stored.data.data);
      if (results[0].status === 'rejected' || results[1].status === 'rejected') setLoadError('部分规划数据加载失败，请检查网络和数据表权限后刷新。');
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setRecords([]);
    setScheduleLoading(true);
    loadSchedule().catch(error => {
      if (active) message(`复习记录加载失败: ${error.message}`);
    }).finally(() => { if (active) setScheduleLoading(false); });
    return () => { active = false; scheduleRequest.current++; };
  }, [loadSchedule, message]);
  const timelineDates = useMemo(() => rangeDates(timelineRange), [timelineRange]);
  const scheduleDates = useMemo(() => rangeDates(scheduleRange), [scheduleRange]);
  const recordMap = useMemo(() => {
    const map = new Map();
    records.forEach(item => {
      const key = `${item.record_date}|${item.time_slot}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [records]);
  const timelineDrag = useDateDrag(setTimelineRange, () => timelineRef.current?.querySelector('.planner-timeline-day')?.getBoundingClientRect().width || 28);
  const scheduleDrag = useDateDrag(setScheduleRange, () => scheduleRef.current?.querySelector('thead th:nth-child(2)')?.getBoundingClientRect().width || 40);
  const today = formatDate(new Date());
  async function perform(action, success) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      if (success) message(success);
    } catch (error) { message(`操作失败: ${error.message || String(error)}`); }
    finally { setBusy(false); }
  }
  function newTask() { setTask({ subject: '数学', label: '', start_date: today, end_date: today }); }
  function openRecord(date = today, slot, existing) {
    if (!slots.length) return message('请先添加时段');
    if (existing) {
      const [tag, ...rest] = (existing.label || '').split('：');
      const hasTag = Boolean(MATH_TAGS[tag]);
      setRecord({ ...existing, label: hasTag ? rest.join('：') : existing.label || '', tag: hasTag ? tag : '', slots: [existing.time_slot], in_error_book: Boolean(existing.in_error_book) });
    } else setRecord({ record_date: date, subject: '数学', label: '', tag: '', slots: slot ? [slot] : [], in_error_book: false });
  }
  function saveTask(event) {
    event.preventDefault();
    if (!task.label.trim()) return message('请输入任务名称');
    if (!task.start_date || !task.end_date || task.end_date < task.start_date) return message('请选择有效日期，结束日期不能早于开始日期');
    perform(async () => {
      const data = { subject: task.subject, label: task.label.trim(), start_date: task.start_date, end_date: task.end_date, color: COLORS[task.subject] };
      await checked(task.id ? sb.from('timeline_events').update(data).eq('id', task.id) : sb.from('timeline_events').insert(data));
      await loadEvents();
      setTask(null);
    }, task.id ? '已更新' : '已添加');
  }
  function deleteTask(item) {
    if (!window.confirm('确定删除这个任务？')) return;
    perform(async () => {
      await checked(sb.from('timeline_events').delete().eq('id', item.id));
      await loadEvents();
      setTask(null);
    }, '已删除');
  }
  function saveRecord(event) {
    event.preventDefault();
    if (!record.label.trim()) return message('请输入任务名称');
    if (!record.record_date) return message('请选择日期');
    if (!record.slots.length) return message('请选择时段');
    perform(async () => {
      const data = { record_date: record.record_date, subject: record.subject, label: record.tag ? `${record.tag}：${record.label.trim()}` : record.label.trim(), in_error_book: record.in_error_book };
      let remaining = record.slots;
      if (record.id) {
        await checked(sb.from('daily_schedule').update({ ...data, time_slot: remaining[0] }).eq('id', record.id));
        remaining = remaining.slice(1);
      }
      if (remaining.length) await checked(sb.from('daily_schedule').insert(remaining.map(time_slot => ({ ...data, time_slot }))));
      await loadSchedule();
      setRecord(null);
    }, record.id ? '记录已更新' : '记录已添加');
  }
  function deleteRecord() {
    if (!window.confirm('确定删除这条记录？')) return;
    perform(async () => {
      await checked(sb.from('daily_schedule').delete().eq('id', record.id));
      await loadSchedule();
      setRecord(null);
    }, '已删除');
  }
  function saveSlot(event) {
    event.preventDefault();
    const name = slotDraft.trim();
    if (!name || !name.includes('-')) return message('格式：8:00-9:00');
    if (slots.includes(name)) return message('该时段已存在');
    perform(async () => {
      await checked(sb.from('schedule_time_slots').insert({ slot_name: name, sort_order: slots.length }));
      await loadSlots();
      setSlotDraft(null);
    }, '时段已添加');
  }
  function deleteSlot(slot) {
    if (!window.confirm(`删除时间段 ${slot}？`)) return;
    perform(async () => {
      await checked(sb.from('schedule_time_slots').delete().eq('slot_name', slot));
      await loadSlots();
    }, '时段已删除');
  }
  function saveGoals() {
    perform(async () => {
      await checked(sb.from('month_goals').upsert({ id: 1, data: goalDraft, updated_at: new Date().toISOString() }));
      setGoals(cloneGoals(goalDraft));
      setGoalDraft(null);
    }, '目标已保存');
  }
  return <div className="planner-workspace">
    <div className="planner-toolbar">
      <div className="planner-actions"><button type="button" className={mode === 'gantt' ? 'is-active' : ''} onClick={() => setMode('gantt')}>甘特图 + 复习</button><button type="button" className={mode === 'calendar' ? 'is-active' : ''} onClick={() => setMode('calendar')}>月历 + 目标</button></div>
      <button type="button" className="is-active" disabled={loading || busy} onClick={newTask}>+ 新增任务</button>
    </div>
    {loading && <p role="status">正在加载规划数据…</p>}
    {loadError && <p role="alert" className="planner-error">{loadError}</p>}
    {mode === 'calendar' ? <>
      <GoalCalendar goals={goals} events={events} onEditTask={setTask} />
      <GoalTable goals={goals} draft={goalDraft} setDraft={setGoalDraft} busy={busy || loading} onSave={saveGoals} />
    </> : <>
      <div className="planner-toolbar"><div className="planner-legend">{SUBJECTS.map(subject => <span key={subject}><i style={{ background: COLORS[subject] }} />{subject}</span>)}</div><DateRange range={timelineRange} onChange={setTimelineRange} /></div>
      <div className="planner-drag-viewport" ref={timelineRef} onPointerDown={timelineDrag.onPointerDown} onClickCapture={timelineDrag.onClickCapture}>
        <div className="planner-timeline" style={{ minWidth: 90 + timelineDates.length * 28, transform: `translateX(${timelineDrag.offset}px)` }}>
          <div className="planner-timeline-row"><div className="planner-timeline-label">科目</div><div className="planner-timeline-track planner-timeline-header">{timelineDates.map(date => <div key={date} className={`planner-timeline-day ${date === today ? 'is-today' : ''}`} style={{ color: [0, 6].includes(parseDate(date).getDay()) ? '#e74c3c' : undefined }}>{parseDate(date).getMonth() + 1}/{parseDate(date).getDate()}</div>)}</div></div>
          {SUBJECTS.map(subject => {
            const lanes = eventLanes(events.filter(item => item.subject === subject), timelineRange);
            const height = Math.max(40, (Math.max(-1, ...lanes.map(item => item.lane)) + 1) * 32 + 8);
            return <div className="planner-timeline-row" key={subject} style={{ minHeight: height }}><div className="planner-timeline-label" style={{ color: COLORS[subject] }}>{subject}</div><div className="planner-timeline-track" style={{ minHeight: height }}>
              {timelineDates.map(date => <div key={date} className={`planner-timeline-day planner-day-slot ${date === today ? 'is-today' : ''}`} />)}
              {lanes.map(({ event, start, end, lane }) => <div key={event.id} className="planner-event" style={{ left: `${Math.max(0, start) / timelineDates.length * 100}%`, width: `${(Math.min(end, timelineDates.length - 1) - Math.max(0, start) + 1) / timelineDates.length * 100}%`, top: lane * 32 + 4, background: GRADIENTS[subject] }}>
                <a role="button" tabIndex={0} title={`${event.label} (${event.start_date} ~ ${event.end_date})`} onClick={() => setTask({ ...event })} onKeyDown={key => { if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); setTask({ ...event }); } }}>{event.label}</a>
                <button type="button" disabled={busy} aria-label={`删除任务 ${event.label}`} onClick={() => deleteTask(event)}>×</button>
              </div>)}
            </div></div>;
          })}
        </div>
      </div>
      <section className="planner-card"><div className="planner-toolbar"><h3>滚动复习记录</h3><DateRange range={scheduleRange} onChange={setScheduleRange} /><div className="planner-actions"><button type="button" disabled={busy || loading} onClick={() => setSlotDraft('')}>+ 时段</button><button type="button" disabled={busy || loading} onClick={() => openRecord()}>+ 今日记录</button></div></div>
        {scheduleLoading && <p role="status">正在加载复习记录…</p>}
        <div className="planner-drag-viewport" ref={scheduleRef} onPointerDown={scheduleDrag.onPointerDown} onClickCapture={scheduleDrag.onClickCapture}>
          <table className="planner-schedule" style={{ minWidth: 80 + scheduleDates.length * 40, transform: `translateX(${scheduleDrag.offset}px)` }}><thead><tr><th>时段</th>{scheduleDates.map(date => <th key={date} className={date === today || [0, 6].includes(parseDate(date).getDay()) ? 'planner-red' : ''}>{parseDate(date).getMonth() + 1}/{parseDate(date).getDate()}<br /><small>{['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()]}</small></th>)}</tr></thead>
            <tbody>{slots.length ? [...slots].sort().map(slot => <tr key={slot}><th>{slot}<button type="button" className="planner-slot-delete" disabled={busy} aria-label={`删除时段 ${slot}`} onClick={() => deleteSlot(slot)}>×</button></th>
              {scheduleDates.map(date => <td key={date} tabIndex={0} role="button" aria-label={`${date} ${slot} 添加记录`} onClick={() => openRecord(date, slot)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openRecord(date, slot); } }}>
                <div className="planner-records">{(recordMap.get(`${date}|${slot}`) || []).map(item => <button type="button" key={item.id} style={{ background: scheduleColor(item) }} title={`${item.label}${item.in_error_book ? ' · 错题已入错题库' : ''}`} onClick={event => { event.stopPropagation(); openRecord(date, slot, item); }}>{item.label || item.subject}{item.in_error_book && <span aria-label="错题已入错题库"> [已入库]</span>}</button>)}</div>
              </td>)}
            </tr>) : <tr><td colSpan={scheduleDates.length + 1} className="planner-empty">暂无时段，点击「+ 时段」开始记录</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </>}
    {task && <Modal title={task.id ? '编辑任务' : '添加任务'} onClose={() => { if (!busy) setTask(null); }}><form onSubmit={saveTask}>
      <Field label="科目"><select value={task.subject} onChange={event => setTask({ ...task, subject: event.target.value })}>{SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select></Field>
      <Field label="任务名称"><input autoFocus required value={task.label} placeholder="例如：强化阶段" onChange={event => setTask({ ...task, label: event.target.value })} /></Field>
      <Field label="开始日期"><input type="date" required value={task.start_date} onChange={event => setTask({ ...task, start_date: event.target.value })} /></Field>
      <Field label="结束日期"><input type="date" required min={task.start_date} value={task.end_date} onChange={event => setTask({ ...task, end_date: event.target.value })} /></Field>
      <div className="planner-actions planner-form-actions">{task.id && <button type="button" className="planner-danger" disabled={busy} onClick={() => deleteTask(task)}>删除任务</button>}<button type="button" disabled={busy} onClick={() => setTask(null)}>取消</button><button type="submit" disabled={busy}>保存</button></div>
    </form></Modal>}
    {record && <Modal title={record.id ? '编辑记录' : '添加记录'} onClose={() => { if (!busy) setRecord(null); }}><form onSubmit={saveRecord}>
      <div className="form-group"><span>时段（可多选）</span><div className="planner-slot-options">{slots.map(slot => <label key={slot} className={record.slots.includes(slot) ? 'is-selected' : ''}><input type="checkbox" checked={record.slots.includes(slot)} onChange={event => setRecord({ ...record, slots: event.target.checked ? [...record.slots, slot] : record.slots.filter(item => item !== slot) })} />{slot}</label>)}</div></div>
      <Field label="日期"><input type="date" required value={record.record_date} onChange={event => setRecord({ ...record, record_date: event.target.value })} /></Field>
      <Field label="科目"><select value={record.subject} onChange={event => setRecord({ ...record, subject: event.target.value })}>{SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select></Field>
      {record.subject === '数学' && <Field label="子标签"><div className="planner-tags">{Object.entries(MATH_TAGS).map(([tag, color]) => <button key={tag} type="button" aria-pressed={record.tag === tag} style={{ background: color, opacity: record.tag === tag ? 1 : 0.5 }} onClick={() => setRecord({ ...record, tag: record.tag === tag ? '' : tag })}>{tag}</button>)}</div></Field>}
      <Field label="任务名称"><input required value={record.label} placeholder="例如：做完一章习题" onChange={event => setRecord({ ...record, label: event.target.value })} /></Field>
      {record.subject === '数学' && <Field label="错题已入错题库"><input type="checkbox" checked={record.in_error_book} onChange={event => setRecord({ ...record, in_error_book: event.target.checked })} /></Field>}
      <div className="planner-actions planner-form-actions">{record.id && <button type="button" className="planner-danger" disabled={busy} onClick={deleteRecord}>删除记录</button>}<button type="button" disabled={busy} onClick={() => setRecord(null)}>取消</button><button type="submit" disabled={busy}>{record.id ? '更新' : '保存'}</button></div>
    </form></Modal>}
    {slotDraft !== null && <Modal title="添加时段" onClose={() => { if (!busy) setSlotDraft(null); }}><form onSubmit={saveSlot}><Field label="时间段"><input autoFocus required value={slotDraft} placeholder="8:00-9:00" onChange={event => setSlotDraft(event.target.value)} /></Field><div className="planner-actions planner-form-actions"><button type="button" disabled={busy} onClick={() => setSlotDraft(null)}>取消</button><button type="submit" disabled={busy}>保存</button></div></form></Modal>}
  </div>;
}

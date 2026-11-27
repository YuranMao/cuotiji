import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sb } from '../../lib/supabase';
import { Modal, Field, MathText } from '../../components/ui';
import { INTERVALS, WORD_LABELS, SUBJECTS, formatDate, normalizeReviews, getEbbDynamicSchedule, sentenceTags, getSentenceSettings, parseSentenceJson, SENTENCE_PROMPT } from './reviewModel';
import './review.css';

const TABLES = { ebb: 'ebbinghaus_items', mindmap: 'political_mindmaps', sentence: 'sentence_analyses', phrase: 'phrase_pairs', spectrum: 'vocab_spectrum_entries' };
const kindFor = subject => ({ 政治: 'mindmap', 长难句: 'sentence', 词组: 'phrase', 词谱: 'spectrum' }[subject] || 'ebb');
const subjectOf = item => (item.subject || '专业课').replace(/^冲刺·/, '');
const colors = { 专业课: '#e8f5e9', 英语: '#e8f0fe', 政治: '#f3e8fa' };

function SentenceType({ item }) {
  return <span className={`review-tag ${item.question_type === 'reading' ? 'reading' : ''}`}>{item.question_type === 'reading' ? '阅读题' : '翻译题'}</span>;
}

function SentenceDetail({ item }) {
  const analysis = item.analysis || {};
  const structure = Array.isArray(analysis.structure) ? analysis.structure : [];
  const grammar = Array.isArray(analysis.grammar_points) ? analysis.grammar_points : [];
  return <div className="review-detail">
    <SentenceType item={item} />
    <p className="review-question">{item.sentence}</p>
    <div><b>知识点归类：</b>{sentenceTags(item).map((tag, index) => <span className="review-tag" key={`${tag}-${index}`}>{tag}</span>)}{!sentenceTags(item).length && '未设置'}</div>
    <p><b>参考译文：</b>{analysis.translation || '暂无'}</p>
    <b>结构划分</b>
    {structure.length ? structure.map((part, index) => <div key={index} className={`review-structure ${/从句|clause/i.test(part.role) ? 'clause' : /主句|main/i.test(part.role) ? 'main' : ''}`}><b>{part.role || '结构'}</b>：{part.text}<div className="review-muted">{part.explanation}</div></div>) : <p>暂无结构分析</p>}
    <b>语法知识点</b>
    <ul>{grammar.length ? grammar.map((point, index) => <li key={index}><b>{point.name}</b>：{point.text}<div className="review-muted">{point.explanation}</div></li>) : <li>暂无语法知识点</li>}</ul>
  </div>;
}

function MindmapPreview({ code }) {
  const [preview, setPreview] = useState({ svg: '', error: '' });
  const id = useRef(`review-map-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    let cancelled = false;
    setPreview({ svg: '', error: '' });
    (async () => {
      try {
        if (!window.mermaid?.render) throw new Error('Mermaid 尚未加载，请检查应用的 Mermaid 脚本');
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
        const { svg } = await window.mermaid.render(`${id.current}-${Date.now()}`, code || 'mindmap\n  root((章节))');
        if (!cancelled) setPreview({ svg, error: '' });
      } catch (error) {
        if (!cancelled) setPreview({ svg: '', error: `Mermaid 代码有误或不可用：${error.message}` });
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  if (preview.error) return <p role="alert">{preview.error}</p>;
  return preview.svg ? <div className="review-map" dangerouslySetInnerHTML={{ __html: preview.svg }} /> : <p role="status">正在生成思维导图…</p>;
}

function ReviewNote({ value, onSave, disabled }) {
  const [text, setText] = useState(value);
  const ref = useRef(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const element = ref.current;
    if (element) { element.style.height = 'auto'; element.style.height = `${Math.max(32, element.scrollHeight)}px`; }
  }, [text]);
  return <textarea ref={ref} className="review-note" aria-label="复习备注" placeholder="备注…" value={text} disabled={disabled} onChange={event => setText(event.target.value)} onBlur={() => { if (text !== value) onSave(text); }} />;
}

export default function ReviewWorkspace({ notify }) {
  const [subject, setSubject] = useState('冲刺');
  const [data, setData] = useState({ ebb: [], mindmap: [], sentence: [], phrase: [], spectrum: [] });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [selectedMap, setSelectedMap] = useState(null);
  const [history, setHistory] = useState(false);
  const [recitation, setRecitation] = useState(null);
  const [today, setToday] = useState(formatDate());
  const [detail, setDetail] = useState(null);
  const [sentenceDraft, setSentenceDraft] = useState(null);
  const kind = kindFor(subject);
  const message = text => notify?.(text);
  const reportError = error => message(error?.message || String(error));

  async function reload(key) {
    let query = sb.from(TABLES[key]).select('*');
    if (key === 'ebb') query = query.order('first_date', { ascending: false });
    if (key === 'mindmap') query = query.order('sort_order').order('created_at');
    if (key === 'sentence' || key === 'phrase') query = query.order('created_at', { ascending: false });
    if (key === 'spectrum') query = query.order('created_at', { ascending: true }).order('id');
    let result = await query;
    if (result.error && key === 'ebb') result = await sb.from(TABLES[key]).select('*');
    if (result.error) throw result.error;
    const rows = result.data || [];
    setData(previous => ({ ...previous, [key]: rows }));
    if (key === 'mindmap') setSelectedMap(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id ?? null);
    return rows;
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    reload(kind).catch(error => { if (active) { setLoadError(`加载失败：${error.message}`); message(`加载失败：${error.message}`); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(formatDate()), 30000);
    const refreshDate = () => setToday(formatDate());
    window.addEventListener('focus', refreshDate);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDate); };
  }, []);

  function openEditor(type = kind, item = null, word = '') {
    if (type === 'ebb') {
      const sprint = item ? (item.subject || '').startsWith('冲刺·') : subject === '冲刺';
      setForm({ id: item?.id, name: item?.name || '', first_date: item?.first_date || new Date().toISOString().slice(0, 10), module: sprint ? '冲刺' : '常规', subject: item ? subjectOf(item) : sprint ? '专业课' : ['专业课', '单词', '政治'].includes(subject) ? subject : '专业课' });
    } else if (type === 'mindmap') setForm({ id: item?.id, name: item?.name || '' });
    else if (type === 'sentence') setForm({ id: item?.id, sentence: item?.sentence || '', question_type: item?.question_type || 'translation', hint: item?.hint || '' });
    else if (type === 'phrase') setForm({ id: item?.id, phrase: item?.phrase || '', meaning: item?.meaning || '', note: item?.note || '' });
    else if (type === 'spectrum') setForm({ id: item?.id, word: item?.word || word, entry_type: item?.entry_type || 'meaning', detail: item?.detail || '', example: item?.example || '' });
    setModal(type);
  }
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const closeModal = () => { if (!busy) { setModal(null); setSentenceDraft(null); } };

  async function saveEditor(event) {
    event.preventDefault();
    const type = modal;
    const id = form.id;
    if (type === 'settings') {
      const apiUrl = form.apiUrl.trim().replace(/\/$/, '');
      if (!apiUrl || !form.apiKey.trim()) return message('请输入 API 地址和 API Key');
      try {
        localStorage.setItem('sentence_api_url', apiUrl);
        localStorage.setItem('sentence_api_key', form.apiKey.trim());
        localStorage.setItem('sentence_model', form.model.trim() || 'deepseek-v4-pro');
        if (sentenceDraft) { setForm(sentenceDraft); setSentenceDraft(null); setModal('sentence'); } else setModal(null);
        message('API 设置已保存');
      } catch (error) { reportError(error); }
      return;
    }
    setBusy(true);
    try {
      let payload;
      if (type === 'ebb') {
        if (!form.name.trim() || !form.first_date) throw new Error('请填写背诵内容和学习日期');
        payload = { name: form.name.trim(), first_date: form.first_date, subject: (form.module === '冲刺' ? '冲刺·' : '') + form.subject, reviews: id ? data.ebb.find(row => row.id === id)?.reviews || [] : [] };
      } else if (type === 'mindmap') {
        if (!form.name.trim()) throw new Error('请输入章节名称');
        payload = { name: form.name.trim(), ...(!id ? { code: 'mindmap\n  root((章节))' } : {}) };
      } else if (type === 'code') {
        if (!form.code.trim()) throw new Error('请输入 Mermaid 代码');
        payload = { code: form.code.trim() };
      } else if (type === 'phrase') {
        if (!form.phrase.trim()) throw new Error('请输入词组或固定搭配');
        payload = { phrase: form.phrase.trim(), meaning: form.meaning.trim(), note: form.note.trim(), updated_at: new Date().toISOString() };
      } else if (type === 'spectrum') {
        if (!form.word.trim() || !form.detail.trim()) throw new Error('请填写单词和词义/用法');
        payload = { word: form.word.trim(), entry_type: form.entry_type, detail: form.detail.trim(), example: form.example.trim(), updated_at: new Date().toISOString() };
      } else if (type === 'sentence') {
        const sentence = form.sentence.replace(/\s+/g, ' ').trim();
        if (!sentence) throw new Error('请输入长难句');
        const settings = getSentenceSettings();
        if (!settings.apiKey) {
          setSentenceDraft(form); setForm(settings); setModal('settings'); message('请先填写 API Key'); return;
        }
        const base = settings.apiUrl.replace(/\/$/, '');
        const response = await fetch(base + (base.endsWith('/v1') ? '/chat/completions' : '/v1/chat/completions'), {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
          body: JSON.stringify({ model: settings.model, temperature: 0.2, messages: [{ role: 'system', content: SENTENCE_PROMPT }, { role: 'user', content: `请分析这句话，并重点覆盖我指定的知识点归类：\n${sentence}${form.hint.trim() ? `\n指定知识点归类：${form.hint.trim()}` : '\n未指定知识点归类，请完整分析句中重要语法结构。'}` }] }),
        });
        if (!response.ok) throw new Error(`API 请求失败（${response.status}）`);
        const result = await response.json();
        payload = { sentence, question_type: form.question_type, hint: form.hint.trim(), analysis: parseSentenceJson(result.choices?.[0]?.message?.content), updated_at: new Date().toISOString() };
      }
      const key = type === 'code' ? 'mindmap' : type;
      const persist = value => id ? sb.from(TABLES[key]).update(value).eq('id', id) : sb.from(TABLES[key]).insert(value);
      let result = await persist(payload);
      if (result.error && type === 'ebb' && form.module !== '冲刺') {
        const { subject: omittedSubject, ...legacyPayload } = payload;
        result = await persist(legacyPayload);
      }
      if (result.error) throw result.error;
      const rows = await reload(key);
      if (type === 'mindmap' && !id) setSelectedMap(rows[rows.length - 1]?.id ?? null);
      setModal(null);
      message(type === 'sentence' ? '长难句已分析并保存' : id ? '已更新' : '已添加');
    } catch (error) { message(`保存失败：${error.message}`); }
    finally { setBusy(false); }
  }

  async function remove(key, item) {
    if (busy || !window.confirm('确定删除这条记录？')) return;
    setBusy(true);
    try {
      const result = await sb.from(TABLES[key]).delete().eq('id', item.id);
      if (result.error) throw result.error;
      await reload(key); message('已删除');
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  }

  async function updateReview(item, day, note) {
    if (busy) return;
    setBusy(true);
    try {
      let reviews = normalizeReviews(item.reviews);
      const existing = reviews.find(review => review.day === day);
      if (note !== undefined) {
        if (!existing) return;
        existing.note = note;
      } else reviews = existing ? reviews.filter(review => review.day !== day) : [...reviews, { day, date: formatDate() }];
      const result = await sb.from(TABLES.ebb).update({ reviews }).eq('id', item.id);
      if (result.error) throw result.error;
      await reload('ebb');
    } catch (error) { message(`更新失败：${error.message}`); }
    finally { setBusy(false); }
  }

  async function renameInline(item) {
    if (busy) return;
    const name = window.prompt('修改背诵内容', item.name)?.trim();
    if (!name || name === item.name) return;
    setBusy(true);
    try {
      const result = await sb.from(TABLES.ebb).update({ name }).eq('id', item.id);
      if (result.error) throw result.error;
      await reload('ebb'); message('已更新');
    } catch (error) { reportError(error); }
    finally { setBusy(false); }
  }

  const sprint = subject === '冲刺';
  const ebbGroups = useMemo(() => {
    const items = data.ebb.filter(item => sprint ? (item.subject || '').startsWith('冲刺·') : (item.subject || '专业课') === subject);
    if (!sprint) return [{ title: null, items }];
    const groups = ['今日新学', '今日复习', '历史遗留', '历史记录'].map(title => ({ title, items: [] }));
    items.forEach(item => {
      const added = item.created_at ? formatDate(item.created_at) : item.first_date;
      const due = getEbbDynamicSchedule(item, true, today).some(slot => !slot.done && slot.scheduled <= today);
      const overdue = getEbbDynamicSchedule(item, false, today).some(slot => !slot.done && slot.scheduled < today);
      groups[added === today ? 0 : !due ? 3 : overdue ? 2 : 1].items.push(item);
    });
    return groups;
  }, [data.ebb, sprint, subject, today]);

  const spectrumGroups = useMemo(() => {
    const groups = new Map();
    data.spectrum.forEach(item => {
      const key = item.word.trim().toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, { word: item.word, entries: [] });
      groups.get(key).entries.push(item);
    });
    return [...groups.values()];
  }, [data.spectrum]);
  const outline = useMemo(() => {
    const groups = new Map();
    data.sentence.forEach(item => sentenceTags(item).forEach(tag => groups.set(tag, [...(groups.get(tag) || []), item])));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data.sentence]);
  const map = data.mindmap.find(item => item.id === selectedMap);
  const editorTitles = { ebb: '背诵项', mindmap: '政治章节', sentence: '长难句', phrase: '词组固定搭配', spectrum: '词谱记录' };
  const actions = (key, item) => <div className="review-actions"><button disabled={busy} onClick={() => openEditor(key, item)}>编辑</button><button className="review-danger" disabled={busy} onClick={() => remove(key, item)}>删除</button></div>;
  const startRecitation = () => {
    if (!data[kind].length) return message('暂无可背诵内容');
    setRecitation({ type: kind, items: data[kind].slice(), index: 0, revealed: false });
  };
  const recitationItem = recitation?.items[recitation.index];
  const input = (key, label, options = {}) => <Field label={label}>{options.rows ? <textarea rows={options.rows} value={form[key] || ''} onChange={event => change(key, event.target.value)} /> : <input type={options.type || 'text'} value={form[key] || ''} onChange={event => change(key, event.target.value)} autoComplete={options.type === 'password' ? 'off' : undefined} />}</Field>;

  function renderRow(item) {
    const itemSubject = subjectOf(item);
    const english = sprint ? itemSubject === '英语' : subject === '单词';
    const major = sprint ? itemSubject === '专业课' : subject === '专业课';
    return <tr key={item.id} style={sprint ? { background: colors[itemSubject] } : undefined}>
      {sprint && <td>{itemSubject}</td>}
      <td className="review-name" title="双击修改背诵内容" onDoubleClick={() => renameInline(item)}><MathText text={item.name} /></td>
      <td>{item.first_date}</td>
      {getEbbDynamicSchedule(item, true, today).map(slot => {
        const future = slot.scheduled > today;
        const canEarly = sprint || (!english && !(major && (slot.day === 1 || slot.day === 2)));
        return <td key={slot.day} className={slot.done ? 'review-done' : !future ? 'review-due' : ''}>
          {slot.done ? <><button className="review-completed" disabled={busy} title="点击撤销本轮复习" onClick={() => updateReview(item, slot.day)}>✓ {(slot.reviewDate || slot.scheduled).slice(5)}</button>{(major || english || sprint) && <ReviewNote value={slot.reviewNote} disabled={busy} onSave={note => updateReview(item, slot.day, note)} />}</> : <><div>{slot.scheduled.slice(5)}</div>{(!future || canEarly) && <button disabled={busy} onClick={() => updateReview(item, slot.day)}>{future ? '提前' : '已背'}</button>}</>}
        </td>;
      })}
      <td>{actions('ebb', item)}</td>
    </tr>;
  }

  return <section className="review-workspace">
    <div className="review-toolbar">
      <nav aria-label="复习分类">{SUBJECTS.map(name => <button key={name} className={subject === name ? 'active' : ''} aria-pressed={subject === name} onClick={() => { setSubject(name); setHistory(false); }}>{name}</button>)}</nav>
      <button className="review-primary" disabled={busy} onClick={() => openEditor()}>+ {editorTitles[kind]}</button>
      {(kind === 'sentence' || kind === 'phrase') && <button onClick={startRecitation}>开始背诵</button>}
      {kind === 'sentence' && <button onClick={() => { setSentenceDraft(null); setForm(getSentenceSettings()); setModal('settings'); }}>API 设置</button>}
    </div>
    {loading && <p role="status">正在加载…</p>}
    {loadError && <p role="alert">{loadError}<button disabled={loading} onClick={async () => { setLoading(true); try { await reload(kind); setLoadError(''); } catch (error) { setLoadError(`加载失败：${error.message}`); } finally { setLoading(false); } }}>重试</button></p>}
    {kind === 'ebb' && <>
      <p className="review-muted">{sprint ? '冲刺复习：专业课（浅绿） / 英语（浅蓝） / 政治（浅紫）。今日新增优先归组；原始排期逾期归入历史遗留；逾期自动顺延至今日。' : '逾期自动顺延至今日；专业课前两轮及单词仅到期可记录，其余轮次可提前。'}</p>
      <div className="review-table-wrap"><table className="review-table"><thead><tr>{sprint && <th>学科</th>}<th>内容</th><th>学习日</th>{INTERVALS.map((day, index) => <th key={day}>{index + 1}<br /><small>{subject === '单词' ? WORD_LABELS[day] || `d${day}` : `d${day}`}</small></th>)}<th>操作</th></tr></thead><tbody>
        {ebbGroups.map((group, index) => <React.Fragment key={group.title || 'items'}>{group.title && <tr><th colSpan={sprint ? 10 : 9} className="review-group">{index === 3 ? <button aria-expanded={history} onClick={() => setHistory(value => !value)}>{group.title}（{group.items.length}） · {history ? '收起' : '展开'}</button> : `${group.title}（${group.items.length}）`}</th></tr>}{(index !== 3 || history) && (group.items.length ? group.items.map(renderRow) : <tr><td colSpan={sprint ? 10 : 9} className="review-empty">暂无项</td></tr>)}</React.Fragment>)}
      </tbody></table></div>
    </>}
    {kind === 'mindmap' && <>
      <p className="review-muted">输入 Mermaid mindmap 代码生成思维导图</p>
      <div className="review-chapters">{data.mindmap.map(item => <button key={item.id} className={item.id === selectedMap ? 'active' : ''} onClick={() => setSelectedMap(item.id)}>{item.name}</button>)}</div>
      {map ? <article className="review-card"><h3>{map.name}</h3><MindmapPreview code={map.code} /><div className="review-actions"><button disabled={busy} onClick={() => { setForm({ id: map.id, code: map.code || 'mindmap\n  root((章节))' }); setModal('code'); }}>编辑思维导图</button><button disabled={busy} onClick={() => openEditor('mindmap', map)}>编辑章节名</button></div></article> : <p className="review-empty">暂无政治章节，点击“+ 政治章节”添加</p>}
    </>}
    {kind === 'sentence' && <>
      <section className="review-card review-outline"><h3>语法知识大纲</h3><p className="review-muted">按所有长难句的知识点归类聚合</p>{outline.map(([tag, items]) => <details key={tag}><summary>{tag}（{items.length}句）</summary><ul>{items.map((item, index) => <li key={`${item.id}-${index}`}><button className="review-link" onClick={() => setDetail(item)}>{item.sentence}</button></li>)}</ul></details>)}{!outline.length && <p>暂无知识点归类</p>}</section>
      {data.sentence.map(item => <article className="review-card" key={item.id}><SentenceType item={item} /><button className="review-question review-link" onClick={() => setDetail(item)}>{item.sentence}</button><div><b>知识点归类：</b>{sentenceTags(item).map((tag, index) => <span key={`${tag}-${index}`} className="review-tag">{tag}</span>)}{!sentenceTags(item).length && '未设置'}</div>{actions('sentence', item)}</article>)}
      {!data.sentence.length && <p className="review-empty">暂无长难句，点击“+ 长难句”添加</p>}
    </>}
    {kind === 'phrase' && <>{data.phrase.map(item => <article className="review-card" key={item.id}><h3>{item.phrase}</h3><p>{item.meaning || '暂无释义'}</p>{item.note && <p className="review-muted">备注：{item.note}</p>}{actions('phrase', item)}</article>)}{!data.phrase.length && <p className="review-empty">暂无词组固定搭配，点击“+ 词组固定搭配”添加</p>}</>}
    {kind === 'spectrum' && <><p className="review-muted">以单词为根节点，释义和用法持续归档</p>{spectrumGroups.map(group => <article className="review-card" key={group.word.toLocaleLowerCase()}><div className="review-toolbar"><h3>{group.word}</h3><button onClick={() => openEditor('spectrum', null, group.word)}>+ 记录</button></div>{group.entries.map(item => <div className="review-spectrum-entry" key={item.id}><span className="review-tag">{item.entry_type === 'usage' ? '用法' : '词义'}</span><span className="review-pre">{item.detail}</span>{item.example && <blockquote>真题例句：{item.example}</blockquote>}{actions('spectrum', item)}</div>)}</article>)}{!spectrumGroups.length && <p className="review-empty">暂无词谱记录，点击“+ 词谱记录”添加</p>}</>}

    {modal && <Modal title={modal === 'settings' ? '长难句 API 设置' : modal === 'code' ? '编辑思维导图' : `${form.id ? '编辑' : '添加'}${editorTitles[modal]}`} onClose={closeModal}>
      <form className="review-form" onSubmit={saveEditor}><fieldset disabled={busy}>
        {modal === 'ebb' && <>{input('name', '背诵内容', { rows: 3 })}<Field label="模块"><select value={form.module} onChange={event => { const module = event.target.value; setForm(previous => ({ ...previous, module, subject: (module === '冲刺' ? ['专业课', '英语', '政治'] : ['专业课', '单词', '政治']).includes(previous.subject) ? previous.subject : '专业课' })); }}><option>常规</option><option>冲刺</option></select></Field><Field label="学科"><select value={form.subject} onChange={event => change('subject', event.target.value)}>{(form.module === '冲刺' ? ['专业课', '英语', '政治'] : ['专业课', '单词', '政治']).map(name => <option key={name}>{name}</option>)}</select></Field>{input('first_date', '首次学习日期', { type: 'date' })}</>}
        {modal === 'mindmap' && input('name', '章节名称')}
        {modal === 'code' && input('code', 'Mermaid 代码', { rows: 16 })}
        {modal === 'sentence' && <>{input('sentence', '长难句', { rows: 7 })}<Field label="题型"><select value={form.question_type} onChange={event => change('question_type', event.target.value)}><option value="translation">翻译题</option><option value="reading">阅读题</option></select></Field>{input('hint', '知识点归类标签（逗号、顿号分隔）')}</>}
        {modal === 'phrase' && <>{input('phrase', '词组 / 固定搭配')}{input('meaning', '释义 / 用法', { rows: 3 })}{input('note', '备注（可选）', { rows: 2 })}</>}
        {modal === 'spectrum' && <>{input('word', '单词')}<Field label="记录类型"><select value={form.entry_type} onChange={event => change('entry_type', event.target.value)}><option value="meaning">词义</option><option value="usage">用法</option></select></Field>{input('detail', form.entry_type === 'usage' ? '用法' : '词义', { rows: 3 })}{input('example', '真题例句（可选）', { rows: 3 })}</>}
        {modal === 'settings' && <>{input('apiUrl', 'API 地址', { type: 'url' })}{input('apiKey', 'API Key', { type: 'password' })}{input('model', '模型名称')}<p className="review-muted">密钥仅保存在当前浏览器本地，不会写入代码或数据库。</p></>}
        <div className="review-actions"><button type="button" onClick={closeModal}>取消</button><button type="submit" className="review-primary">{busy ? modal === 'sentence' ? '分析中…' : '保存中…' : modal === 'sentence' ? '分析并保存' : '保存'}</button></div>
      </fieldset></form>
    </Modal>}
    {detail && <Modal title="长难句详细分析" onClose={() => setDetail(null)}><SentenceDetail item={detail} /></Modal>}
    {recitation && recitationItem && <Modal title={`${recitation.type === 'sentence' ? '长难句' : '词组固定搭配'}背诵 · ${recitation.index + 1}/${recitation.items.length}`} onClose={() => setRecitation(null)}>
      <p className="review-question">{recitation.type === 'sentence' ? recitationItem.sentence : recitationItem.phrase}</p>
      {recitation.revealed ? recitation.type === 'sentence' ? <SentenceDetail item={recitationItem} /> : <div className="review-card"><b>释义 / 用法：</b><p>{recitationItem.meaning || '暂无'}</p>{recitationItem.note && <p>备注：{recitationItem.note}</p>}</div> : <button onClick={() => setRecitation(previous => ({ ...previous, revealed: true }))}>显示答案</button>}
      <div className="review-actions"><button onClick={() => setRecitation(null)}>退出背诵</button><button disabled={!recitation.revealed} onClick={() => setRecitation(previous => ({ ...previous, index: (previous.index + 1) % previous.items.length, revealed: false }))}>{recitation.index === recitation.items.length - 1 ? '重新开始' : '下一条'}</button></div>
    </Modal>}
  </section>;
}

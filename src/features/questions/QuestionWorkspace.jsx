import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sb, uploadImage } from '../../lib/supabase';
import { Modal, Field } from '../../components/ui';
import { aggregate, coreToQuestionPayload, mastery, ordered, questionToCorePayload, utcDate } from './questionModel';
import { ChapterOverview, ImagePreview, KnowledgeNote, QuestionCard, ReviewProgress } from './QuestionParts';
import { readQuestionCache, saveQuestionCache } from './questionCache';
import './questions.css';

const tables = ['chapters', 'knowledge_points', 'questions', 'core_questions'];
const initialData = Object.fromEntries(tables.map(t => [t, []]));
const colors = ['#3b82f6', '#16a34a', '#f59e0b', '#ef4444', '#9333ea'];

function ImageInput({ value, onChange, label }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!value || typeof value === 'string') { setPreview(value || ''); return; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  return <Field label={label}><div className={`image-upload-area ${value ? 'has-image' : ''}`}><input type="file" accept="image/*" capture="environment" aria-label={label} onChange={e => { const file = e.target.files?.[0]; if (file) onChange(file); }} />{preview ? <img src={preview} alt={label} /> : <div className="placeholder">点击上传或拍照</div>}</div>{value && <button type="button" onClick={() => onChange('')}>移除图片</button>}</Field>;
}

export default function QuestionWorkspace({ notify }) {
  const [data, setData] = useState(initialData);
  const [selection, setSelection] = useState({ chapter: null, kp: null, core: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [modal, setModal] = useState(null);
  const closeModal = useCallback(() => { if (!lock.current) setModal(null); }, []);
  const [preview, setPreview] = useState(null);
  const drag = useRef(null);
  const contentRef = useRef(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [selection.chapter, selection.kp, selection.core]);
  const chapters = ordered(data.chapters), kps = ordered(data.knowledge_points);
  const chapter = chapters.find(c => c.id === selection.chapter);
  const kp = kps.find(k => k.id === selection.kp);
  const table = selection.core ? 'core_questions' : 'questions';
  const visible = ordered(data[table].filter(q => selection.core ? q.chapter_id === selection.chapter : q.knowledge_point_id === selection.kp));
  const toast = message => notify?.(message);
  const reload = useCallback(async () => {
    try {
      const results = await Promise.all(tables.map(t => sb.from(t).select('*')));
      const failure = results.find(r => r.error);
      if (failure) throw failure.error;
      const next = Object.fromEntries(tables.map((t, i) => [t, results[i].data || []]));
      setData(next);
      setOffline(false);
      await saveQuestionCache(next);
    } catch (err) {
      const cache = await readQuestionCache();
      if (!cache) throw err;
      setData({ chapters: cache.chapters || [], knowledge_points: cache.kps || [], questions: cache.questions || [], core_questions: cache.coreQuestions || cache.core_questions || [] });
      setOffline(true);
    }
  }, []);
  useEffect(() => { let active = true; reload().catch(err => { if (active) { setError(err.message); notify?.(`加载失败: ${err.message}`); } }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [reload]);
  useEffect(() => { if (!loading && !offline) void saveQuestionCache(data); }, [data, loading, offline]);
  useEffect(() => {
    const home = () => { setSelection({ chapter: null, kp: null, core: false }); setSidebarOpen(false); };
    window.addEventListener('cuoti:home', home);
    return () => window.removeEventListener('cuoti:home', home);
  }, []);
  function choose(next) { setSelection(next); setSidebarOpen(false); }
  async function run(action, message) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try { await action(); if (message) toast(message); return true; }
    catch (err) { toast(`操作失败: ${err.message || err}`); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function checked(query) { const result = await query; if (result.error) throw result.error; return result.data; }
  async function patchRaw(t, id, payload) {
    await checked(sb.from(t).update(payload).eq('id', id));
    setData(current => ({ ...current, [t]: current[t].map(item => item.id === id ? { ...item, ...payload } : item) }));
  }
  const patch = (t, id, payload, message) => run(() => patchRaw(t, id, payload), message);
  function record(t, q, correct) {
    const field = correct ? 'correct_count' : 'wrong_count';
    const review_log = [...(q.review_log || []), { date: utcDate(), result: correct ? 'correct' : 'wrong' }];
    return patch(t, q.id, { [field]: (q[field] || 0) + 1, review_log }, correct ? mastery({ review_log }).mastered ? '恭喜！已掌握！' : `答对了（连续 ${mastery({ review_log }).streak}/5）` : '已记录答错');
  }
  function removeLog(t, q, index) {
    if (!window.confirm('确定删除这条正确/错误记录吗？')) return;
    const log = [...(q.review_log || [])];
    const [entry] = log.splice(index, 1);
    const field = entry.result === 'correct' ? 'correct_count' : 'wrong_count';
    return patch(t, q.id, { review_log: log, [field]: Math.max(0, (q[field] || 0) - 1) }, '记录已删除');
  }
  function remove(t, item) {
    const message = t === 'chapters' ? '确定删除该章节及所有知识点和错题？' : t === 'knowledge_points' ? '确定删除该知识点及所有错题？' : '确定删除该题目？';
    if (!window.confirm(message)) return;
    return run(async () => {
      await checked(sb.from(t).delete().eq('id', item.id));
      await reload();
      if ((t === 'chapters' && selection.chapter === item.id) || (t === 'knowledge_points' && selection.kp === item.id)) choose({ chapter: null, kp: null, core: false });
    }, '已删除');
  }
  function directory(kind, item) {
    if (kind === 'kp' && !chapters.length) return toast('请先添加章节');
    setModal({ kind, id: item?.id, name: item?.name || '', chapter: item?.chapter_id || selection.chapter || chapters[0]?.id || '', color: item?.color || '', note: item?.note || '' });
  }
  function questionModal(q) {
    setModal({ kind: 'question', id: q?.id, table, chapter: selection.chapter, kp: selection.kp || kps[0]?.id || '', image: q?.image_data || '', answer: q?.answer || '', answerImage: q?.answer_image || '', tag: q?.tag || '' });
  }
  function transfer(kind, item) {
    const targetCore = kind === 'convert' ? !selection.core : selection.core;
    const chapterOnly = kind === 'kpMove' || targetCore;
    const allowedChapters = chapters.filter(c => !((kind === 'kpMove' || (kind === 'move' && selection.core)) && c.id === (item.chapter_id || selection.chapter)));
    if (!allowedChapters.length || (!chapterOnly && !kps.length)) return toast('没有可用的目标位置，请先创建章节或知识点');
    const ch = allowedChapters[0].id;
    const availableKps = kps.filter(k => k.chapter_id === ch && !(kind === 'move' && !selection.core && k.id === item.knowledge_point_id));
    setModal({ kind, item, sourceTable: table, core: targetCore, chapterOnly, allowedChapters, chapter: ch, kp: availableKps[0]?.id || '' });
  }
  async function imageUrl(value, folder) {
    if (!value) return '';
    return typeof value === 'string' && !value.startsWith('data:') ? value : uploadImage(value, folder);
  }
  async function saveModal(e) {
    e.preventDefault();
    const m = modal;
    if (m.kind === 'chapter' || m.kind === 'kp') {
      if (!m.name.trim()) return toast('请输入名称');
      if (m.kind === 'kp' && !m.chapter) return toast('请选择章节');
    }
    if (m.kind === 'question' && !m.id && !m.image) return toast('请上传题目图片');
    if (['move', 'kpMove', 'convert'].includes(m.kind) && (!m.chapter || (!m.chapterOnly && !m.kp))) return toast('请选择有效的目标位置');
    const ok = await run(async () => {
      if (m.kind === 'chapter' || m.kind === 'kp') {
        const t = m.kind === 'chapter' ? 'chapters' : 'knowledge_points';
        const payload = m.kind === 'chapter' ? { name: m.name.trim() } : { name: m.name.trim(), chapter_id: Number(m.chapter), color: m.color, note: m.note.trim() };
        if (m.id) await patchRaw(t, m.id, payload);
        else await checked(sb.from(t).insert({ ...payload, sort_order: data[t].filter(item => t === 'chapters' || item.chapter_id === Number(m.chapter)).length + 1 }));
        if (m.kind === 'kp' && m.id === selection.kp) setSelection(s => ({ ...s, chapter: Number(m.chapter) }));
        await reload();
      } else if (m.kind === 'question') {
        const answer_image = await imageUrl(m.answerImage, 'answers');
        const answer = m.answer.trim();
        if (m.id) await patchRaw(m.table, m.id, { answer, answer_image });
        else {
          const core = m.table === 'core_questions';
          const payload = { image_data: await imageUrl(m.image, core ? 'core' : 'questions'), answer, answer_image, correct_count: 0, wrong_count: 0, review_log: [], ...(core ? { chapter_id: Number(m.chapter), tag: m.tag.trim() } : { knowledge_point_id: Number(m.kp), first_upload_date: utcDate(), file_name: typeof m.image === 'object' ? m.image.name || '' : '' }) };
          await checked(sb.from(m.table).insert(payload));
          await reload();
        }
      } else if (m.kind === 'tag') await patchRaw('core_questions', m.item.id, { tag: m.name.trim() });
      else if (m.kind === 'kpMove') {
        await patchRaw('knowledge_points', m.item.id, { chapter_id: Number(m.chapter) });
        if (selection.kp === m.item.id) choose({ chapter: Number(m.chapter), kp: null, core: false });
      } else if (m.kind === 'move') {
        await patchRaw(m.sourceTable, m.item.id, m.core ? { chapter_id: Number(m.chapter) } : { knowledge_point_id: Number(m.kp) });
      } else if (m.kind === 'convert') {
        const targetTable = m.core ? 'core_questions' : 'questions';
        const payload = m.core ? questionToCorePayload(m.item, Number(m.chapter)) : coreToQuestionPayload(m.item, Number(m.kp));
        const inserted = await checked(sb.from(targetTable).insert(payload).select('id').single());
        try { await checked(sb.from(m.sourceTable).delete().eq('id', m.item.id)); }
        catch (err) {
          const rollback = await sb.from(targetTable).delete().eq('id', inserted.id);
          if (rollback.error) throw new Error(`${err.message}；回滚失败：${rollback.error.message}，请检查重复题目`);
          throw err;
        }
        await reload();
        choose({ chapter: Number(m.chapter), kp: m.core ? null : Number(m.kp), core: m.core });
      }
    }, '已保存');
    if (ok) setModal(null);
  }
  function dragProps(t, item, parent) {
    return { draggable: !busy, onDragStart: e => { if (e.target.closest('button,input,textarea,select')) { e.preventDefault(); return; } drag.current = { t, id: item.id, parent }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(item.id)); e.currentTarget.classList.add('dragging'); }, onDragEnd: e => { drag.current = null; e.currentTarget.classList.remove('dragging'); }, onDragOver: e => { if (drag.current?.t === t && drag.current.parent === parent) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('drag-over-kp'); } }, onDragLeave: e => e.currentTarget.classList.remove('drag-over-kp'), onDrop: e => {
      e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('drag-over-kp');
      const source = drag.current; drag.current = null;
      if (!source || source.t !== t || source.parent !== parent || source.id === item.id) return;
      run(async () => {
        const list = ordered(data[t].filter(q => t === 'chapters' || (t === 'knowledge_points' || t === 'core_questions' ? q.chapter_id === parent : q.knowledge_point_id === parent)));
        const a = list.findIndex(q => q.id === source.id), b = list.findIndex(q => q.id === item.id);
        if (a < 0 || b < 0) return;
        [list[a], list[b]] = [list[b], list[a]];
        try { const results = await Promise.all(list.map((q, i) => sb.from(t).update({ sort_order: i + 1 }).eq('id', q.id))); const fail = results.find(r => r.error); if (fail) throw fail.error; }
        finally { await reload(); }
      });
    } };
  }
  const modalUpdate = payload => setModal(m => ({ ...m, ...payload }));
  const stats = aggregate(visible);
  const stop = fn => e => { e.stopPropagation(); fn(); };
  const chapterKps = chapter ? kps.filter(k => k.chapter_id === chapter.id) : [];
  const transferModal = modal && ['move', 'kpMove', 'convert'].includes(modal.kind);
  const modalKps = transferModal ? kps.filter(k => k.chapter_id === Number(modal.chapter) && !(modal.kind === 'move' && !modal.core && k.id === modal.item.knowledge_point_id)) : [];

  return <div className="question-workspace">
    {chapter && <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />}
    <div className="body-row">
      {chapter && <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-actions">
          <button onClick={() => choose({ chapter: null, kp: null, core: false })}>返回所有章节</button>
          <h2>目录</h2>
          <button disabled={busy} onClick={() => directory('kp')}>+ 添加知识点</button>
        </div>
        <div className="sidebar-tree">
          <div className="tree-chapter">
            <button className={`chapter-header ${!kp && !selection.core ? 'active' : ''}`} onClick={() => choose({ chapter: chapter.id, kp: null, core: false })}>{chapter.name}</button>
            <div className="kp-list open">
              {chapterKps.map(k => <div key={k.id} className={`kp-item ${selection.kp === k.id ? 'active' : ''} ${k.color ? 'custom-color' : ''}`} style={k.color ? { '--kp-color': k.color } : undefined} {...dragProps('knowledge_points', k, chapter.id)} tabIndex={0} role="button" onClick={() => choose({ chapter: chapter.id, kp: k.id, core: false })} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose({ chapter: chapter.id, kp: k.id, core: false }); } }}>
                <span className="drag-handle">⠿</span>
                <span className="kp-name">{k.name}<button className="edit-btn kp-edit-btn" title="编辑知识点" onClick={stop(() => directory('kp', k))}>✎</button></span>
                <span className="kp-count">{data.questions.filter(q => q.knowledge_point_id === k.id).length}</span>
                <button className="kp-move-btn" title="转移知识点" onClick={stop(() => transfer('kpMove', k))}>↗</button>
                <button className="del-kp" title="删除知识点" disabled={busy} onClick={stop(() => remove('knowledge_points', k))}>×</button>
              </div>)}
              {!chapterKps.length && <div className="question-hint">暂无知识点</div>}
              <button className={`kp-item question-core-link ${selection.core ? 'active' : ''}`} onClick={() => choose({ chapter: chapter.id, kp: null, core: true })}><span>★ 重要例题</span><span className="kp-count">{data.core_questions.filter(q => q.chapter_id === chapter.id).length}</span></button>
            </div>
          </div>
        </div>
      </aside>}
      <main className="main">
        {chapter && <div className="main-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="目录">☰</button>
          <div className="breadcrumb"><button onClick={() => choose({ chapter: chapter.id, kp: null, core: false })}>{chapter.name}</button>{(kp || selection.core) && <span> &gt; {selection.core ? '★ 重要例题' : kp.name}</span>}</div>
          {kp && <div className="question-header-tools"><span className="accuracy">正确率 {stats.rate ?? 0}%（{stats.correct}/{stats.attempts}）</span><button className="header-edit-btn" onClick={() => directory('kp', kp)}>编辑知识点</button><span className="kp-color-swatches">{colors.map(color => <button key={color} disabled={busy} className="kp-color-swatch" style={{ background: color }} title={`设置颜色 ${color}`} onClick={() => patch('knowledge_points', kp.id, { color }, '目录颜色已更新')} />)}<button className="kp-color-default" disabled={busy} onClick={() => patch('knowledge_points', kp.id, { color: '' }, '目录颜色已重置')}>默认</button></span></div>}
          <span className="total-count">总错题数 {data.questions.length}</span>
          {(kp || selection.core) && <button className="add-btn" disabled={busy} onClick={() => questionModal()}>{selection.core ? '+ 重要例题' : '+ 错题'}</button>}
        </div>}
        <div className="main-content" ref={contentRef}><div className="panel active" id="panelCuoti">
          {loading && <p className="question-hint">正在加载…</p>}
          {offline && <p className="question-hint" role="status">离线模式（上次缓存）<button disabled={busy} onClick={() => run(reload)}>重新同步</button></p>}
          {error && <div role="alert">加载失败：{error}<button onClick={() => run(async () => { await reload(); setError(''); }, '数据已同步')}>重试</button></div>}
          {!chapter ? <section className="chapter-home">
            <header className="home-heading">
              <div><p>错题集</p><h1>章节总览</h1><p>共 {chapters.length} 个章节 · {data.questions.length + data.core_questions.length} 题</p></div>
              <button className="add-btn" disabled={busy} onClick={() => directory('chapter')}>+ 添加章节</button>
            </header>
            <div className="chapter-grid">
              {chapters.map((ch, index) => {
                const children = kps.filter(k => k.chapter_id === ch.id);
                const questions = [...data.questions.filter(q => children.some(k => k.id === q.knowledge_point_id)), ...data.core_questions.filter(q => q.chapter_id === ch.id)];
                return <article className="chapter-card" key={ch.id} {...dragProps('chapters', ch, null)}>
                  <button className="chapter-card-open" onClick={() => choose({ chapter: ch.id, kp: null, core: false })}>
                    <span className="chapter-card-index">{String(index + 1).padStart(2, '0')}</span>
                    <h2>{ch.name}</h2>
                    <span className="chapter-card-meta">{children.length} 个知识点 · {questions.length} 题</span>
                  </button>
                  <div className="chapter-card-tools"><span className="drag-handle">⠿</span><button className="edit-btn" title="编辑章节" disabled={busy} onClick={() => directory('chapter', ch)}>编辑</button><button className="del-chapter" title="删除章节" disabled={busy} onClick={() => remove('chapters', ch)}>删除</button></div>
                  <ReviewProgress questions={questions} />
                </article>;
              })}
            </div>
            {!loading && !chapters.length && <div className="empty-state"><p>添加章节，即可开始记录错题</p></div>}
          </section> : <>
            {kp && <KnowledgeNote key={kp.id} kp={kp} busy={busy} save={note => patch('knowledge_points', kp.id, { note }, '笔记已保存')} />}
            {(kp || selection.core) ? <>
              {selection.core && <p className="question-hint">重要例题集 · 共 {visible.length} 题</p>}
              <div className="question-grid">{visible.map(q => <QuestionCard key={`${table}-${q.id}`} question={q} core={selection.core} busy={busy} update={payload => patch(table, q.id, payload, '备注已保存')} record={correct => record(table, q, correct)} removeLog={index => removeLog(table, q, index)} editAnswer={() => questionModal(q)} preview={() => setPreview({ core: selection.core, ids: visible.map(item => item.id), index: visible.findIndex(item => item.id === q.id) })} previewImage={src => setPreview({ src })} move={() => transfer('move', q)} convert={() => transfer('convert', q)} remove={() => remove(table, q)} editTag={() => setModal({ kind: 'tag', item: q, name: q.tag || '' })} dragProps={dragProps(table, q, selection.core ? selection.chapter : selection.kp)} />)}</div>
              {!visible.length && <div className="empty-state"><p>当前目录暂无{selection.core ? '重要例题' : '错题'}，点击上方按钮添加</p></div>}
            </> : <ChapterOverview chapter={chapter} kps={kps} questions={data.questions} cores={data.core_questions} />}
          </>}
        </div></div>
      </main>
    </div>
    {modal && <Modal title={modal.kind === 'chapter' ? `${modal.id ? '编辑' : '添加'}章节` : modal.kind === 'kp' ? `${modal.id ? '编辑' : '添加'}知识点` : modal.kind === 'question' ? modal.id ? '编辑题目答案' : modal.table === 'core_questions' ? '添加重要例题' : '添加错题' : modal.kind === 'tag' ? '修改题型标签' : modal.kind === 'convert' ? modal.core ? '转为重要例题' : '转为知识点错题' : modal.kind === 'kpMove' ? '转移知识点及其中错题' : '转移题目'} onClose={closeModal}><form onSubmit={saveModal}><fieldset disabled={busy} className="question-form-fields">{['chapter', 'kp', 'tag'].includes(modal.kind) && <Field label={modal.kind === 'tag' ? '题型标签' : '名称'}><input autoFocus required={modal.kind !== 'tag'} value={modal.name} onChange={e => modalUpdate({ name: e.target.value })} /></Field>}{modal.kind === 'kp' && <><Field label="所属章节"><select value={modal.chapter} onChange={e => modalUpdate({ chapter: Number(e.target.value) })}>{chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></Field><Field label="目录颜色"><select value={modal.color} onChange={e => modalUpdate({ color: e.target.value })}><option value="">默认</option>{colors.map(color => <option key={color} value={color}>{color}</option>)}</select></Field><Field label="笔记（支持 LaTeX）"><textarea rows={4} value={modal.note} onChange={e => modalUpdate({ note: e.target.value })} /></Field></>}{modal.kind === 'question' && <>{!modal.id && <>{modal.table === 'core_questions' ? <><Field label="所属章节"><select value={modal.chapter} onChange={e => modalUpdate({ chapter: Number(e.target.value) })}>{chapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></Field><Field label="题型标签"><input value={modal.tag} onChange={e => modalUpdate({ tag: e.target.value })} /></Field></> : <Field label="所属知识点"><select required value={modal.kp} onChange={e => modalUpdate({ kp: Number(e.target.value) })}>{chapters.map(ch => <optgroup key={ch.id} label={ch.name}>{kps.filter(k => k.chapter_id === ch.id).map(k => <option key={k.id} value={k.id}>{ch.name} &gt; {k.name}</option>)}</optgroup>)}</select></Field>}<ImageInput label="上传题目图片" value={modal.image} onChange={image => modalUpdate({ image })} /></>}<Field label="答案（支持 LaTeX）"><textarea rows={4} value={modal.answer} onChange={e => modalUpdate({ answer: e.target.value })} /></Field><ImageInput label="上传答案图片" value={modal.answerImage} onChange={answerImage => modalUpdate({ answerImage })} /></>}{transferModal && <><Field label="目标章节"><select value={modal.chapter} onChange={e => { const ch = Number(e.target.value); const target = kps.find(k => k.chapter_id === ch && !(modal.kind === 'move' && !modal.core && k.id === modal.item.knowledge_point_id)); modalUpdate({ chapter: ch, kp: target?.id || '' }); }}>{modal.allowedChapters.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></Field>{!modal.chapterOnly && <Field label="目标知识点"><select required value={modal.kp} disabled={!modalKps.length} onChange={e => modalUpdate({ kp: Number(e.target.value) })}>{!modalKps.length && <option value="">该章节无可用知识点</option>}{modalKps.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select></Field>}</>}<div className="modal-btns"><button type="button" className="btn-cancel" onClick={() => setModal(null)}>取消</button><button type="submit" className="btn-confirm">{busy ? '保存中…' : '保存'}</button></div></fieldset></form></Modal>}
    {preview && <ImagePreview state={preview} questions={data[preview.core ? 'core_questions' : 'questions']} busy={busy} onClose={() => setPreview(null)} record={(q, correct) => record(preview.core ? 'core_questions' : 'questions', q, correct)} update={(q, payload) => patch(preview.core ? 'core_questions' : 'questions', q.id, payload, '答案已保存')} />}
  </div>;
}

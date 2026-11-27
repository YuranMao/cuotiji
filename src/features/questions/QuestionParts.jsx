import React, { useEffect, useRef, useState } from 'react';
import { MathText } from '../../components/ui';
import { sb } from '../../lib/supabase';
import { aggregate, mastery, normalizeNote } from './questionModel';

export function ReviewSummary({ questions }) {
  const s = aggregate(questions);
  return <><div className="question-summary">{[['错题总数', s.total, '当前范围收录题量'], ['已掌握', s.mastered, '连续答对至少 5 次'], ['待复习', s.pending, '复习中 + 未复习'], ['复习正确率', s.rate === null ? '—' : `${s.rate}%`, '答对次数 / 总复习次数'], ['累计复习次数', s.attempts, '每次答对或答错计 1 次']].map(([label, value, hint]) => <div key={label}><small>{label}</small><strong>{value}</strong><small>{hint}</small></div>)}</div><p className="question-hint">末尾连续答对至少 5 次即已掌握，答错后重新累计。正确率与累计次数按历史答对、答错次数统计。</p><div className="question-stats-bar" role="img" aria-label={`已掌握 ${s.mastered}，复习中 ${s.reviewing}，未复习 ${s.unreviewed}`}>{[[s.mastered, '#22c55e'], [s.reviewing, '#facc15'], [s.unreviewed, '#cbd5e1']].map(([count, color], i) => <span key={i} style={{ width: `${s.total ? count / s.total * 100 : 0}%`, background: color }} />)}</div><p className="question-hint">已掌握 {s.mastered} · 复习中 {s.reviewing} · 未复习 {s.unreviewed}{s.total ? ` · 掌握率 ${Math.round(s.mastered / s.total * 100)}%` : ' · 暂无错题'}</p></>;
}

const reviewStatuses = [
  { key: 'unreviewed', label: '未复习', color: '#cbd5e1' },
  { key: 'reviewing', label: '复习中', color: '#facc15' },
  { key: 'mastered', label: '已掌握', color: '#22c55e' },
];

export function ReviewProgress({ questions }) {
  const stats = aggregate(questions);
  return <div className="review-progress">
    <div className="review-progress-track" role="img" aria-label={`共 ${stats.total} 题，未复习 ${stats.unreviewed} 题，复习中 ${stats.reviewing} 题，已掌握 ${stats.mastered} 题`} style={{ display: 'flex' }}>
      {reviewStatuses.map(status => <span key={status.key} style={{ width: `${stats.total ? stats[status.key] / stats.total * 100 : 0}%`, background: status.color }} />)}
    </div>
    <ul className="chart-legend">{reviewStatuses.map(status => <li key={status.key}><span className="chart-legend-swatch" aria-hidden="true" style={{ background: status.color }} />{status.label} {stats[status.key]} 题</li>)}</ul>
    {!stats.total && <p className="analytics-empty">暂无错题</p>}
  </div>;
}

function ChapterSources({ chapterId }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function loadSources() {
    setLoading(true);
    setError('');
    try {
      const { data, error: failure } = await sb.from('chapter_sources').select('*').eq('chapter_id', chapterId).order('created_at').order('id');
      if (failure) throw failure;
      setItems(data || []);
    } catch (err) { setError(`来源加载失败，请确认已执行建表 SQL：${err.message}`); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadSources(); }, [chapterId]);
  async function change(action) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try { await action(); return true; }
    catch (err) { setError(`来源保存失败：${err.message}`); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  return <aside className="analytics-panel chapter-sources">
    <div className="sources-heading"><h3>来源记录</h3><span>{items.filter(item => item.done).length} / {items.length} 已整理</span></div>
    <form className="source-form" onSubmit={async e => {
      e.preventDefault();
      const value = name.trim();
      if (!value) return;
      const ok = await change(async () => {
        const { data, error: failure } = await sb.from('chapter_sources').insert({ chapter_id: chapterId, name: value }).select().single();
        if (failure) throw failure;
        setItems(current => [...current, data]);
      });
      if (ok) setName('');
    }}>
      <input aria-label="来源名称" placeholder="输入书名或习题册名称" maxLength={160} value={name} onChange={e => setName(e.target.value)} disabled={loading || busy} />
      <button type="submit" disabled={!name.trim() || loading || busy}>添加来源</button>
    </form>
    {error && <p className="source-error" role="alert">{error} <button type="button" disabled={busy || loading} onClick={loadSources}>重新加载</button></p>}
    {loading && <p className="question-hint" role="status">正在加载来源…</p>}
    <ul className="source-list">{items.map(item => <li key={item.id} className={item.done ? 'is-done' : ''}>
      <label><input type="checkbox" checked={item.done} disabled={busy || loading} onChange={() => change(async () => {
        const { data, error: failure } = await sb.from('chapter_sources').update({ done: !item.done }).eq('id', item.id).eq('chapter_id', chapterId).select().single();
        if (failure) throw failure;
        setItems(current => current.map(row => row.id === item.id ? data : row));
      })} /><span>{item.name}</span></label>
      <button type="button" disabled={busy || loading} aria-label={`删除来源：${item.name}`} onClick={() => change(async () => {
        const { error: failure } = await sb.from('chapter_sources').delete().eq('id', item.id).eq('chapter_id', chapterId).select().single();
        if (failure) throw failure;
        setItems(current => current.filter(row => row.id !== item.id));
      })}>×</button>
    </li>)}</ul>
    {!items.length && !error && !loading && <div className="sources-empty"><strong>从第一本书开始</strong><p>添加错题来源，记录你的整理进度。</p></div>}
    <div className="sources-storage">按章节保存至 Supabase</div>
  </aside>;
}

const distributionColors = ['#3556a8', '#4b6bc0', '#6281d2', '#7c97df', '#98afe9', '#b4c5f1', '#cedaf7', '#e2e9fc'];

export function ChapterOverview({ chapter, kps, questions, cores }) {
  const groups = kps.filter(k => k.chapter_id === chapter.id).map(k => {
    const items = questions.filter(q => q.knowledge_point_id === k.id);
    return { id: `kp-${k.id}`, name: k.name, questions: items, stats: aggregate(items) };
  });
  const core = cores.filter(q => q.chapter_id === chapter.id);
  const all = [...groups.flatMap(g => g.questions), ...core];
  const stats = aggregate(all);
  const distribution = [...groups, { id: 'core', name: '重要例题', stats: aggregate(core) }].filter(g => g.stats.total > 0);
  const ranked = [...groups].sort((a, b) => {
    if (!a.stats.attempts) return b.stats.attempts ? 1 : 0;
    if (!b.stats.attempts) return -1;
    return b.stats.wrong / b.stats.attempts - a.stats.wrong / a.stats.attempts || b.stats.attempts - a.stats.attempts;
  });
  let offset = 0;
  const slices = distribution.map((g, index) => {
    const start = offset;
    offset += g.stats.total / stats.total * 100;
    return { ...g, color: distributionColors[index % distributionColors.length], start, end: offset };
  });
  return <section className="chapter-overview">
    <div className="chapter-dashboard">
      <section className="analytics-panel overview-summary">
        <h3>总体信息</h3>
        <ReviewSummary questions={all} />
      </section>
      <div className="chapter-charts">
        <section className="analytics-panel accuracy-panel">
          <h3>知识点错误率</h3>
          <p className="question-hint">随复习记录更新，按错误率从高到低排列</p>
          {ranked.length ? <div className="accuracy-chart">
            <div className="accuracy-axis" aria-hidden="true">{[100, 75, 50, 25, 0].map(value => <span key={value}>{value}%</span>)}</div>
            <div className="accuracy-scroll"><div className="accuracy-columns" style={{ minWidth: `${ranked.length * 66}px` }}>
              {ranked.map(g => {
                const rate = g.stats.attempts ? g.stats.wrong / g.stats.attempts * 100 : null;
                return <div className="accuracy-column" key={g.id} title={`${g.name}：${rate === null ? '暂无复习记录' : `错误率 ${rate.toFixed(1)}%，答错 ${g.stats.wrong} / 复习 ${g.stats.attempts} 次`}`}>
                  <div className="accuracy-bar-area"><div className={`accuracy-bar ${rate === null ? 'no-record' : ''}`} style={{ height: `${rate || 0}%` }}><span>{rate === null ? '—' : `${Math.round(rate)}%`}</span></div></div>
                  <span className="accuracy-label">{g.name}</span>
                </div>;
              })}
            </div></div>
          </div> : <p className="analytics-empty">添加知识点后显示错误率图表。</p>}
          <p className="chart-footnote">错误率 = 答错次数 / 复习次数；— 表示暂无记录</p>
        </section>
        <section className="analytics-panel distribution-panel">
          <h3>错题数量分布</h3>
          <p className="question-hint">按知识点统计收录题量</p>
          {stats.total ? <>
            <div className="question-pie" role="img" aria-label={slices.map(g => `${g.name} ${g.stats.total} 题，占 ${(g.stats.total / stats.total * 100).toFixed(1)}%`).join('；')} style={{ background: `conic-gradient(${slices.map(g => `${g.color} ${g.start}% ${g.end}%`).join(',')})` }} />
            <ul className="pie-legend">{slices.map(g => <li key={g.id} title={`${g.name}：${g.stats.total} 题，占 ${(g.stats.total / stats.total * 100).toFixed(1)}%`}><span className="chart-legend-swatch" style={{ background: g.color }} /><span>{g.name}</span><strong>{g.stats.total}</strong></li>)}</ul>
          </> : <div className="pie-empty"><div className="question-pie" /><p className="analytics-empty">暂无错题</p></div>}
        </section>
      </div>
      <ChapterSources key={chapter.id} chapterId={chapter.id} />
    </div>
  </section>;
}

export function KnowledgeNote({ kp, save, busy }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(kp.note || '');
  return <div className="kp-note-block"><div className="kp-note-header"><span className="kp-note-title">我的笔记</span><button onClick={() => { setText(kp.note || ''); setEditing(!editing); }}>{editing ? '取消' : '编辑'}</button></div>{editing ? <><textarea value={text} onChange={e => setText(e.target.value)} placeholder="记录重点、易错点或公式，支持 $...$ 和 $$...$$" /><div className="kp-note-actions"><button className="primary" disabled={busy} onClick={async () => { if (await save(text.trim())) setEditing(false); }}>保存笔记</button></div></> : kp.note ? <MathText className="kp-note-content" text={normalizeNote(kp.note)} /> : <p className="question-hint">暂无笔记</p>}</div>;
}

function CardNote({ question, save, busy }) {
  const [text, setText] = useState(question.note || '');
  const [status, setStatus] = useState('Enter 保存，Shift+Enter 换行');
  useEffect(() => { setText(question.note || ''); }, [question.note]);
  return <div className="question-note"><div>备注 <span className="question-note-status" aria-live="polite">{status}</span></div><textarea className="question-note-input" rows="2" aria-label="错题备注" value={text} readOnly={busy} onChange={e => { setText(e.target.value); setStatus('未保存 · Enter 保存'); }} onKeyDown={async e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); setStatus('保存中…'); const ok = await save(text.trim()); setStatus(ok ? '已保存 · Enter 保存，Shift+Enter 换行' : '保存失败 · 按 Enter 重试'); } }} /></div>;
}

export function QuestionCard({ question: q, core, busy, update, record, removeLog, editAnswer, preview, previewImage, move, convert, remove, editTag, dragProps }) {
  const [revealed, setRevealed] = useState(false);
  const m = mastery(q);
  const log = q.review_log || [];
  return <article className="question-card" data-id={q.id} style={core ? { borderLeft: '3px solid #e67e22' } : undefined} {...dragProps}><div className="card-img-wrap" role="button" tabIndex={0} onClick={preview} onKeyDown={e => { if (e.key === 'Enter') preview(); }}><img src={q.image_data} alt={core ? '重要例题' : '错题'} loading="lazy" draggable={false} /><span className="drag-handle question-card-handle">⠿</span></div><div className="card-info">{!core && <><div className="card-date">首次上传：{q.first_upload_date}</div>{q.file_name && <div className="card-date">{q.file_name}</div>}</>}<div className={`answer-section ${revealed ? 'revealed' : ''}`} onClick={() => setRevealed(true)}><div className="answer-title">答案 <button className="answer-edit-btn" onClick={e => { e.stopPropagation(); editAnswer(); }}>编辑</button></div><MathText className="answer-content" text={q.answer || '未填写文字答案'} />{q.answer_image && <img className="answer-image" src={q.answer_image} alt="答案图片" onClick={e => { e.stopPropagation(); if (revealed) previewImage(q.answer_image); else setRevealed(true); }} />}{!revealed && <button className="answer-mask" onClick={() => setRevealed(true)}>点击显示答案</button>}</div><CardNote question={q} busy={busy} save={note => update({ note })} />{core && <div className="question-core-tag">{q.tag || '未分类'} <button onClick={editTag} title="修改题型标签">编辑</button></div>}<div className="progress-section">{m.mastered && <span className="card-badge">✓ 已掌握</span>}<div className="progress-header"><span className="review-label">连续答对 {m.streak} / 5（共答 {m.correct + m.wrong} 次）</span></div><div className="progress-bar-wrap"><div className={`progress-bar-fill ${m.mastered ? 'full' : ''}`} style={{ width: `${Math.min(m.streak / 5 * 100, 100)}%` }} /></div><div className="review-dates">{log.slice(-8).reverse().map((entry, index) => <span key={log.length - 1 - index} className={`review-date-tag ${entry.result === 'correct' ? 'tag-correct' : 'tag-wrong'}`}>{entry.date} {entry.result === 'correct' ? '✓' : '✗'}<button disabled={busy} title="删除这条记录" onClick={() => removeLog(log.length - 1 - index)}>×</button></span>)}</div></div><div className="card-actions"><button className="btn-correct" disabled={busy} onClick={() => record(true)}>答对了</button><button className="btn-wrong" disabled={busy} onClick={() => record(false)}>还不会</button><button className="btn-delete" disabled={busy} onClick={remove}>删除</button><button className="btn-delete" disabled={busy} title="转移题目" onClick={move}>↗</button><button className="btn-delete" disabled={busy} onClick={convert}>{core ? '转为普通题' : '转为例题'}</button></div></div></article>;
}

export function ImagePreview({ state, questions, busy, onClose, record, update }) {
  const [index, setIndex] = useState(state.index || 0);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState('');
  const touch = useRef(null);
  const closeButton = useRef(null);
  const q = state.ids ? questions.find(item => item.id === state.ids[index]) : null;
  const m = q ? mastery(q) : null;
  function navigate(direction) {
    if (busy || editing || !state.ids) return;
    setIndex(i => Math.max(0, Math.min(state.ids.length - 1, i + direction)));
    setAnswerVisible(false);
  }
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const handler = e => {
      if (e.isComposing || e.target.matches('input,textarea,[contenteditable="true"]')) return;
      if (e.key === 'Escape') { if (!busy) onClose(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); navigate(e.key === 'ArrowLeft' ? -1 : 1); }
      if (e.key === 'Tab') {
        const focusable = [...closeButton.current.closest('[role="dialog"]').querySelectorAll('button:not(:disabled),textarea:not(:disabled)')].filter(el => !el.closest('[hidden]'));
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });
  return <div className="img-preview-overlay show" role="dialog" aria-modal="true" aria-label="图片预览" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><div className="img-preview-header"><div className="preview-heading"><span className="preview-mode">{state.ids ? '专注复习' : '图片预览'}</span><strong>{state.ids ? `${state.core ? '重要例题' : '错题'} · ${index + 1} / ${state.ids.length}` : '查看图片'}</strong></div><div className="preview-header-end"><span className="preview-keyboard-hint">← → 切题 · Esc 退出</span><button ref={closeButton} disabled={busy} onClick={onClose} aria-label="关闭图片预览">关闭 ×</button></div></div><div className={`preview-body ${q ? '' : 'preview-image-only'}`}><div className="preview-canvas"><div className="img-preview-stage" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }} onTouchStart={e => { touch.current = e.touches.length === 1 && (!window.visualViewport || window.visualViewport.scale <= 1) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }} onTouchMove={e => { if (touch.current && (e.touches.length !== 1 || Math.abs(e.touches[0].clientY - touch.current.y) > 24)) touch.current = null; }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={e => { const start = touch.current; touch.current = null; if (!start || e.touches.length || e.changedTouches.length !== 1) return; const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y; if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1); }}><img src={q?.image_data || state.src} alt="图片预览" draggable={false} /></div>{q && <div className="preview-navigation"><button disabled={busy || editing || index === 0} onClick={() => navigate(-1)}>← 上一题</button><span>{index + 1} <span>/ {state.ids.length}</span></span><button disabled={busy || editing || index === state.ids.length - 1} onClick={() => navigate(1)}>下一题 →</button></div>}</div>{q && <aside className="preview-sidebar"><div className="preview-answer-heading"><div><span className="preview-eyebrow">先思考，再核对</span><h2>答案与解析</h2></div><button disabled={busy || editing} aria-expanded={answerVisible} aria-controls="preview-answer" onClick={() => setAnswerVisible(!answerVisible)}>{answerVisible ? '收起答案' : '查看答案'}</button></div>{!answerVisible && <div className="preview-answer-empty"><span aria-hidden="true">?</span><strong>给自己一点思考空间</strong><p>完成作答后，点击「查看答案」核对思路。</p></div>}<section id="preview-answer" className="img-preview-answer" hidden={!answerVisible} aria-label="题目答案">{editing ? <><label htmlFor="preview-answer-input">答案文字</label><textarea id="preview-answer-input" rows={3} value={answer} disabled={busy} onChange={e => setAnswer(e.target.value)} /><div className="img-preview-actions"><button disabled={busy} onClick={async () => { if (await update(q, { answer: answer.trim() })) setEditing(false); }}>保存答案</button><button disabled={busy} onClick={() => setEditing(false)}>取消</button></div></> : <><MathText className="answer-content" text={q.answer || '未填写文字答案'} />{q.answer_image && <img src={q.answer_image} alt="答案图片" />}<div className="img-preview-actions"><button onClick={() => { setAnswer(q.answer || ''); setEditing(true); }}>修改答案文字</button></div></>}</section><div className="img-preview-controls"><div className="preview-progress-heading"><strong>掌握进度</strong><span className={m.mastered ? 'is-mastered' : ''}>{m.mastered ? '已掌握' : `连续答对 ${m.streak} / 5`}</span></div><progress max={5} value={Math.min(m.streak, 5)} aria-label="连续答对进度" /><div className="preview-review-status" aria-live="polite">答对 {m.correct} 次 · 答错 {m.wrong} 次{busy ? ' · 保存中…' : ''}</div><div className="img-preview-actions"><button className="preview-wrong" disabled={busy || editing} onClick={() => record(q, false)}>× 还不会</button><button className="preview-correct" disabled={busy || editing} onClick={() => record(q, true)}>✓ 答对了</button></div><p className="preview-review-hint">连续答对 5 次，标记为已掌握</p></div></aside>}</div></div>;
}

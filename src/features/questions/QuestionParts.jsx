import React, { useEffect, useRef, useState } from 'react';
import { NoteInput } from '../../components/ui';
import { aggregate, mastery, sourcePath, sourceRows } from './questionModel';

export function SourceSelect({ sources, value, onChange, disabled, label = '题目来源', exclude = [] }) {
  return <select aria-label={label} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}><option value="">未设置来源</option>{sourceRows(sources).filter(s => !exclude.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.path}</option>)}</select>;
}

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

function ChapterSources({ sources, items, questions, busy, add, toggle, remove, create }) {
  const counts = new Map(sourceRows(sources, questions).map(s => [s.id, s.count]));
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  return <aside className="analytics-panel chapter-sources">
    <div className="sources-heading"><h3>来源记录</h3><span>{items.filter(item => item.done).length} / {items.length} 已整理</span></div>
    <form className="source-form" onSubmit={async e => { e.preventDefault(); if (selected && await add(selected)) setSelected(''); }}>
      <SourceSelect sources={sources} exclude={items.map(item => item.source_id)} value={selected} onChange={setSelected} disabled={busy} label="章节来源" />
      <button disabled={busy || !selected}>关联来源</button>
    </form>
    <form className="source-form" onSubmit={async e => { e.preventDefault(); if (name.trim() && await create(name.trim(), parent || null)) setName(''); }}>
      <input aria-label="来源名称" placeholder="新来源名称" maxLength={160} value={name} onChange={e => setName(e.target.value)} disabled={busy} />
      <select aria-label="新来源的父来源" value={parent} disabled={busy} onChange={e => setParent(e.target.value)}><option value="">顶级来源</option>{sourceRows(sources).map(s => <option key={s.id} value={s.id}>{s.path}</option>)}</select>
      <button disabled={busy || !name.trim()}>新建并关联</button>
    </form>
    <ul className="source-list">{items.map(item => <li key={item.id} className={item.done ? 'is-done' : ''}><label><input type="checkbox" checked={item.done} disabled={busy} onChange={() => toggle(item)} /><span>{sourcePath(sources, item.source_id) || item.name}</span></label><strong className="source-question-count">{counts.get(item.source_id) || 0} 题</strong><button type="button" disabled={busy} aria-label={`移除章节来源：${item.name}`} onClick={() => remove(item)}>×</button></li>)}</ul>
    {!items.length && <p className="question-hint">选择共用来源，记录本章节的整理进度。</p>}
    <div className="sources-storage">本章节题数，含重要例题 · 父来源包含子来源</div>
  </aside>;
}

const distributionColors = ['#3556a8', '#4b6bc0', '#6281d2', '#7c97df', '#98afe9', '#b4c5f1', '#cedaf7', '#e2e9fc'];

export function ChapterOverview({ chapter, kps, questions, cores, sourceProps }) {
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
      <ChapterSources key={chapter.id} {...sourceProps} questions={all} />
    </div>
  </section>;
}

export function KnowledgeNote({ kp, save, busy }) {
  return <div className="kp-note-block"><div className="kp-note-header"><span className="kp-note-title">我的笔记</span></div><NoteInput aria-label="知识点笔记" placeholder="记录重点、易错点或公式…" value={kp.note} disabled={busy} onSave={save} /></div>;
}

function CardNote({ question, save, busy }) {
  return <div className="question-note"><div>备注</div><NoteInput aria-label="错题备注" value={question.note} disabled={busy} onSave={save} /></div>;
}

export function QuestionCard({ question: q, core, busy, update, record, removeLog, editAnswer, preview, previewImage, move, convert, remove, editTag, dragProps, sources }) {
  const [revealed, setRevealed] = useState(false);
  const m = mastery(q);
  const log = q.review_log || [];
  return <article className="question-card" data-id={q.id} style={core ? { borderLeft: '3px solid #e67e22' } : undefined} {...dragProps}><div className="card-img-wrap" role="button" tabIndex={0} onClick={preview} onKeyDown={e => { if (e.key === 'Enter') preview(); }}><img src={q.image_data} alt={core ? '重要例题' : '错题'} loading="lazy" draggable={false} /><span className="drag-handle question-card-handle">⠿</span></div><div className="card-info"><div className="question-source"><span>来源</span><SourceSelect sources={sources} value={q.source_id} disabled={busy} onChange={source_id => update({ source_id })} /></div>{!core && <><div className="card-date">首次上传：{q.first_upload_date}</div>{q.file_name && <div className="card-date">{q.file_name}</div>}</>}<div className={`answer-section ${revealed ? 'revealed' : ''}`} onClick={() => setRevealed(true)}><div className="answer-title">答案 <button className="answer-edit-btn" onClick={e => { e.stopPropagation(); editAnswer(); }}>编辑</button></div><NoteInput aria-label="文字答案" placeholder="填写文字答案…" value={q.answer} disabled={busy} onSave={answer => update({ answer })} />{q.answer_image && <img className="answer-image" src={q.answer_image} alt="答案图片" onClick={e => { e.stopPropagation(); if (revealed) previewImage(q.answer_image); else setRevealed(true); }} />}{!revealed && <button className="answer-mask" onClick={() => setRevealed(true)}>点击显示答案</button>}</div><CardNote question={q} busy={busy} save={note => update({ note })} />{core && <div className="question-core-tag">{q.tag || '未分类'} <button onClick={editTag} title="修改题型标签">编辑</button></div>}<div className="progress-section">{m.mastered && <span className="card-badge">✓ 已掌握</span>}<div className="progress-header"><span className="review-label">连续答对 {m.streak} / 5（共答 {m.correct + m.wrong} 次）</span></div><div className="progress-bar-wrap"><div className={`progress-bar-fill ${m.mastered ? 'full' : ''}`} style={{ width: `${Math.min(m.streak / 5 * 100, 100)}%` }} /></div><div className="review-dates">{log.slice(-8).reverse().map((entry, index) => <span key={log.length - 1 - index} className={`review-date-tag ${entry.result === 'correct' ? 'tag-correct' : 'tag-wrong'}`}>{entry.date} {entry.result === 'correct' ? '✓' : '✗'}<button disabled={busy} title="删除这条记录" onClick={() => removeLog(log.length - 1 - index)}>×</button></span>)}</div></div><div className="card-actions"><button className="btn-correct" disabled={busy} onClick={() => record(true)}>答对了</button><button className="btn-wrong" disabled={busy} onClick={() => record(false)}>还不会</button><button className="btn-delete" disabled={busy} onClick={remove}>删除</button><button className="btn-delete" disabled={busy} title="转移题目" onClick={move}>↗</button><button className="btn-delete" disabled={busy} onClick={convert}>{core ? '转为普通题' : '转为例题'}</button></div></div></article>;
}

export function ImagePreview({ state, questions, busy, onClose, record, update }) {
  const [index, setIndex] = useState(state.index || 0);
  const [answerVisible, setAnswerVisible] = useState(false);

  const touch = useRef(null);
  const closeButton = useRef(null);
  const q = state.ids ? questions.find(item => item.id === state.ids[index]) : null;
  const m = q ? mastery(q) : null;
  const addedAt = q?.first_upload_date || q?.created_at;
  function navigate(direction) {
    if (busy || !state.ids) return;
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
  return <div className="img-preview-overlay show" role="dialog" aria-modal="true" aria-label="图片预览" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}><div className="img-preview-header"><div className="preview-heading"><span className="preview-mode">{state.ids ? '专注复习' : '图片预览'}</span><strong>{state.ids ? `${state.core ? '重要例题' : '错题'} · ${index + 1} / ${state.ids.length}` : '查看图片'}</strong></div><div className="preview-header-end"><span className="preview-keyboard-hint">← → 切题 · Esc 退出</span><button ref={closeButton} disabled={busy} onClick={onClose} aria-label="关闭图片预览">关闭 ×</button></div></div><div className={`preview-body ${q ? '' : 'preview-image-only'}`}><div className="preview-canvas"><div className="img-preview-stage" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }} onTouchStart={e => { touch.current = e.touches.length === 1 && (!window.visualViewport || window.visualViewport.scale <= 1) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }} onTouchMove={e => { if (touch.current && (e.touches.length !== 1 || Math.abs(e.touches[0].clientY - touch.current.y) > 24)) touch.current = null; }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={e => { const start = touch.current; touch.current = null; if (!start || e.touches.length || e.changedTouches.length !== 1) return; const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y; if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) navigate(dx < 0 ? 1 : -1); }}><img src={q?.image_data || state.src} alt="图片预览" draggable={false} /></div>{q && <div className="preview-navigation"><button disabled={busy || index === 0} onClick={() => navigate(-1)}>← 上一题</button><span>{index + 1} <span>/ {state.ids.length}</span></span><button disabled={busy || index === state.ids.length - 1} onClick={() => navigate(1)}>下一题 →</button></div>}</div>{q && <aside className="preview-sidebar"><p className="preview-eyebrow">添加时间：{addedAt ? <time dateTime={addedAt}>{q.first_upload_date || new Date(addedAt).toLocaleString('zh-CN', { hour12: false })}</time> : '未记录'}</p><div className="preview-answer-heading"><div><span className="preview-eyebrow">先思考，再核对</span><h2>答案与解析</h2></div><button disabled={busy} aria-expanded={answerVisible} aria-controls="preview-answer" onClick={() => setAnswerVisible(!answerVisible)}>{answerVisible ? '收起答案' : '查看答案'}</button></div>{!answerVisible && <div className="preview-answer-empty"><span aria-hidden="true">?</span><strong>给自己一点思考空间</strong><p>完成作答后，点击「查看答案」核对思路。</p></div>}<section id="preview-answer" className="img-preview-answer" hidden={!answerVisible} aria-label="题目答案"><NoteInput key={q.id} aria-label="文字答案" placeholder="填写文字答案…" value={q.answer} disabled={busy} onSave={answer => update(q, { answer })} />{q.answer_image && <img src={q.answer_image} alt="答案图片" />}</section><div className="img-preview-controls"><div className="preview-progress-heading"><strong>掌握进度</strong><span className={m.mastered ? 'is-mastered' : ''}>{m.mastered ? '已掌握' : `连续答对 ${m.streak} / 5`}</span></div><progress max={5} value={Math.min(m.streak, 5)} aria-label="连续答对进度" /><div className="preview-review-status" aria-live="polite">答对 {m.correct} 次 · 答错 {m.wrong} 次{busy ? ' · 保存中…' : ''}</div><div className="img-preview-actions"><button className="preview-wrong" disabled={busy} onClick={() => record(q, false)}>× 还不会</button><button className="preview-correct" disabled={busy} onClick={() => record(q, true)}>✓ 答对了</button></div><p className="preview-review-hint">连续答对 5 次，标记为已掌握</p></div></aside>}</div></div>;
}

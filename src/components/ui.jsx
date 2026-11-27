import { useEffect, useRef, useState } from 'react';

export function NoteInput({ value = '', onChange, onSave, disabled, className = '', placeholder = '备注…', ...props }) {
  const [text, setText] = useState(value ?? '');
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  const saving = useRef(false);
  const controlled = Boolean(onChange);
  const content = controlled ? value ?? '' : text;
  useEffect(() => { setText(value ?? ''); setFailed(false); }, [value]);
  useEffect(() => {
    const element = ref.current;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${Math.max(32, element.scrollHeight + 2)}px`;
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [content]);
  return <><textarea {...props} ref={ref} rows={1} className={`review-note ${className}`} placeholder={placeholder} value={content} disabled={disabled} onChange={event => {
    setFailed(false);
    if (controlled) onChange(event);
    else setText(event.target.value);
  }} onBlur={async () => {
    if (!onSave || content === (value ?? '') || saving.current) return;
    saving.current = true;
    try { setFailed(await onSave(content) === false); }
    catch { setFailed(true); }
    finally { saving.current = false; }
  }} />{failed && <small role="alert">保存失败，内容已保留，离开输入框时重试。</small>}</>;
}

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...ref.current.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    const node = ref.current;
    node.addEventListener('keydown', keydown);
    return () => { node.removeEventListener('keydown', keydown); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  return <div className="modal-overlay show" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal react-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="react-modal-heading"><h3>{title}</h3><button type="button" onClick={onClose} aria-label="关闭">×</button></div>
      {children}
    </div>
  </div>;
}

export function Field({ label, children }) {
  return <label className="form-group react-field"><span>{label}</span>{children}</label>;
}

export function MathText({ text, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    let cancelled = false;
    const typeset = () => {
      if (!cancelled && window.MathJax?.typesetPromise) window.MathJax.typesetPromise([node]).catch(() => {});
    };
    if (window.MathJax?.startup?.promise) window.MathJax.startup.promise.then(typeset);
    else typeset();
    return () => { cancelled = true; window.MathJax?.typesetClear?.([node]); };
  }, [text]);
  return <div className={className} ref={ref} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</div>;
}

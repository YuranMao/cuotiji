import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
const QuestionWorkspace = lazy(() => import('./features/questions/QuestionWorkspace'));
const ReviewWorkspace = lazy(() => import('./features/review/ReviewWorkspace'));
const PlannerWorkspace = lazy(() => import('./features/planner/PlannerWorkspace'));
import './styles/legacy.css';
import './styles/app.css';

const tabs = [['cuoti', '错题集'], ['ebb', '遗忘表'], ['timeline', '进度表']];

export default function App() {
  const [tab, setTab] = useState('cuoti');
  const [message, setMessage] = useState('');
  const timer = useRef();
  const notify = useCallback(message => {
    setMessage(String(message));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className={`app-layout ${tab === 'cuoti' ? '' : 'not-cuoti'}`}>
    <nav className="tab-nav" aria-label="业务导航">
      {tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); if (id === 'cuoti') window.dispatchEvent(new Event('cuoti:home')); }}>{label}</button>)}
    </nav>
    <Suspense fallback={<p className="question-hint" role="status">正在加载模块…</p>}>
    <div className="workspace-host" hidden={tab !== 'cuoti'}><QuestionWorkspace notify={notify} /></div>
    <div className="workspace-host" hidden={tab !== 'ebb'}>{tab === 'ebb' && <ReviewWorkspace notify={notify} />}</div>
    <div className="workspace-host" hidden={tab !== 'timeline'}>{tab === 'timeline' && <PlannerWorkspace notify={notify} />}</div>
    </Suspense>
    <div className={`toast ${message ? 'show' : ''}`} role="status" aria-live="polite">{message}</div>
  </div>;
}

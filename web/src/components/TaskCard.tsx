import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Gift } from './Icons';

interface TaskState { played: number; goal: number; reward: number; claimed: boolean }

/** Mission du jour (accueil) : 10 parties avec mise → 10 DH, à réclamer une fois par jour. */
export function TaskCard() {
  const { user, refresh } = useAuth();
  const [task, setTask] = useState<TaskState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user) return;
    api.get<TaskState>('/api/tasks').then(setTask, () => setTask(null));
  }, [user?.id, user?.balance]);

  const claim = async () => {
    setBusy(true);
    setMsg('');
    try {
      setTask(await api.post<TaskState>('/api/tasks/claim'));
      await refresh();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const goal = task?.goal ?? 10;
  const reward = task?.reward ?? 10;
  const played = task?.played ?? 0;
  const done = played >= goal;
  return (
    <div data-testid="task-card" style={{ padding: 18, borderRadius: 22, background: 'linear-gradient(120deg, #3B1F6E, #24124A)', border: '1px solid rgba(242,178,50,0.35)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Gift size={44} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#FFC83D' }}>مهمة اليوم</span>
          <span style={{ fontWeight: 800 }}>العب {goal} مباريات بالمال الحقيقي واربح {reward} دراهم</span>
        </span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={played} style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
        <div style={{ width: `${(played / goal) * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#FFDA6B,#F2B232)', transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 13, color: '#DCD6FF' }}>
          {task?.claimed ? 'حصلت على المكافأة، مهمة جديدة غدًا' : <><b dir="ltr">{played}/{goal}</b> مباريات برهان اليوم</>}
        </span>
        {!user ? (
          <Link to="/register" className="pb-btn pb-gold pb-sm">سجّل وابدأ</Link>
        ) : task?.claimed ? (
          <span style={{ fontWeight: 800, color: '#4ADE80' }}>✓ +{reward}</span>
        ) : (
          <button type="button" className="pb-btn pb-gold pb-sm" disabled={!done || busy} onClick={claim} data-testid="task-claim">
            {done ? `اربح ${reward} دراهم` : 'العب الآن'}
          </button>
        )}
      </div>
      {msg && <span role="alert" className="field-error">{msg}</span>}
      <span style={{ fontSize: 11, color: '#A9A3B5' }}>المباريات برهان فقط (من 5 دراهم)، دون التدريب. تتجدد المهمة كل يوم عند منتصف الليل.</span>
    </div>
  );
}

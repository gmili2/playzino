import { COLOR_HEX } from '../lib/format';
import type { Room } from '../lib/types';
import { Credits, StatusChip } from './ui';

const BANNERS: Record<string, string> = {
  WAITING: 'linear-gradient(135deg, #3B2A8F, #1B1A4F)',
  PLAYING: 'linear-gradient(135deg, #7A5410, #2A1F3F)',
  FULL: 'linear-gradient(135deg, #0E5C4A, #15283F)'
};

export function RoomCard({ room, onJoin, busy, mine }: { room: Room; onJoin: () => void; busy?: boolean; mine?: boolean }) {
  const free = room.maxPlayers - room.players.length;
  const joinable = room.status === 'WAITING' && free > 0;
  const host = room.players.find((p) => p.userId === room.hostId)?.username ?? '—';
  return (
    <article className="pb-card" data-testid="room-card" style={{ borderRadius: 20, overflow: 'hidden', background: '#14153A', border: '1px solid rgba(140,130,255,0.16)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 96, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: BANNERS[room.status] ?? BANNERS.FULL }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 30px)', gap: 6 }}>
          {Array.from({ length: room.maxPlayers }, (_, seat) => {
            const p = room.players.find((x) => x.seat === seat);
            return (
              <span key={seat} title={p?.username} style={p
                ? { width: 30, height: 30, borderRadius: '50%', background: COLOR_HEX[p.color], boxShadow: '0 0 0 2px rgba(255,255,255,0.85)' }
                : { width: 30, height: 30, borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.45)' }} />
            );
          })}
        </div>
        <span style={{ background: 'rgba(10,11,30,0.75)', borderRadius: 999 }}><StatusChip status={room.status === 'WAITING' && free === 0 ? 'FULL' : room.status} /></span>
      </div>
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{room.name}</span>
          <span style={{ fontSize: 12, color: '#A6A8D6' }}><span dir="ltr">{room.code ?? ''}</span> · المضيف {host}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#C9CAF0', display: 'flex', gap: 10, alignItems: 'center' }}>
            {room.players.length}/{room.maxPlayers} لاعبين
            {room.stake > 0 ? <Credits value={room.stake} size={13} /> : <span style={{ color: '#4ADE80' }}>مجانية</span>}
          </span>
          {mine ? (
            <a className="pb-btn pb-ghost pb-sm" href={'/room/' + room.id}>العودة</a>
          ) : joinable ? (
            <button type="button" className="pb-btn pb-violet pb-sm" onClick={onJoin} disabled={busy} aria-label={'انضم إلى ' + room.name}>انضم</button>
          ) : (
            <button type="button" className="pb-btn pb-ghost pb-sm" disabled>{room.status === 'PLAYING' ? 'جارية' : 'مكتملة'}</button>
          )}
        </div>
      </div>
    </article>
  );
}

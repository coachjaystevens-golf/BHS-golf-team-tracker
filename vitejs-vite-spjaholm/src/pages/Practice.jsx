import { useNavigate } from 'react-router-dom';

// One tap-friendly hub for everything practice-related. The 100-yard
// challenge and putting drills used to live in the "More" sheet where
// players never found them — now the whole practice green is one tab.
const TILES = [
  {
    to: '/drills',
    emoji: '📋',
    title: 'Drill Library',
    desc: 'Browse drills and how-to guides. Flag what you\'re working on so your coach can see.',
  },
  {
    to: '/challenge',
    emoji: '🎯',
    title: '100-Yard Challenge',
    desc: 'GPS-guided approach drill — every hole from 100 yards, target 2. Live leaderboard.',
  },
  {
    to: '/putting',
    emoji: '⛳',
    title: 'Putting Drills',
    desc: 'Clock drill, lag ladder, pressure gate, distance control — scored, with season bests.',
  },
];

export default function Practice() {
  const navigate = useNavigate();
  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Practice</p>
        <h2 style={{ marginBottom: 0 }}>What are you working on?</h2>
      </div>
      {TILES.map((t) => (
        <div
          key={t.to}
          className="card"
          onClick={() => navigate(t.to)}
          style={{ cursor: 'pointer', padding: 16 }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{t.emoji}</span>
            <div>
              <strong style={{ fontSize: 17 }}>{t.title}</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>{t.desc}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

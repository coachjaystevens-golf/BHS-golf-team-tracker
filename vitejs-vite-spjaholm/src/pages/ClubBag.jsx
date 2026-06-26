import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

// The full menu of clubs a player might carry, in bag order.
// `club` is the stored key; `label` is what the player sees.
const ALL_CLUBS = [
  { club: 'Driver', label: 'Driver' },
  { club: '3w', label: '3 wood' },
  { club: '5w', label: '5 wood' },
  { club: '3h', label: '3 hybrid' },
  { club: '4h', label: '4 hybrid' },
  { club: '3i', label: '3 iron' },
  { club: '4i', label: '4 iron' },
  { club: '5i', label: '5 iron' },
  { club: '6i', label: '6 iron' },
  { club: '7i', label: '7 iron' },
  { club: '8i', label: '8 iron' },
  { club: '9i', label: '9 iron' },
  { club: 'PW', label: 'Pitching wedge' },
  { club: 'GW', label: 'Gap wedge' },
  { club: 'SW', label: 'Sand wedge' },
  { club: 'LW', label: 'Lob wedge' },
  { club: 'Putter', label: 'Putter' },
];

// A reasonable starter set, pre-checked for first-time players.
const DEFAULT_SET = new Set(['Driver', '5w', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW', 'Putter']);

export default function ClubBag() {
  const { user } = useAuth();
  const [playerId, setPlayerId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [existing, setExisting] = useState({}); // club -> { avg_yards, shot_count }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!p) { setLoading(false); return; }
      setPlayerId(p.id);

      const { data: clubs } = await supabase
        .from('player_clubs')
        .select('club, avg_yards, shot_count')
        .eq('player_id', p.id);

      if (clubs && clubs.length > 0) {
        const sel = new Set();
        const ex = {};
        clubs.forEach((c) => { sel.add(c.club); ex[c.club] = c; });
        setSelected(sel);
        setExisting(ex);
      } else {
        // first time: pre-select a sensible starter set
        setSelected(new Set(DEFAULT_SET));
      }
      setLoading(false);
    })();
  }, [user.id]);

  function toggle(club) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(club)) next.delete(club);
      else next.add(club);
      return next;
    });
  }

  async function save() {
    if (!playerId) return;
    setSaving(true);
    setError('');
    setNote('');

    // Determine adds and removes vs. what's already stored.
    const current = new Set(Object.keys(existing));
    const toAdd = [...selected].filter((c) => !current.has(c));
    const toRemove = [...current].filter((c) => !selected.has(c));

    // Insert newly chosen clubs (preserve bag order via sort_order).
    if (toAdd.length > 0) {
      const rows = toAdd.map((club) => {
        const meta = ALL_CLUBS.find((x) => x.club === club);
        const order = ALL_CLUBS.findIndex((x) => x.club === club);
        return {
          player_id: playerId,
          club,
          label: meta?.label ?? club,
          sort_order: order,
        };
      });
      const { error: insErr } = await supabase.from('player_clubs').insert(rows);
      if (insErr) { setError(insErr.message); setSaving(false); return; }
    }

    // Remove deselected clubs.
    if (toRemove.length > 0) {
      const { error: delErr } = await supabase
        .from('player_clubs')
        .delete()
        .eq('player_id', playerId)
        .in('club', toRemove);
      if (delErr) { setError(delErr.message); setSaving(false); return; }
    }

    // Refresh existing map
    const { data: clubs } = await supabase
      .from('player_clubs')
      .select('club, avg_yards, shot_count')
      .eq('player_id', playerId);
    const ex = {};
    (clubs ?? []).forEach((c) => { ex[c.club] = c; });
    setExisting(ex);

    setSaving(false);
    setNote('Your bag is saved.');
    setTimeout(() => setNote(''), 2000);
  }

  if (loading) return <div className="content"><p className="muted">Loading…</p></div>;

  if (!playerId) {
    return (
      <div className="content">
        <div className="card">
          <h2>My clubs</h2>
          <p className="muted">
            You aren't linked to the roster yet. Once your coach adds you, you can
            set up your bag here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Caddie setup</p>
        <h2>My clubs</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Pick the clubs you carry. During practice rounds, the Caddie learns how
          far you hit each one and suggests a club for your distance. You can
          change this anytime — your numbers update as you play.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
      {note && <div className="success">{note}</div>}

      <div className="card">
        {ALL_CLUBS.map((c) => {
          const on = selected.has(c.club);
          const ex = existing[c.club];
          return (
            <div
              key={c.club}
              className="row-between"
              style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
              onClick={() => toggle(c.club)}
            >
              <div>
                <strong style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>{c.label}</strong>
                {ex && ex.avg_yards != null && (
                  <div className="muted" style={{ fontSize: 12 }}>
                    learned: ~{Math.round(ex.avg_yards)} yds ({ex.shot_count} shots)
                  </div>
                )}
              </div>
              <div
                style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: on ? 'var(--green-500)' : 'var(--white)',
                  border: on ? 'none' : '1.5px solid var(--line)',
                  color: 'var(--white)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 16,
                }}
              >
                {on ? '✓' : ''}
              </div>
            </div>
          );
        })}
        <div className="spacer" />
        <button onClick={save} disabled={saving || selected.size === 0}>
          {saving ? 'Saving…' : 'Save my bag'}
        </button>
      </div>
    </div>
  );
}

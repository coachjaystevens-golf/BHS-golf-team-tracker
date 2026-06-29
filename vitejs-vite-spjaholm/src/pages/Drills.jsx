import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';

const CATEGORY_LABELS = {
  putting: 'Putting',
  chipping: 'Chipping',
  pitching: 'Pitching',
  bunker: 'Bunker',
  full_swing: 'Full swing',
  course_management: 'Course management',
};

export default function Drills() {
  const { user } = useAuth();
  const [playerId, setPlayerId] = useState(null);
  const [items, setItems] = useState([]);
  const [workingOn, setWorkingOn] = useState(new Set()); // drill_ids toggled on
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | drill | reference
  const [catFilter, setCatFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // the library (everyone can read)
      const { data: lib, error: le } = await supabase
        .from('drill_library')
        .select('id, item_type, skill_category, title, summary, instructions, difficulty')
        .eq('is_active', true)
        .order('skill_category')
        .order('sort_order');
      if (le) { setError(le.message); setLoading(false); return; }
      setItems(lib ?? []);

      // this player's toggles
      const { data: p } = await supabase
        .from('players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (p) {
        setPlayerId(p.id);
        const { data: pd } = await supabase
          .from('player_drills')
          .select('drill_id')
          .eq('player_id', p.id);
        setWorkingOn(new Set((pd ?? []).map((r) => r.drill_id)));
      }

      setLoading(false);
    })();
  }, [user.id]);

  async function toggle(drillId) {
    if (!playerId) {
      setError('You are not linked to the roster yet. Ask your coach to add you.');
      return;
    }
    const isOn = workingOn.has(drillId);

    // optimistic update
    setWorkingOn((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(drillId); else next.add(drillId);
      return next;
    });

    if (isOn) {
      const { error } = await supabase
        .from('player_drills')
        .delete()
        .eq('player_id', playerId)
        .eq('drill_id', drillId);
      if (error) { // revert on failure
        setWorkingOn((prev) => new Set(prev).add(drillId));
        setError(error.message);
      }
    } else {
      const { error } = await supabase
        .from('player_drills')
        .insert({ player_id: playerId, drill_id: drillId });
      if (error) {
        setWorkingOn((prev) => { const n = new Set(prev); n.delete(drillId); return n; });
        setError(error.message);
      }
    }
  }

  if (loading) return <div className="content"><p className="muted">Loading drills…</p></div>;

  const visible = items.filter((it) => {
    if (typeFilter !== 'all' && it.item_type !== typeFilter) return false;
    if (catFilter !== 'all' && it.skill_category !== catFilter) return false;
    return true;
  });

  // categories present in the library, for the filter row
  const cats = [...new Set(items.map((i) => i.skill_category))];

  const workingCount = workingOn.size;

  const FilterBtn = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={active ? '' : 'secondary'}
      style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px' }}
    >{children}</button>
  );

  return (
    <div className="content">
      <div className="card">
        <h2>Practice drills</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Browse drills and how-to guides. Tap "Working on this" to flag what
          you're practicing — your coach can see your focus areas.
        </p>
        {workingCount > 0 && (
          <p className="eyebrow" style={{ margin: 0 }}>
            ⛳ You're working on {workingCount} {workingCount === 1 ? 'thing' : 'things'}
          </p>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {/* type filter */}
      <div className="card" style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <FilterBtn active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>All</FilterBtn>
          <FilterBtn active={typeFilter === 'drill'} onClick={() => setTypeFilter('drill')}>Drills</FilterBtn>
          <FilterBtn active={typeFilter === 'reference'} onClick={() => setTypeFilter('reference')}>How-to</FilterBtn>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterBtn active={catFilter === 'all'} onClick={() => setCatFilter('all')}>All areas</FilterBtn>
          {cats.map((c) => (
            <FilterBtn key={c} active={catFilter === c} onClick={() => setCatFilter(c)}>
              {CATEGORY_LABELS[c] ?? c}
            </FilterBtn>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing matches that filter.</p></div>
      )}

      {visible.map((it) => {
        const isOn = workingOn.has(it.id);
        const isOpen = expandedId === it.id;
        return (
          <div key={it.id} className="card" style={{ padding: 14 }}>
            <div
              className="row-between"
              style={{ cursor: 'pointer' }}
              onClick={() => setExpandedId(isOpen ? null : it.id)}
            >
              <div style={{ flex: 1 }}>
                <span className="hole-num">{isOpen ? '▾ ' : '▸ '}{it.title}</span>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  {CATEGORY_LABELS[it.skill_category] ?? it.skill_category}
                  {it.item_type === 'reference' && ' · how-to'}
                  {it.difficulty && ` · ${it.difficulty}`}
                </div>
                {!isOpen && it.summary && (
                  <div style={{ fontSize: 14, marginTop: 4 }}>{it.summary}</div>
                )}
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <p style={{ fontSize: 15, lineHeight: 1.5 }}>{it.instructions}</p>
              </div>
            )}

            {/* only drills get the working-on toggle; reference cards are read-only */}
            {it.item_type === 'drill' && (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => toggle(it.id)}
                  style={{
                    width: 'auto', minHeight: 38, fontSize: 13, padding: '0 14px',
                    background: isOn ? 'var(--green-500)' : 'var(--white)',
                    color: isOn ? 'var(--white)' : 'var(--green-700)',
                    border: isOn ? 'none' : '1.5px solid var(--green-500)',
                  }}
                >
                  {isOn ? 'Working on this ✓' : 'Working on this'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

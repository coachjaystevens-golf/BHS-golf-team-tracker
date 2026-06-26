import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../AuthContext.jsx';
import { yardsBetween, recencyWeightedAvg, MIN_SHOTS } from '../lib/caddieMath.js';

export default function PracticeRound() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = useState(null);
  const [clubs, setClubs] = useState([]);          // player's bag
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // live GPS (same proven pattern as Caddie/Capture)
  const [pos, setPos] = useState(null);
  const [gpsErr, setGpsErr] = useState('');
  const watchId = useRef(null);

  // the shot currently "open" — its club and start position, waiting
  // for the next tap (or "ball holed") to close out its distance.
  const [openShot, setOpenShot] = useState(null);   // { club, label, lat, lng }
  const [hole, setHole] = useState(1);
  const [lastMeasured, setLastMeasured] = useState(null); // { label, yards }
  const [sessionShots, setSessionShots] = useState([]);   // this session's measured shots

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase
        .from('players').select('id').eq('user_id', user.id).maybeSingle();
      if (!p) { setLoading(false); return; }
      setPlayerId(p.id);
      const { data: bag } = await supabase
        .from('player_clubs')
        .select('club, label, sort_order, avg_yards, shot_count')
        .eq('player_id', p.id)
        .order('sort_order');
      setClubs(bag ?? []);
      setLoading(false);
    })();
  }, [user.id]);

  useEffect(() => {
    if (!navigator.geolocation) { setGpsErr('This device has no GPS.'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setGpsErr(''); },
      (e) => setGpsErr(e.message || 'Location unavailable. Allow location access and try outside.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); };
  }, []);

  // Recompute and persist a club's learned average after a new shot.
  async function updateClubAverage(club) {
    // pull recent measured shots for this club (oldest->newest for weighting)
    const { data: shots } = await supabase
      .from('club_shots')
      .select('yards, created_at')
      .eq('player_id', playerId)
      .eq('club', club)
      .not('yards', 'is', null)
      .order('created_at', { ascending: true })
      .limit(40); // cap history; recency weighting favors recent anyway

    const yards = (shots ?? []).map((s) => Number(s.yards));
    const { avg, count } = recencyWeightedAvg(yards);
    await supabase
      .from('player_clubs')
      .update({ avg_yards: avg, shot_count: yards.length, updated_at: new Date().toISOString() })
      .eq('player_id', playerId)
      .eq('club', club);

    // reflect in local bag state
    setClubs((prev) => prev.map((c) => c.club === club ? { ...c, avg_yards: avg, shot_count: yards.length } : c));
  }

  // Tap a club: this records a new shot start, and CLOSES the previous
  // open shot by measuring distance from its start to here.
  async function tapClub(c) {
    setError('');
    if (!pos) { setError('Waiting for GPS. Give it a moment, outside if you can.'); return; }

    // close the previous open shot, if any
    if (openShot) {
      const yards = yardsBetween(openShot.lat, openShot.lng, pos.lat, pos.lng);
      if (yards != null && yards >= 3) {
        // store the completed shot
        await supabase.from('club_shots').insert({
          player_id: playerId,
          round_id: null,
          club: openShot.club,
          hole_number: hole,
          start_lat: openShot.lat, start_lng: openShot.lng,
          end_lat: pos.lat, end_lng: pos.lng,
          yards: Math.round(yards),
          counted: true,
        });
        setLastMeasured({ label: openShot.label, yards: Math.round(yards) });
        setSessionShots((prev) => [...prev, { label: openShot.label, yards: Math.round(yards) }]);
        await updateClubAverage(openShot.club);
      }
    }

    // open a new shot from current position
    setOpenShot({ club: c.club, label: c.label, lat: pos.lat, lng: pos.lng });
  }

  // Ball holed / end of hole: close the open shot to the current spot,
  // then advance hole and clear the open shot.
  async function holeOut() {
    if (openShot && pos) {
      const yards = yardsBetween(openShot.lat, openShot.lng, pos.lat, pos.lng);
      if (yards != null && yards >= 3) {
        await supabase.from('club_shots').insert({
          player_id: playerId, round_id: null, club: openShot.club,
          hole_number: hole, start_lat: openShot.lat, start_lng: openShot.lng,
          end_lat: pos.lat, end_lng: pos.lng, yards: Math.round(yards), counted: true,
        });
        setLastMeasured({ label: openShot.label, yards: Math.round(yards) });
        setSessionShots((prev) => [...prev, { label: openShot.label, yards: Math.round(yards) }]);
        await updateClubAverage(openShot.club);
      }
    }
    setOpenShot(null);
    setHole((h) => Math.min(18, h + 1));
  }

  if (loading) return <div className="content"><p className="muted">Loading…</p></div>;

  if (!playerId) {
    return (
      <div className="content">
        <div className="card">
          <h2>Practice mode</h2>
          <p className="muted">You aren't linked to the roster yet. Ask your coach to add you.</p>
        </div>
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="content">
        <div className="card">
          <h2>Practice mode</h2>
          <p className="muted" style={{ marginBottom: 8 }}>
            First, set up the clubs you carry. Then come back here to log shots
            during a practice round.
          </p>
          <button onClick={() => navigate('/my-clubs')}>Set up my clubs</button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <div className="card">
        <p className="eyebrow">Practice mode</p>
        <h2>Log my shots</h2>
        <p className="muted" style={{ marginBottom: 8 }}>
          Stand where your ball is, tap the club you're about to hit. Tap your
          next club at the next ball — the app measures how far the last shot
          went. Over time it learns your distances. Practice rounds only.
        </p>
      </div>

      {/* GPS status */}
      <div className="card" style={{ background: pos ? 'var(--green-100)' : '#f6dcd9' }}>
        {gpsErr ? (
          <p style={{ color: 'var(--flag)', margin: 0 }}>{gpsErr}</p>
        ) : pos ? (
          <p className="muted" style={{ margin: 0 }}>GPS live · ±{Math.round(pos.acc)} m</p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Getting your location…</p>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {/* current state */}
      <div className="card">
        <div className="row-between">
          <strong>Hole {hole}</strong>
          <button className="secondary" style={{ width: 'auto', minHeight: 34, fontSize: 13, padding: '0 12px' }} onClick={holeOut}>
            Ball holed → next hole
          </button>
        </div>
        {openShot ? (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            In progress: <strong>{openShot.label}</strong> — walk to your ball and tap your next club to measure it.
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Tap the club you're hitting to start.
          </p>
        )}
        {lastMeasured && (
          <div className="success" style={{ marginTop: 8 }}>
            Measured: {lastMeasured.label} went {lastMeasured.yards} yds
          </div>
        )}
      </div>

      {/* club buttons */}
      <div className="card">
        <p className="eyebrow">Tap the club you're hitting</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {clubs.map((c) => {
            const learned = c.avg_yards != null && c.shot_count >= MIN_SHOTS;
            const isOpen = openShot?.club === c.club;
            return (
              <button
                key={c.club}
                className={isOpen ? '' : 'secondary'}
                style={{ width: 'auto', flex: '1 1 28%', minHeight: 54, fontSize: 13, padding: '4px 6px', flexDirection: 'column' }}
                onClick={() => tapClub(c)}
                disabled={!pos}
              >
                <span>{c.label}</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {learned ? `~${Math.round(c.avg_yards)} yds`
                    : c.shot_count > 0 ? `${MIN_SHOTS - c.shot_count > 0 ? MIN_SHOTS - c.shot_count : 0} more`
                    : 'learning'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* this session */}
      {sessionShots.length > 0 && (
        <div className="card">
          <p className="eyebrow">This session ({sessionShots.length})</p>
          {sessionShots.slice().reverse().map((s, i) => (
            <div key={i} className="row-between" style={{ padding: '4px 0' }}>
              <span>{s.label}</span>
              <span className="muted">{s.yards} yds</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

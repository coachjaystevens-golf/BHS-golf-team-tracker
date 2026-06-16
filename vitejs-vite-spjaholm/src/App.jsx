import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import JoinTeam from './pages/JoinTeam.jsx';
import Rounds from './pages/Rounds.jsx';
import EnterScores from './pages/EnterScores.jsx';
import MyStats from './pages/MyStats.jsx';
import CoachDashboard from './pages/CoachDashboard.jsx';

function Shell() {
  const { user, loading, isCoach, isLinked, signOut } = useAuth();

  if (loading) {
    return (
      <div className="app-shell">
        <div className="content center">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <Login />
      </div>
    );
  }

  // logged in, but a player who hasn't claimed a roster spot yet
  if (!isLinked) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <h1>Golf Team Tracker</h1>
        </div>
        <JoinTeam />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Golf Team Tracker</h1>
        <span className="role-tag">{isCoach ? 'Coach' : 'Player'}</span>
      </div>

      <Routes>
        <Route path="/" element={<Rounds />} />
        <Route path="/round/:roundId" element={<EnterScores />} />
        <Route path="/stats" element={<MyStats />} />
        <Route
          path="/coach"
          element={isCoach ? <CoachDashboard /> : <Navigate to="/" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      <nav className="bottom-nav">
        <NavLink to="/" end>Rounds</NavLink>
        <NavLink to="/stats">My Stats</NavLink>
        {isCoach && <NavLink to="/coach">Coach</NavLink>}
        <a onClick={signOut} style={{ cursor: 'pointer' }}>Sign out</a>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
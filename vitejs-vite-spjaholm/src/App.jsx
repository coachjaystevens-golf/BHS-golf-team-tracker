import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import JoinTeam from './pages/JoinTeam.jsx';
import Rounds from './pages/Rounds.jsx';
import EnterScores from './pages/EnterScores.jsx';
import MyStats from './pages/MyStats.jsx';
import CoachDashboard from './pages/CoachDashboard.jsx';
import CaptureCourse from './pages/CaptureCourse.jsx';
import CaptureHazards from './pages/CaptureHazards.jsx';
import LiveRound from './pages/LiveRound.jsx';
import Caddie from './pages/Caddie.jsx';
import AddCourse from './pages/AddCourse.jsx';
import ClubBag from './pages/ClubBag.jsx';
import PracticeRound from './pages/PracticeRound.jsx';
import Drills from './pages/Drills.jsx';
function Shell() {
  const { user, loading, isCoach, isLinked, isCaptureHelper, signOut, recovery } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  if (loading) {
    return (
      <div className="app-shell">
        <div className="content center">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }
  // arriving via a password reset link — show the set-new-password screen
  if (recovery) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <h1>Golf Team Tracker</h1>
        </div>
        <ResetPassword />
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
  const closeMore = () => setMoreOpen(false);
  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Golf Team Tracker</h1>
        <span className="role-tag">{isCoach ? 'Coach' : 'Player'}</span>
      </div>
      <Routes>
        <Route path="/" element={isCoach ? <Navigate to="/coach" /> : <Navigate to="/rounds" />} />
        <Route path="/rounds" element={<Rounds />} />
        <Route path="/round/:roundId" element={<EnterScores />} />
        <Route path="/stats" element={<MyStats />} />
        <Route path="/caddie" element={<Caddie />} />
        <Route path="/my-clubs" element={<ClubBag />} />
        <Route path="/practice" element={<PracticeRound />} />
        <Route path="/drills" element={<Drills />} />
        <Route path="/add-course" element={<AddCourse />} />
        <Route
          path="/coach"
          element={isCoach ? <CoachDashboard /> : <Navigate to="/" />}
        />
        <Route
          path="/live"
          element={isCoach ? <LiveRound /> : <Navigate to="/" />}
        />
        <Route
          path="/capture"
          element={isCaptureHelper ? <CaptureCourse /> : <Navigate to="/" />}
        />
        <Route
          path="/capture-hazards"
          element={isCaptureHelper ? <CaptureHazards /> : <Navigate to="/" />}
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {/* expanded "More" sheet — reuses the bottom-nav look, lifted above
          the bar with a divider tint so it reads as its own row. Inline
          styles keep it self-contained (no App.css change needed). */}
      {moreOpen && (
        <nav
          className="bottom-nav"
          style={{ borderTop: '1px solid var(--line)', background: 'var(--green-100)' }}
        >
          <NavLink to="/add-course" onClick={closeMore}>+ Course</NavLink>
          {isCaptureHelper && <NavLink to="/capture" onClick={closeMore}>Capture</NavLink>}
          {isCaptureHelper && <NavLink to="/capture-hazards" onClick={closeMore}>Hazards</NavLink>}
          {isCoach && <NavLink to="/live" onClick={closeMore}>Live</NavLink>}
          {isCoach && <NavLink to="/coach" onClick={closeMore}>Coach</NavLink>}
          <a onClick={() => { closeMore(); signOut(); }} style={{ cursor: 'pointer' }}>Sign out</a>
        </nav>
      )}

      <nav className="bottom-nav">
        <NavLink to="/rounds" end onClick={closeMore}>Rounds</NavLink>
        <NavLink to="/stats" onClick={closeMore}>My Stats</NavLink>
        <NavLink to="/drills" onClick={closeMore}>Drills</NavLink>
        <NavLink to="/caddie" onClick={closeMore}>Caddie</NavLink>
        <a
          onClick={() => setMoreOpen((v) => !v)}
          style={{ cursor: 'pointer', fontWeight: moreOpen ? 700 : undefined }}
        >
          More {moreOpen ? '▲' : '▾'}
        </a>
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

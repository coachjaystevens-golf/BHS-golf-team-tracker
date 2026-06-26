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
import LiveRound from './pages/LiveRound.jsx';
import Caddie from './pages/Caddie.jsx';
import AddCourse from './pages/AddCourse.jsx';
import ClubBag from './pages/ClubBag.jsx';
function Shell() {
  const { user, loading, isCoach, isLinked, isCaptureHelper, signOut, recovery } = useAuth();
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
        <Route path="/caddie" element={<Caddie />} />
        <Route path="/my-clubs" element={<ClubBag />} />
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
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <nav className="bottom-nav">
        <NavLink to="/" end>Rounds</NavLink>
        <NavLink to="/stats">My Stats</NavLink>
        <NavLink to="/caddie">Caddie</NavLink>
        <NavLink to="/add-course">+ Course</NavLink>
        {isCaptureHelper && <NavLink to="/capture">Capture</NavLink>}
        {isCoach && <NavLink to="/live">Live</NavLink>}
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

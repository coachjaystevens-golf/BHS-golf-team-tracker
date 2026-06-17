import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [playerRow, setPlayerRow] = useState(null);
  const [loading, setLoading] = useState(true);

  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', userId)
      .single();
    setProfile(data ?? null);
  }

  async function loadPlayerRow(userId) {
    const { data } = await supabase
      .from('players')
      .select('id, full_name')
      .eq('user_id', userId)
      .maybeSingle();
    setPlayerRow(data ?? null);
  }

  async function loadSeasons() {
    const { data } = await supabase
      .from('seasons')
      .select('id, name, starts_on, ends_on, is_active')
      .order('starts_on', { ascending: false });
    const list = data ?? [];
    setSeasons(list);
    setSeasonId((current) => {
      if (current && list.some((s) => s.id === current)) return current;
      const active = list.find((s) => s.is_active);
      return active ? active.id : (list[0]?.id ?? '');
    });
  }

  async function loadAll(userId) {
    await Promise.all([loadProfile(userId), loadPlayerRow(userId), loadSeasons()]);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadAll(session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadAll(session.user.id);
      else { setProfile(null); setPlayerRow(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isCoach = profile?.role === 'coach';
  const activeSeason = seasons.find((s) => s.is_active) ?? null;
  const selectedSeason = seasons.find((s) => s.id === seasonId) ?? null;

  const value = {
    user,
    profile,
    playerRow,
    loading,
    isCoach,
    isLinked: isCoach || playerRow !== null,
    refreshLink: () => (user ? loadPlayerRow(user.id) : Promise.resolve()),
    seasons,
    seasonId,
    setSeasonId,
    activeSeason,
    selectedSeason,
    refreshSeasons: loadSeasons,
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) =>
      supabase.auth.signUp({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

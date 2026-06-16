import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [playerRow, setPlayerRow] = useState(null); // this user's roster row, if linked
  const [loading, setLoading] = useState(true);

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

  // load both profile and player-link for a user
  async function loadAll(userId) {
    await Promise.all([loadProfile(userId), loadPlayerRow(userId)]);
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

  const value = {
    user,
    profile,
    playerRow,
    loading,
    isCoach,
    // a player is "linked" if they have a roster row; coaches don't need one
    isLinked: isCoach || playerRow !== null,
    refreshLink: () => (user ? loadPlayerRow(user.id) : Promise.resolve()),
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
import { getRuntimeDataAccess, supabase } from '../supabaseClient';
import { User } from '../../types';
import { MOCK_LOGIN_PROFILES, MOCK_USERS } from '../../data/mockData';
import { StorageKeys } from '../storage';

export interface AuthSession {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const mapSupabaseUserToAppUser = (authUser: any): User => {
  const email = String(authUser.email || '');
  return {
    id: authUser.id,
    email,
    name: authUser.user_metadata?.full_name || email.split('@')[0] || 'Unknown',
    avatarUrl: authUser.user_metadata?.avatar_url,
  };
};

export const authAdapter = {
  async signIn(email: string, password?: string) {
    if (getRuntimeDataAccess() === 'local') {
      const normalizedEmail = email.trim().toLowerCase();
      const user = MOCK_USERS.find(u => u.email.toLowerCase() === normalizedEmail);
      const profile = user ? MOCK_LOGIN_PROFILES.find(p => p.userId === user.id) : null;

      if (!user || !profile) return { user: null, error: 'Demo account not found.' };
      if ((password || '').trim() !== profile.password) {
        return { user: null, error: 'Incorrect sandbox password.' };
      }

      localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
      return { user, error: null };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: password || '',
    });
    if (error) return { user: null, error: error.message };
    return { user: mapSupabaseUserToAppUser(data.user), error: null };
  },

  async signOut() {
    if (getRuntimeDataAccess() === 'server') {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem(StorageKeys.CURRENT_USER);
    }
  },

  async getCurrentUser(): Promise<User | null> {
    if (getRuntimeDataAccess() === 'local') {
      const stored = localStorage.getItem(StorageKeys.CURRENT_USER);
      if (!stored) return null;
      try {
        const parsed = JSON.parse(stored) as User;
        return MOCK_USERS.find(user => user.id === parsed.id) || null;
      } catch {
        localStorage.removeItem(StorageKeys.CURRENT_USER);
        return null;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    return user ? mapSupabaseUserToAppUser(user) : null;
  },
};

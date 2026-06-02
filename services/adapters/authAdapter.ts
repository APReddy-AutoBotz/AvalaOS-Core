import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { User } from '../../types';
import { MOCK_LOGIN_PROFILES, MOCK_USERS } from '../../data/mockData';
import { StorageKeys } from '../storage';

export interface AuthSession {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const mapSupabaseUserToAppUser = (authUser: any): User => {
  const email = authUser.email || '';
  const demoPersona = MOCK_USERS.find(user => user.email.toLowerCase() === email.toLowerCase());
  return {
    ...(demoPersona || {}),
    id: authUser.id,
    email,
    name: authUser.user_metadata?.full_name || demoPersona?.name || email.split('@')[0] || 'Unknown',
    avatarUrl: authUser.user_metadata?.avatar_url || demoPersona?.avatarUrl,
  };
};

export const authAdapter = {
  async signIn(email: string, password?: string) {
    if (!isSupabaseConfigured()) {
      const normalizedEmail = email.trim().toLowerCase();
      const user = MOCK_USERS.find(u => u.email.toLowerCase() === normalizedEmail);
      const profile = user ? MOCK_LOGIN_PROFILES.find(p => p.userId === user.id) : null;

      if (!user || !profile) {
        return { user: null, error: 'Demo account not found. Select a persona or use one of the listed work emails.' };
      }

      if ((password || '').trim() !== profile.password) {
        return { user: null, error: 'Incorrect sandbox password. Select a persona to use its configured sandbox credential.' };
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
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    } else {
      localStorage.removeItem(StorageKeys.CURRENT_USER);
    }
  },

  async getCurrentUser(): Promise<User | null> {
    if (!isSupabaseConfigured()) {
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
    if (!user) return null;

    return mapSupabaseUserToAppUser(user);
  }
};

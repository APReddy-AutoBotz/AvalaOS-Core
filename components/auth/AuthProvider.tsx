import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAdapter } from '../../services/adapters/authAdapter';
import { User } from '../../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const currentUser = await authAdapter.getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error('Runtime authentication boundary unavailable:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const signIn = async (email: string, password?: string) => {
    const { user: newUser, error } = await authAdapter.signIn(email, password);
    if (error) throw new Error(error);
    setUser(newUser);
  };

  const signOut = async () => {
    await authAdapter.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

import { useState, useEffect, createContext, useContext } from 'react';
import { io, Socket } from 'socket.io-client';
import Auth from './pages/Auth';
import ChatApp from './pages/ChatApp';

interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  socket: Socket | null;
}

export const AuthContext = createContext<AuthContextType | null>(null);
export const useAuth = () => useContext(AuthContext)!;

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (token) {
      fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        });
    }
  }, [token]);

  useEffect(() => {
    if (token && user) {
      const s = io({ auth: { token } });
      setSocket(s);
      return () => {
        s.disconnect();
      };
    }
    return undefined;
  }, [token, user]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    socket?.disconnect();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, socket }}>
      {user ? <ChatApp /> : <Auth />}
    </AuthContext.Provider>
  );
}

export default App;

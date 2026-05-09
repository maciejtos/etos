import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();

  // Automatyczne przekierowanie, jeśli użytkownik jest już zalogowany
  useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    try {
      setError('');
      setLoading(true);
      await login(email, password);
      // Przekierowanie obsłuży useEffect powyżej po aktualizacji currentUser
    } catch (err) {
      let msg = 'Nie udało się zalogować.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Błędny email lub hasło.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Zbyt wiele nieudanych prób. Spróbuj później.';
      }
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl space-y-8 border border-gray-100">
        <div className="flex flex-col items-center">
          <img src="/icon.png" alt="Logo" className="w-20 h-20 rounded-3xl shadow-xl mb-4 rotate-3" />
          <h2 className="text-3xl font-black text-gray-900 text-center tracking-tight">ETOS | Grafik</h2>
          <p className="mt-2 text-sm text-gray-500 font-medium text-center">System zarządzania grafikiem stacji</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-semibold text-center border border-red-100 animate-pulse">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Adres Email</label>
            <input
              type="email"
              required
              className="block w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition-all outline-none text-gray-900"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="np. edyta.t@etos.pl"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 ml-1">Hasło</label>
            <input
              type="password"
              required
              className="block w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition-all outline-none text-gray-900"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-md text-base font-bold text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-8"
          >
            {loading ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Logowanie...
              </div>
            ) : 'Zaloguj się'}
          </button>
        </form>

        <div className="mt-8 text-[11px] text-gray-400 text-center border-t border-gray-50 pt-6">
          <p>Potrzebujesz konta? Skontaktuj się z kierownikiem stacji.</p>
        </div>
      </div>
    </div>
  );
}

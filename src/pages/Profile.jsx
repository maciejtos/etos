import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Shield, Mail, Download, Upload, Key, Clock, Moon, Sun, ArrowRightLeft, Users, ClipboardList, ChevronRight } from 'lucide-react';
import { useNavigate, useOutletContext, Link } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { pl } from 'date-fns/locale';

export default function Profile() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const { scheduleDate } = useOutletContext();
  
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef(null);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [totalMonthlyHours, setTotalMonthlyHours] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [pendingRequests, setPendingRequests] = useState(0);

  const [userData, setUserData] = useState(null);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  React.useEffect(() => {
    async function loadUser() {
      if (!currentUser) return;
      const docRef = doc(db, 'users', currentUser.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setUserData(snap.data());
      }
    }
    loadUser();
  }, [currentUser]);

  React.useEffect(() => {
    if (userRole === 'admin') {
      const q = query(collection(db, 'swap_requests'));
      const unsubscribe = onSnapshot(query(collection(db, 'swap_requests')), (snapshot) => {
        let count = 0;
        snapshot.forEach(doc => {
          const data = doc.data();
          if (data.status === 'pending' || data.status === 'exchange_taken') {
            count++;
          }
        });
        setPendingRequests(count);
      });
      return () => unsubscribe();
    }
  }, [userRole]);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
    }
  }

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  React.useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (isDarkMode) {
      root.classList.add('dark');
      body.classList.add('dark');
      root.style.colorScheme = 'dark';
      localStorage.setItem('theme', 'dark');
      console.log('Theme: DARK applied');
    } else {
      root.classList.remove('dark');
      body.classList.remove('dark');
      root.style.colorScheme = 'light';
      localStorage.setItem('theme', 'light');
      console.log('Theme: LIGHT applied');
    }
  }, [isDarkMode]);

  // Calculate total monthly hours
  React.useEffect(() => {
    async function calculateHours() {
      if (!currentUser) return;
      try {
        const monthId = format(scheduleDate, 'yyyy-MM');
        
        // 1. Get user name
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || currentUser.displayName || currentUser.email;

        // 2. Get schedule
        const schedDoc = await getDoc(doc(db, 'schedules', monthId));
        if (schedDoc.exists()) {
          const daysData = schedDoc.data().days || {};
          const monthStart = startOfMonth(scheduleDate);
          const monthEnd = endOfMonth(scheduleDate);
          const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
          
          let total = 0;
          daysInMonth.forEach(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayData = daysData[dateKey] || { dniowka: [], nocka: [] };
            const myShifts = [
              ...(dayData.dniowka || []).filter(s => s.user === userName),
              ...(dayData.nocka || []).filter(s => s.user === userName)
            ];

            if (myShifts.length > 0) {
              myShifts.forEach(s => {
                total += parseHours(s.time);
              });
            } else if (userName.toLowerCase().includes('karol') && !isWeekend(day)) {
              total += 4;
            }
          });
          setTotalMonthlyHours(total);
        } else {
          // Nawet jeśli dokument miesiąca nie istnieje, Karol ma domyślne godziny
          if (userName.toLowerCase().includes('karol')) {
            const monthStart = startOfMonth(scheduleDate);
            const monthEnd = endOfMonth(scheduleDate);
            const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
            let total = 0;
            daysInMonth.forEach(day => {
              if (!isWeekend(day)) total += 4;
            });
            setTotalMonthlyHours(total);
          } else {
            setTotalMonthlyHours(0);
          }
        }
      } catch (err) {
        console.error('Error calculating hours:', err);
      }
    }
    calculateHours();
  }, [scheduleDate, currentUser]);

  const parseHours = (timeStr) => {
    if (!timeStr) return 0;
    const lower = timeStr.toLowerCase();
    if (lower.includes('dniówka') || lower.includes('nocka') || lower === '12' || lower === '12h') return 12;
    const match = timeStr.match(/^(\d+)h/);
    if (match) return parseInt(match[1]);
    return 0;
  };

  const handleExportCSV = async () => {
    setDownloading(true);
    try {
      const monthId = format(scheduleDate, 'yyyy-MM');
      const monthLabel = format(scheduleDate, 'LLLL yy', { locale: pl });
      
      const usersSnap = await getDocs(query(collection(db, 'users')));
      const usersList = usersSnap.docs.map(d => ({
        id: d.id,
        name: `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim() || d.data().email
      })).sort((a, b) => {
        const priorityOrder = [
          'arina', 'anita', 'beata', 'mateusz', 'maciej', 
          'alina', 'patrycja', 'maja', 'oksana', 'szymon', 
          'wiktoria', 'julia'
        ];
        
        const getIndex = (name) => {
          const lower = name.toLowerCase();
          const index = priorityOrder.findIndex(p => lower.includes(p));
          if (index !== -1) return index;
          if (lower.includes('edyta')) return 100;
          if (lower.includes('karol')) return 200;
          return 50; 
        };

        const indexA = getIndex(a.name);
        const indexB = getIndex(b.name);

        if (indexA !== indexB) return indexA - indexB;
        return a.name.localeCompare(b.name);
      });

      const docRef = doc(db, 'schedules', monthId);
      const snap = await getDoc(docRef);
      const daysData = snap.exists() ? snap.data().days || {} : {};

      const monthStart = startOfMonth(scheduleDate);
      const monthEnd = endOfMonth(scheduleDate);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      let csvContent = "\uFEFF"; 
      csvContent += `${monthLabel} Pracownik;`;
      daysInMonth.forEach(day => {
        csvContent += `${format(day, 'd')};`;
      });
      csvContent += "Suma godzin\n";

      usersList.forEach(worker => {
        let row = `${worker.name};`;
        let totalHours = 0;

        daysInMonth.forEach(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayData = daysData[dateKey] || { dniowka: [], nocka: [] };
          
          const shifts = [
            ...dayData.dniowka.map(s => ({ ...s, type: 'D' })),
            ...dayData.nocka.map(s => ({ ...s, type: 'N' }))
          ];

          const workerShift = shifts.find(s => s.user === worker.name);
          
          if (workerShift) {
            const displayCode = (workerShift.time === '12h' || workerShift.time === '12') 
              ? workerShift.type 
              : workerShift.time;
            
            row += `${displayCode};`;
            totalHours += parseHours(workerShift.time);
          } else {
            row += ";";
          }
        });

        row += `${totalHours}\n`;
        csvContent += row;
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `grafik_${monthId}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Błąd podczas generowania pliku: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setDownloading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim() !== '');
      if (lines.length < 2) throw new Error('Zbyt krótki plik lub brak danych.');

      const monthId = format(scheduleDate, 'yyyy-MM');
      const monthStart = startOfMonth(scheduleDate);
      const monthEnd = endOfMonth(scheduleDate);
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const newDaysData = {};
      daysInMonth.forEach(day => {
        newDaysData[format(day, 'yyyy-MM-dd')] = { dniowka: [], nocka: [] };
      });

      // Zaczynamy od i=1 omijając nagłówek
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(';');
        const workerName = row[0].trim();
        if (!workerName) continue;

        daysInMonth.forEach((day, index) => {
          const colIndex = index + 1;
          if (colIndex < row.length) {
            const val = row[colIndex].trim();
            if (val) {
              const dateKey = format(day, 'yyyy-MM-dd');
              if (val.toUpperCase() === 'N') {
                newDaysData[dateKey].nocka.push({ user: workerName, time: '12h' });
              } else if (val.toUpperCase() === 'D') {
                newDaysData[dateKey].dniowka.push({ user: workerName, time: '12h' });
              } else {
                newDaysData[dateKey].dniowka.push({ user: workerName, time: val });
              }
            }
          }
        });
      }

      await setDoc(doc(db, 'schedules', monthId), { days: newDaysData }, { merge: true });
      alert('Pomyślnie zaimportowano grafik na ten miesiąc!');
      // Wymuszamy przeładowanie, jeśli jesteśmy w kontekście aplikacji
      window.location.reload(); 
    } catch (err) {
      alert('Błąd importu: ' + err.message);
    } finally {
      setDownloading(false);
      event.target.value = null; // reset input
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMsg('');
    if (!oldPassword || !newPassword) {
      return setPasswordError('Wypełnij oba pola.');
    }
    if (newPassword.length < 6) {
      return setPasswordError('Nowe hasło musi mieć co najmniej 6 znaków.');
    }
    
    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, oldPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setPasswordMsg('Hasło zostało pomyślnie zmienione.');
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      setPasswordError('Nie udało się zmienić hasła. Sprawdź, czy obecne hasło jest poprawne.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-6 pb-8">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="bg-brand-600 px-4 py-8 flex flex-col items-center justify-center text-white relative">
          <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-md mb-3 text-brand-600">
            <User size={40} />
          </div>
          <h2 className="text-xl font-bold">{currentUser?.displayName || 'Użytkownik'}</h2>
          <div className="flex items-center mt-1 opacity-90">
            {userRole === 'admin' ? <Shield size={14} className="mr-1" /> : <User size={14} className="mr-1" />}
            <span className="text-sm font-medium capitalize">{userRole === 'admin' ? 'Szefowa (Admin)' : 'Pracownik'}</span>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          <div className="flex items-center text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
            <Mail className="text-gray-400 mr-3" size={20} />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Email</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{currentUser?.email}</span>
            </div>
          </div>

          <div className="flex items-center text-gray-700 dark:text-gray-300 bg-brand-50 dark:bg-brand-900/20 p-3 rounded-xl border border-brand-100 dark:border-brand-900/30">
            <Clock className="text-brand-600 mr-3" size={20} />
            <div className="flex flex-col">
              <span className="text-xs text-brand-600 font-medium">Suma godzin ({format(scheduleDate, 'LLLL', { locale: pl })})</span>
              <span className="text-lg font-bold text-brand-900 dark:text-brand-400">{totalMonthlyHours} h</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] ml-2 mb-2">Szybkie linki</h3>
        
        <Link 
          to="/availabilities"
          className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:border-brand-300 dark:hover:border-brand-900 transition-all group"
        >
          <div className="flex items-center">
            <div className="w-10 h-10 bg-brand-50 dark:bg-brand-900/20 rounded-xl flex items-center justify-center text-brand-600 mr-3 group-hover:scale-110 transition-transform">
              <ClipboardList size={20} />
            </div>
            <span className="font-bold text-gray-800 dark:text-gray-100">Dyspozycje</span>
          </div>
          <ChevronRight size={18} className="text-gray-300 group-hover:text-brand-500 transition-colors" />
        </Link>

        <Link 
          to="/exchange"
          className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:border-brand-300 dark:hover:border-brand-900 transition-all group"
        >
          <div className="flex items-center">
            <div className="w-10 h-10 bg-brand-50 dark:bg-brand-900/20 rounded-xl flex items-center justify-center text-brand-600 mr-3 group-hover:scale-110 transition-transform">
              <ArrowRightLeft size={20} />
            </div>
            <span className="font-bold text-gray-800 dark:text-gray-100">{userRole === 'admin' ? 'Prośby o zamianę' : 'Giełda zmian'}</span>
          </div>
          <div className="flex items-center">
            {userRole === 'admin' && pendingRequests > 0 && (
              <span className="mr-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                {pendingRequests}
              </span>
            )}
            <ChevronRight size={18} className="text-gray-300 group-hover:text-brand-500 transition-colors" />
          </div>
        </Link>

        {userRole === 'admin' && (
          <Link 
            to="/team"
            className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:border-brand-300 dark:hover:border-brand-900 transition-all group"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 mr-3 group-hover:scale-110 transition-transform">
                <Users size={20} />
              </div>
              <span className="font-bold text-gray-800 dark:text-gray-100">Zespół</span>
            </div>
            <ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] ml-2 mb-1">Ustawienia</h3>
        
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-300 mr-3">
              {isDarkMode ? <Moon size={20} /> : <Sun size={20} />}
            </div>
            <div>
              <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm">Tryb ciemny</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Przełącz wygląd aplikacji</p>
            </div>
          </div>
          <button 
            onClick={toggleTheme}
            className={`w-12 h-6 rounded-full transition-colors relative ${isDarkMode ? 'bg-brand-600' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isDarkMode ? 'left-7' : 'left-1'}`} />
          </button>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 space-y-3">
          <div className="flex items-center mb-2">
            <Key className="text-gray-400 dark:text-gray-500 mr-2" size={20} />
            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-sm">Zmiana hasła</h3>
          </div>
          {passwordError && <div className="p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100">{passwordError}</div>}
          {passwordMsg && <div className="p-2 bg-green-50 text-green-700 text-xs rounded border border-green-100">{passwordMsg}</div>}
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input 
              type="password" placeholder="Obecne hasło" required
              value={oldPassword} onChange={e => setOldPassword(e.target.value)}
              className="w-full text-sm p-3 border dark:border-gray-800 rounded-xl focus:ring-1 focus:ring-brand-500 bg-gray-50 dark:bg-gray-800 dark:text-white"
            />
            <input 
              type="password" placeholder="Nowe hasło" required
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full text-sm p-3 border dark:border-gray-800 rounded-xl focus:ring-1 focus:ring-brand-500 bg-gray-50 dark:bg-gray-800 dark:text-white"
            />
            <button 
              type="submit" disabled={passwordLoading}
              className="w-full text-sm font-bold text-white bg-gray-800 py-3 rounded-xl hover:bg-black transition disabled:opacity-50"
            >
              {passwordLoading ? 'Zmienianie...' : 'Zmień hasło'}
            </button>
          </form>
        </div>
      </div>

      {userRole === 'admin' && (
        <div className="bg-brand-50 dark:bg-brand-900/10 rounded-2xl shadow-sm border border-brand-100 dark:border-brand-900/20 p-4 space-y-3">
          <div>
            <h3 className="font-bold text-brand-900 dark:text-brand-400">Eksport i Import (CSV)</h3>
            <p className="text-xs text-brand-700 dark:text-brand-300">Pobierz lub wgraj grafik dla miesiąca: <strong>{format(scheduleDate, 'LLLL yyyy', { locale: pl })}</strong>.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportCSV}
              disabled={downloading}
              className="flex flex-col items-center justify-center py-4 px-2 rounded-xl shadow-sm text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50 text-center"
            >
              <Download size={20} className="mb-1" />
              Pobierz
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={downloading}
              className="flex flex-col items-center justify-center py-4 px-2 rounded-xl shadow-sm text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 text-center"
            >
              <Upload size={20} className="mb-1" />
              Wgraj
            </button>
            <input 
              type="file" accept=".csv" 
              ref={fileInputRef} className="hidden" 
              onChange={handleImportCSV} 
            />
          </div>
        </div>
      )}

      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center py-3.5 px-4 border border-red-100 dark:border-red-900/30 rounded-xl shadow-sm text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
      >
        <LogOut size={18} className="mr-2" />
        Wyloguj się
      </button>

    </div>
  );
}

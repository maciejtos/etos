import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, X as CloseIcon, User as UserIcon, Edit2 } from 'lucide-react';
import { db, firebaseConfig } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { Trash2 } from 'lucide-react';

export default function Team() {
  const { userRole, currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State - Adding
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal State - Editing
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState('employee');

  useEffect(() => {
    if (userRole !== 'admin') return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const userData = doc.data();
        const lastSeen = userData.lastSeen?.toMillis ? userData.lastSeen.toMillis() : 0;
        const isOnline = Date.now() - lastSeen < 7 * 60 * 1000;
        return { id: doc.id, ...userData, isOnline };
      });
      const sortedData = data.sort((a, b) => {
        const priorityOrder = [
          'arina', 'anita', 'beata', 'mateusz', 'maciej', 
          'alina', 'patrycja', 'maja', 'oksana', 'szymon', 
          'wiktoria', 'julia'
        ];
        
        const getIndex = (user) => {
          const name = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
          const index = priorityOrder.findIndex(p => name.includes(p));
          if (index !== -1) return index;
          if (name.includes('edyta')) return 100;
          if (name.includes('karol')) return 200;
          return 50;
        };

        const indexA = getIndex(a);
        const indexB = getIndex(b);

        if (indexA !== indexB) return indexA - indexB;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });
      setUsers(sortedData);
      setLoading(false);
    }, (error) => {
      console.warn('Team snapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userRole]);

  if (userRole === null) {
    return <div className="p-8 text-center text-gray-500">Sprawdzanie uprawnień...</div>;
  }

  if (userRole !== 'admin') {
    return (
      <div className="p-8 text-center">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100">
          <h3 className="font-bold">Brak uprawnień</h3>
          <p className="text-sm mt-1">Tylko Szefowa (Admin) ma dostęp do tej sekcji.</p>
        </div>
      </div>
    );
  }

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !password) return alert('Wypełnij wszystkie pola.');
    
    setSubmitting(true);
    let secondaryApp;
    
    try {
      secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      
      await updateProfile(userCredential.user, { 
        displayName: `${firstName} ${lastName}` 
      });

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        firstName,
        lastName,
        email,
        role: 'employee',
        createdAt: serverTimestamp()
      });

      await signOut(secondaryAuth);
      setIsModalOpen(false);
      setFirstName(''); setLastName(''); setEmail(''); setPassword('');
      alert('Pracownik został dodany!');
    } catch (err) {
      alert('Błąd: ' + err.message);
    } finally {
      setSubmitting(false);
      if (secondaryApp) await deleteApp(secondaryApp).catch(console.error);
    }
  };

  const handleEditClick = (user) => {
    setEditingUser(user);
    setEditFirstName(user.firstName || '');
    setEditLastName(user.lastName || '');
    setEditRole(user.role || 'employee');
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        firstName: editFirstName,
        lastName: editLastName,
        role: editRole
      });
      setIsEditModalOpen(false);
      alert('Dane użytkownika zostały zaktualizowane.');
    } catch (err) {
      alert('Błąd podczas aktualizacji: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!editingUser) return;
    if (editingUser.id === currentUser.uid) {
      return alert('Nie możesz usunąć własnego konta z tego poziomu.');
    }

    const confirmDelete = window.confirm(`Czy na pewno chcesz usunąć użytkownika ${editFirstName} ${editLastName} z zespołu? Tej operacji nie można cofnąć.`);
    
    if (confirmDelete) {
      setSubmitting(true);
      try {
        await deleteDoc(doc(db, 'users', editingUser.id));
        setIsEditModalOpen(false);
        alert('Użytkownik został usunięty z bazy zespołu.');
      } catch (err) {
        alert('Błąd podczas usuwania: ' + err.message);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="p-4 space-y-6 pb-8">
      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-brand-100 dark:border-brand-900/30 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Zespół ETOS</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Zarządzaj pracownikami</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-brand-700 transition flex items-center shadow-sm"
        >
          <UserPlus size={16} className="mr-1.5" /> Dodaj
        </button>
      </div>

      <div className="space-y-3">
        {loading && <div className="text-center text-gray-400 p-4">Ładowanie listy...</div>}
        
        {!loading && users.map(user => (
          <div key={user.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex items-center">
            <div className="relative mr-3 shrink-0">
              <div className="bg-brand-50 dark:bg-brand-900/20 w-10 h-10 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-900/30">
                <UserIcon size={20} />
              </div>
              {user.isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full shadow-sm"></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800 dark:text-gray-100 truncate">
                {user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}` 
                  : (user.email ? user.email.split('@')[0] : 'Użytkownik bez nazwy')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email || 'Brak adresu e-mail'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${user.role === 'admin' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-400'}`}>
                {user.role === 'admin' ? 'Szefowa' : 'Pracownik'}
              </span>
              <button 
                onClick={() => handleEditClick(user)}
                className="p-2 text-gray-400 hover:text-brand-600 transition"
              >
                <Edit2 size={18} />
              </button>
            </div>
          </div>
        ))}
        
        {!loading && users.length === 0 && (
          <div className="text-center p-6 text-gray-400 bg-white rounded-xl shadow-sm border border-gray-100">
            Brak użytkowników w bazie.
          </div>
        )}
      </div>

      {/* Modal Dodawania */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex flex-col justify-end p-0 sm:p-4 sm:justify-center">
          <div className="bg-gray-50 dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col">
            <div className="bg-brand-600 px-4 py-4 flex justify-between items-center text-white sm:rounded-t-2xl rounded-t-2xl shrink-0">
              <h3 className="font-bold">Dodaj pracownika</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-brand-700 rounded-full transition">
                <CloseIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleAddEmployee} className="p-4 space-y-4">
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imię</label>
                  <input type="text" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nazwisko</label>
                  <input type="text" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-mail</label>
                <input type="email" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hasło tymczasowe</label>
                <input type="text" required minLength={6} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={submitting} className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-brand-700 disabled:opacity-50">
                {submitting ? 'Tworzenie...' : 'Zapisz pracownika'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edycji */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex flex-col justify-end p-0 sm:p-4 sm:justify-center">
          <div className="bg-gray-50 dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col">
            <div className="bg-gray-800 px-4 py-4 flex justify-between items-center text-white sm:rounded-t-2xl rounded-t-2xl shrink-0">
              <h3 className="font-bold">Edytuj dane</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 hover:bg-gray-700 rounded-full transition">
                <CloseIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="p-4 space-y-4">
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imię</label>
                  <input type="text" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nazwisko</label>
                  <input type="text" required className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm bg-white dark:bg-gray-800 dark:text-white" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rola w systemie</label>
                <select 
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm font-medium bg-white dark:bg-gray-800 dark:text-white"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="employee">Pracownik</option>
                  <option value="admin">Szefowa (Admin)</option>
                </select>
              </div>
              
              <div className="pt-4 flex flex-col space-y-3">
                <button type="submit" disabled={submitting} className="w-full bg-gray-800 text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-black disabled:opacity-50">
                  {submitting ? 'Zapisywanie...' : 'Zatwierdź zmiany'}
                </button>
                
                {editingUser && editingUser.id !== currentUser.uid && (
                  <button 
                    type="button" 
                    onClick={handleDeleteUser}
                    disabled={submitting}
                    className="w-full bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-bold py-3 rounded-xl border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20 transition flex items-center justify-center space-x-2"
                  >
                    <Trash2 size={16} />
                    <span>Usuń użytkownika z zespołu</span>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

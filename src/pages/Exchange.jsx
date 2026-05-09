import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, 
  getDoc, setDoc, addDoc, deleteDoc, serverTimestamp, getDocs 
} from 'firebase/firestore';
import { format } from 'date-fns';
import clsx from 'clsx';

// Bezpieczne Ikony (Manualne SVG, aby uniknąć błędów biblioteki)
const IconSwap = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 4 4-4 4"></path><path d="M20 7H4"></path><path d="m8 21-4-4 4-4"></path><path d="M4 17h16"></path></svg>;
const IconCheck = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconX = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconTrash = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>;
const IconEdit = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const IconPlus = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const UserIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;

export default function Exchange() {
  const { userRole, currentUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reqDate, setReqDate] = useState('');
  const [targetDate, setTargetDate] = useState(''); 
  const [reqShift, setReqShift] = useState('dniowka');
  const [reqType, setReqType] = useState('takeover'); 
  const [targetUserId, setTargetUserId] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [activeTab, setActiveTab] = useState('all'); 

  useEffect(() => {
    if (!currentUser) return;
    
    const q = query(collection(db, 'swap_requests'), orderBy('createdAt', 'desc'));
    const unsubscribeRequests = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
      setLoading(false);
    }, (error) => {
      console.warn('Snapshot error:', error);
      setLoading(false);
    });

    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const list = snapshot.docs.map(d => ({
          id: d.id,
          name: `${d.data().firstName || ''} ${d.data().lastName || ''}`.trim() || d.data().email
        })).filter(u => u.id !== currentUser.uid);
        setAllUsers(list);
      } catch (err) {
        console.error("Fetch users error:", err);
      }
    };
    fetchUsers();

    return () => {
      unsubscribeRequests();
    };
  }, [currentUser]);

  const performSwapInSchedule = async (date, shiftType, userA_Name, userB_Name) => {
    const monthId = date.substring(0, 7);
    const scheduleRef = doc(db, 'schedules', monthId);
    const scheduleSnap = await getDoc(scheduleRef);
    if (!scheduleSnap.exists()) return;
    
    let daysData = scheduleSnap.data().days || {};
    const dayData = daysData[date] || { dniowka: [], nocka: [] };
    let shiftsArray = [...(dayData[shiftType] || [])];

    const idx = shiftsArray.findIndex(s => s.user === userA_Name);
    if (idx !== -1) {
      shiftsArray[idx].user = userB_Name;
      daysData[date] = { ...dayData, [shiftType]: shiftsArray };
      await setDoc(scheduleRef, { days: daysData }, { merge: true });
    } else if (userB_Name) {
      shiftsArray.push({ user: userB_Name, time: '12h' });
      daysData[date] = { ...dayData, [shiftType]: shiftsArray };
      await setDoc(scheduleRef, { days: daysData }, { merge: true });
    }
  };

  const handleAdminAction = async (req, action) => {
    if (!window.confirm(`Czy na pewno chcesz ${action === 'approve' ? 'zaakceptować' : 'odrzucić'}?`)) return;
    try {
      if (action === 'reject') {
        await updateDoc(doc(db, 'swap_requests', req.id), { status: 'rejected' });
        return;
      }
      await performSwapInSchedule(req.date, req.shiftType, req.userName, req.takerName || null);
      await updateDoc(doc(db, 'swap_requests', req.id), { status: 'approved' });
      alert('Zatwierdzono!');
    } catch (err) { alert(err.message); }
  };

  const handleAdminDelete = async (id) => {
    if (!window.confirm('Usunąć?')) return;
    try { await deleteDoc(doc(db, 'swap_requests', id)); } catch (err) { alert(err.message); }
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const targetUser = allUsers.find(u => u.id === targetUserId);
      await addDoc(collection(db, 'swap_requests'), {
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'Pracownik',
        date: reqDate,
        targetDate: targetDate || null,
        shiftType: reqShift,
        requestType: reqType,
        targetUserId: reqType === 'peer' ? targetUserId : null,
        targetUserName: reqType === 'peer' ? targetUser?.name : null,
        reason: reqReason,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setReqDate('');
      setTargetDate('');
      setReqReason('');
      alert('Zgłoszenie dodane!');
    } catch (err) { alert(err.message); } finally { setSubmitting(false); }
  };

  const handleTakeShift = async (req) => {
    if (!window.confirm('Przejąć zmianę?')) return;
    try {
      await updateDoc(doc(db, 'swap_requests', req.id), {
        takerId: currentUser.uid,
        takerName: currentUser.displayName || currentUser.email || 'Pracownik',
        status: 'exchange_taken'
      });
      alert('Zgłoszono!');
    } catch (err) { alert(err.message); }
  };

  const handlePeerAccept = async (req) => {
    if (!window.confirm('Akceptujesz?')) return;
    setSubmitting(true);
    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const myName = userDoc.exists() ? `${userDoc.data().firstName || ''} ${userDoc.data().lastName || ''}`.trim() : 'Pracownik';
      await performSwapInSchedule(req.date, req.shiftType, req.userName, myName);
      await updateDoc(doc(db, 'swap_requests', req.id), { 
        status: 'approved',
        takerId: currentUser.uid,
        takerName: myName
      });
      alert('Zaakceptowano!');
    } catch (err) { alert(err.message); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="p-10 text-center">Ładowanie...</div>;

  const adminActive = requests.filter(r => r.status === 'pending' || r.status === 'exchange_taken');
  const publicExchanges = requests.filter(r => r.requestType !== 'peer' && r.status === 'pending' && r.userId !== currentUser?.uid);
  const myReqs = requests.filter(r => r.userId === currentUser?.uid && (r.status === 'pending' || r.status === 'exchange_taken'));
  const peerForMe = requests.filter(r => r.requestType === 'peer' && r.targetUserId === currentUser?.uid && r.status === 'pending');

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto pb-24">
      {userRole === 'admin' && adminActive.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 uppercase">Oczekujące Prośby</h2>
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-1 rounded-full font-bold text-sm">{adminActive.length}</div>
          </div>
          <div className="grid gap-4">
            {adminActive.map(req => (
              <div key={req.id} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border-l-4 border-l-red-500 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex justify-between items-start mb-3">
                  <span className="font-bold text-gray-800 dark:text-gray-100">{req.userName}</span>
                  <span className="text-xs text-gray-400">{req.date}</span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl mb-4">
                  <p className="text-sm font-bold text-brand-600">
                    {req.requestType === 'takeover' ? 'Zabierz zmianę' : req.requestType === 'split' ? 'Podziel zmianę' : req.requestType === 'time_off' ? 'Zabierz "czas"' : 'Prywatnie'}
                  </p>
                  <p className="text-xs text-gray-500">{req.shiftType === 'dniowka' ? 'Dniówka' : 'Nocka'}</p>
                  {req.reason && <p className="text-xs italic mt-2">"{req.reason}"</p>}
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => handleAdminAction(req, 'approve')} className="flex-1 bg-brand-600 text-white py-2 rounded-xl font-bold">Akceptuj</button>
                  <button onClick={() => handleAdminAction(req, 'reject')} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 py-2 rounded-xl font-bold">Odrzuć</button>
                  <button onClick={() => handleAdminDelete(req.id)} className="p-2 text-red-500"><IconTrash /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100">Giełda Zmian</h2>
          <button onClick={() => setIsModalOpen(true)} className="bg-brand-600 text-white p-3 rounded-2xl shadow-lg hover:scale-105 transition"><IconPlus /></button>
        </div>

        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
          {[{id:'all', label:'Giełda'}, {id:'p2p', label:'Dla mnie'}, {id:'mine', label:'Moje'}].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx("flex-1 py-2 text-xs font-bold rounded-xl transition-all", activeTab === tab.id ? "bg-white dark:bg-gray-700 text-brand-600 shadow-sm" : "text-gray-500")}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeTab === 'all' && (
            <>
              {publicExchanges.length === 0 && <div className="text-center py-10 text-gray-400">Brak ogłoszeń.</div>}
              {publicExchanges.map(exc => (
                <div key={exc.id} className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="font-bold text-gray-800 dark:text-gray-100 block">{exc.userName}</span>
                      <span className={clsx(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                        exc.requestType === 'takeover' ? "bg-red-50 text-red-600" :
                        exc.requestType === 'split' ? "bg-orange-50 text-orange-600" :
                        exc.requestType === 'time_off' ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-600"
                      )}>
                        {exc.requestType === 'takeover' ? 'Prośba o zabranie zmiany' : 
                         exc.requestType === 'split' ? 'Prośba o podzielenie zmiany' : 
                         'Prośba o zabranie czasu'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-black text-gray-900 dark:text-gray-100">{exc.date}</span>
                      <span className="block text-[10px] text-gray-400 uppercase">{exc.shiftType}</span>
                    </div>
                  </div>
                  {exc.reason && <p className="text-xs text-gray-500 mb-4 bg-gray-50 dark:bg-gray-800 p-2 rounded-lg italic">"{exc.reason}"</p>}
                  <button onClick={() => handleTakeShift(exc)} className="w-full bg-brand-600 text-white py-3 rounded-xl font-bold text-sm shadow-sm hover:bg-brand-700 transition">Biorę to!</button>
                </div>
              ))}
            </>
          )}

          {activeTab === 'p2p' && (
            <>
              {peerForMe.length === 0 && <div className="text-center py-10 text-gray-400">Brak próśb do Ciebie.</div>}
              {peerForMe.map(req => (
                <div key={req.id} className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100">
                  <p className="font-bold text-indigo-900 dark:text-indigo-200">{req.userName} prosi Cię o pomoc</p>
                  <p className="text-xs text-indigo-700">{req.date} • {req.shiftType}</p>
                  <button onClick={() => handlePeerAccept(req)} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4">Akceptuję</button>
                </div>
              ))}
            </>
          )}

          {activeTab === 'mine' && (
            <>
              {myReqs.length === 0 && <div className="text-center py-10 text-gray-400">Brak Twoich zgłoszeń.</div>}
              {myReqs.map(req => (
                <div key={req.id} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center">
                  <div>
                    <span className="font-bold block text-gray-800 dark:text-gray-100">{req.userName}</span>
                    <span className="text-[10px] uppercase font-bold text-gray-400">
                      {req.requestType === 'takeover' ? 'Prośba o zabranie zmiany' : 
                       req.requestType === 'split' ? 'Prośba o podzielenie zmiany' : 
                       'Prośba o zabranie czasu'}
                    </span>
                  </div>
                  <div className={clsx("text-[10px] px-3 py-1 rounded-full font-bold", req.status === 'pending' ? "bg-gray-100" : "bg-brand-100 text-brand-600 animate-pulse")}>
                    {req.status === 'pending' ? 'Oczekuje' : 'Ktoś chętny!'}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md p-6 rounded-t-[2rem] sm:rounded-2xl shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-gray-900 dark:text-white">Nowe zgłoszenie</h3>
              <button onClick={() => setIsModalOpen(false)} className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full"><IconX /></button>
            </div>
            
            <form onSubmit={handlePostSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'takeover', label: 'Zabranie zmiany', icon: IconTrash, color: 'text-red-500' },
                  { id: 'split', label: 'Podział zmiany', icon: IconSwap, color: 'text-orange-500' },
                  { id: 'time_off', label: 'Zabranie czasu', icon: IconEdit, color: 'text-blue-500' }
                ].map(type => (
                  <button key={type.id} type="button" onClick={() => setReqType(type.id)} className={clsx("flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all", reqType === type.id ? "border-brand-600 bg-brand-50 text-brand-600" : "border-gray-50 text-gray-400")}>
                    <type.icon />
                    <span className="text-[9px] font-bold mt-1 uppercase">{type.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="date" className="w-full border dark:border-gray-700 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white outline-none" value={reqDate} onChange={(e) => setReqDate(e.target.value)} required />
                <select className="w-full border dark:border-gray-700 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white outline-none" value={reqShift} onChange={(e) => setReqShift(e.target.value)}>
                  <option value="dniowka">Dniówka</option>
                  <option value="nocka">Nocka</option>
                </select>
              </div>

              {reqType === 'split' && <input type="text" className="w-full border dark:border-gray-700 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/10 outline-none" placeholder="Ile godzin oddajesz? (np. 4h)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} required />}
              {reqType === 'time_off' && <input type="text" className="w-full border dark:border-gray-700 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 outline-none" placeholder="Które godziny? (np. 14-16)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} required />}

              <textarea className="w-full border dark:border-gray-700 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white outline-none min-h-[80px]" placeholder="Opisz powód lub szczegóły..." value={reqReason} onChange={(e) => setReqReason(e.target.value)} />
              
              <button type="submit" disabled={submitting} className="w-full bg-brand-600 text-white py-4 rounded-xl font-bold shadow-lg disabled:opacity-50">
                {submitting ? 'Dodawanie...' : 'Opublikuj'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

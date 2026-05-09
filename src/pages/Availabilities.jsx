import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isWeekend, getDay } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { Calendar as CalendarIcon, LayoutList, ChevronLeft, ChevronRight, Save, CheckCircle2, AlertCircle, X, Clock, Users, Table } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import clsx from 'clsx';

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Brak preferencji', color: 'bg-gray-100 text-gray-700', short: '-' },
  { value: 'D', label: 'Dniówka', color: 'bg-yellow-100 text-yellow-800', short: 'D' },
  { value: 'N', label: 'Nocka', color: 'bg-indigo-100 text-indigo-800', short: 'N' },
  { value: 'ANY', label: 'Dowolna zmiana', color: 'bg-green-100 text-green-800', short: 'Dow.' },
  { value: 'OFF', label: 'Wolne', color: 'bg-red-100 text-red-800', short: 'Wolne' },
  { value: 'CUSTOM', label: 'Własne godziny', color: 'bg-blue-100 text-blue-800', short: 'Godz.' },
];

export default function Availabilities() {
  const { currentUser, userRole } = useAuth();
  
  const [currentDate, setCurrentDate] = useState(addMonths(new Date(), 1));
  const [viewMode, setViewMode] = useState('calendar'); 
  
  const [availabilities, setAvailabilities] = useState({});
  const [allUsersAvailabilities, setAllUsersAvailabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDay, setModalDay] = useState(null);
  const [tempData, setTempData] = useState({ type: '', hours: '' });

  const [selectedUserId, setSelectedUserId] = useState(currentUser?.uid);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthId = format(currentDate, 'yyyy-MM');

  useEffect(() => {
    async function loadData() {
      if (!selectedUserId || viewMode === 'admin-table') return;
      setLoading(true);
      try {
        const docRef = doc(db, 'availabilities', `${monthId}_${selectedUserId}`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data().days || {};
          setAvailabilities(data);
        } else {
          setAvailabilities({});
        }
      } catch (err) {
        console.error('Błąd ładowania dyspozycji:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [monthId, selectedUserId, viewMode]);

  useEffect(() => {
    if (userRole === 'admin' && viewMode === 'admin-table') {
      const fetchAllAvailabilities = async () => {
        setLoading(true);
        try {
          const q = query(collection(db, 'availabilities'), where('monthId', '==', monthId));
          const snapshot = await getDocs(q);
          const list = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));
          setAllUsersAvailabilities(list);
        } catch (err) {
          console.error("Fetch all availabilities error:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchAllAvailabilities();
    }
  }, [userRole, viewMode, monthId]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleSetDayValue = (date, value) => {
    const key = format(date, 'yyyy-MM-dd');
    setAvailabilities(prev => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  };

  const openDayModal = (day) => {
    const key = format(day, 'yyyy-MM-dd');
    const existing = availabilities[key] || '';
    
    if (typeof existing === 'object') {
      setTempData({ type: existing.type || 'CUSTOM', hours: existing.hours || '' });
    } else if (['D', 'N', 'ANY', 'OFF'].includes(existing)) {
      setTempData({ type: existing, hours: '' });
    } else if (existing === '') {
      setTempData({ type: '', hours: '' });
    } else {
      setTempData({ type: 'CUSTOM', hours: existing });
    }
    
    setModalDay(day);
    setIsModalOpen(true);
  };

  const saveModalData = () => {
    if (!modalDay) return;
    let finalValue = tempData.type;
    if (tempData.type === 'CUSTOM') {
      finalValue = { type: 'CUSTOM', hours: tempData.hours };
    }
    handleSetDayValue(modalDay, finalValue);
    setIsModalOpen(false);
  };

  const saveAvailabilities = async () => {
    setSaving(true);
    try {
      const docRef = doc(db, 'availabilities', `${monthId}_${selectedUserId}`);
      await setDoc(docRef, {
        userId: selectedUserId,
        userName: currentUser?.displayName || currentUser?.email || 'Pracownik',
        monthId: monthId,
        days: availabilities,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Błąd zapisu:', err);
      alert('Nie udało się zapisać dyspozycji.');
    } finally {
      setSaving(false);
    }
  };

  const getDayDisplay = (day, dataObj = availabilities) => {
    const key = format(day, 'yyyy-MM-dd');
    const val = dataObj[key];
    if (!val) return { label: '-', color: 'text-gray-400' };
    
    if (typeof val === 'object') {
      return { label: val.hours || 'Godz.', color: 'text-blue-600 dark:text-blue-400 font-bold' };
    }
    
    const opt = AVAILABILITY_OPTIONS.find(o => o.value === val);
    return { 
      label: opt?.short || val, 
      color: val === 'D' ? 'text-yellow-600' : 
             val === 'N' ? 'text-indigo-600' : 
             val === 'ANY' ? 'text-green-600' : 
             val === 'OFF' ? 'text-red-600' : 'text-gray-600'
    };
  };

  const startDayOfWeek = getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1;
  const blanks = Array(startDayOfWeek).fill(null);

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 pb-24 flex flex-col">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm py-3 px-4 flex justify-between items-center sticky top-0 z-30">
        <button onClick={handlePrevMonth} className="p-2 -ml-2 text-brand-600 hover:bg-brand-50 rounded-full transition">
          <ChevronLeft size={24} />
        </button>
        <div className="flex flex-col items-center">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 capitalize">
            {format(currentDate, 'LLLL yyyy', { locale: pl })}
          </h2>
          <span className="text-xs text-gray-500">Dyspozycje</span>
        </div>
        <button onClick={handleNextMonth} className="p-2 -mr-2 text-brand-600 hover:bg-brand-50 rounded-full transition">
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start space-x-3 mb-4">
          <AlertCircle className="text-blue-500 mt-0.5 shrink-0" size={18} />
          <p className="text-sm text-blue-800 dark:text-blue-300">
            {userRole === 'admin' ? "Przeglądaj dyspozycje zespołu lub wypełnij własne." : "Wpisz swoje preferencje dotyczące pracy. Możesz wybrać zmianę lub podać godziny."}
          </p>
        </div>

        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl mb-4">
          <button
            onClick={() => setViewMode('calendar')}
            className={clsx(
              "flex-1 flex justify-center items-center py-2 rounded-lg text-sm font-bold transition",
              viewMode === 'calendar' ? "bg-white dark:bg-gray-700 shadow text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"
            )}
          >
            <CalendarIcon size={16} className="mr-2" /> Kalendarz
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              "flex-1 flex justify-center items-center py-2 rounded-lg text-sm font-bold transition",
              viewMode === 'list' ? "bg-white dark:bg-gray-700 shadow text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"
            )}
          >
            <LayoutList size={16} className="mr-2" /> Lista
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => setViewMode('admin-table')}
              className={clsx(
                "flex-1 flex justify-center items-center py-2 rounded-lg text-sm font-bold transition",
                viewMode === 'admin-table' ? "bg-white dark:bg-gray-700 shadow text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"
              )}
            >
              <Table size={16} className="mr-2" /> Zespół
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Ładowanie...</div>
        ) : viewMode === 'calendar' ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map(d => (
                <div key={d} className="text-center text-xs font-bold text-gray-500 py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {blanks.map((_, i) => <div key={`blank-${i}`} className="p-2" />)}
              {daysInMonth.map(day => {
                const { label, color } = getDayDisplay(day);
                return (
                  <button
                    key={day.toString()}
                    onClick={() => openDayModal(day)}
                    className={clsx(
                      "flex flex-col items-center justify-center p-1.5 h-14 rounded-lg border text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800/50",
                      label === '-' ? "border-gray-100 dark:border-gray-800" : "border-brand-200 bg-brand-50/30 dark:border-brand-900/50 dark:bg-brand-900/10"
                    )}
                  >
                    <span className="font-bold text-gray-700 dark:text-gray-300">{format(day, 'd')}</span>
                    <span className={clsx("text-[9px] font-bold mt-0.5 truncate w-full text-center", color)}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            {daysInMonth.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const val = availabilities[key] || '';
              const type = typeof val === 'object' ? val.type : (['D','N','ANY','OFF'].includes(val) ? val : (val === '' ? '' : 'CUSTOM'));
              const hours = typeof val === 'object' ? val.hours : (!['D','N','ANY','OFF',''].includes(val) ? val : '');
              const isWeekendDay = isWeekend(day);
              
              return (
                <div key={key} className={clsx("p-3 rounded-xl border space-y-3", isWeekendDay ? "bg-gray-100/50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-800" : "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800")}>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-gray-800 dark:text-gray-200">{format(day, 'd')}</span>
                      <span className="text-xs text-gray-500 capitalize">{format(day, 'EEEE', { locale: pl })}</span>
                    </div>
                    <div className="w-2/3">
                      <select
                        value={type}
                        onChange={(e) => {
                          const newType = e.target.value;
                          if (newType === 'CUSTOM') {
                            handleSetDayValue(day, { type: 'CUSTOM', hours: hours || '08:00-16:00' });
                          } else {
                            handleSetDayValue(day, newType);
                          }
                        }}
                        className="w-full text-sm p-2 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:text-white"
                      >
                        {AVAILABILITY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  </div>
                  {type === 'CUSTOM' && (
                    <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-900/30">
                      <Clock size={16} className="text-blue-500" />
                      <input 
                        type="text" placeholder="np. 08:00 - 14:00" value={hours}
                        onChange={(e) => handleSetDayValue(day, { type: 'CUSTOM', hours: e.target.value })}
                        className="flex-1 bg-transparent text-sm border-none focus:ring-0 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500">
                <tr>
                  <th className="p-2 font-bold border border-gray-200 dark:border-gray-700 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10">Pracownik</th>
                  {daysInMonth.map(day => (
                    <th key={day.toString()} className={clsx("p-2 font-bold text-center border border-gray-200 dark:border-gray-700 min-w-[32px]", isWeekend(day) && "bg-gray-200 dark:bg-gray-700/80")}>
                      {format(day, 'd')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allUsersAvailabilities.length === 0 ? (
                  <tr><td colSpan={daysInMonth.length + 1} className="p-4 text-center text-gray-400 italic">Brak wpisanych dyspozycji na ten miesiąc</td></tr>
                ) : (
                  allUsersAvailabilities.map(userDisp => (
                    <tr key={userDisp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-2 border border-gray-200 dark:border-gray-700 font-medium sticky left-0 bg-white dark:bg-gray-900">{userDisp.userName}</td>
                      {daysInMonth.map(day => {
                        const { label, color } = getDayDisplay(day, userDisp.days || {});
                        return (
                          <td key={day.toString()} className={clsx("p-1 border border-gray-200 dark:border-gray-700 text-center font-bold text-[9px]", color)}>
                            {label}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewMode !== 'admin-table' && (
        <div className="fixed bottom-[76px] left-0 right-0 px-4 z-40">
          <button
            onClick={saveAvailabilities}
            disabled={saving}
            className={clsx(
              "w-full flex items-center justify-center py-3.5 rounded-xl font-bold shadow-lg transition-all",
              saveSuccess ? "bg-green-500 text-white" : "bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-70"
            )}
          >
            {saving ? <span>Zapisywanie...</span> : saveSuccess ? <><CheckCircle2 size={20} className="mr-2" /> Zapisano</> : <><Save size={20} className="mr-2" /> Zapisz dyspozycje</>}
          </button>
        </div>
      )}

      {isModalOpen && modalDay && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl">
            <div className="bg-brand-600 p-4 text-white flex justify-between items-center">
              <h3 className="font-bold">{format(modalDay, 'd MMMM', { locale: pl })}</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {AVAILABILITY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTempData({ ...tempData, type: opt.value })}
                    className={clsx("p-2 rounded-lg text-xs font-bold border transition", tempData.type === opt.value ? "bg-brand-600 text-white border-brand-600" : "bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {tempData.type === 'CUSTOM' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500">Wpisz godziny:</label>
                  <div className="flex items-center space-x-2 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border dark:border-gray-700">
                    <Clock size={18} className="text-gray-400" />
                    <input 
                      autoFocus type="text" className="flex-1 bg-transparent border-none focus:ring-0 text-sm dark:text-white"
                      placeholder="np. 7:00-15:00" value={tempData.hours}
                      onChange={(e) => setTempData({ ...tempData, hours: e.target.value })}
                    />
                  </div>
                </div>
              )}
              <button onClick={saveModalData} className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl shadow-md">Zastosuj</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

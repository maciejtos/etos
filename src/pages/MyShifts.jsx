import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Calendar as CalendarIcon, LayoutGrid, List, Calendar } from 'lucide-react';
import clsx from 'clsx';

export default function MyShifts() {
  const { scheduleDate } = useOutletContext();
  const { currentUser, userRole } = useAuth();
  const [myShifts, setMyShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'grid', 'calendar'
  const monthName = format(scheduleDate, 'LLLL yyyy', { locale: pl });

  useEffect(() => {
    async function fetchData() {
      if (!currentUser) return;
      setLoading(true);
      try {
        const monthId = format(scheduleDate, 'yyyy-MM');
        
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || currentUser.displayName || currentUser.email;

        const schedDoc = await getDoc(doc(db, 'schedules', monthId));
        if (schedDoc.exists()) {
          const pub = schedDoc.data().isPublished || false;
          setIsPublished(pub);
          
          if (pub || userRole === 'admin') {
            const daysData = schedDoc.data().days || {};
            const monthStart = startOfMonth(scheduleDate);
            const monthEnd = endOfMonth(scheduleDate);
            const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
            
            const shifts = [];
            daysInMonth.forEach(day => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayData = daysData[dateKey] || { dniowka: [], nocka: [] };
              
              const dShift = dayData.dniowka.find(s => s.user === userName);
              if (dShift) {
                const companions = dayData.dniowka.filter(s => s.user !== userName).map(s => s.user);
                shifts.push({ date: dateKey, type: 'Dniówka', time: dShift.time, companions });
              }
              const nShift = dayData.nocka.find(s => s.user === userName);
              if (nShift) {
                const companions = dayData.nocka.filter(s => s.user !== userName).map(s => s.user);
                shifts.push({ date: dateKey, type: 'Nocka', time: nShift.time, companions });
              }
            });
            setMyShifts(shifts);
          } else {
            setMyShifts([]);
          }
        } else {
          setIsPublished(false);
          setMyShifts([]);
        }
      } catch (err) {
        console.error('Błąd pobierania zmian:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [scheduleDate, currentUser?.uid]);

  const getShiftColor = (type) => {
    if (type === 'Dniówka') return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-900/30';
    if (type === 'Nocka') return 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/30';
    return 'bg-brand-100 dark:bg-brand-900/20 text-brand-800 dark:text-brand-400 border-brand-200 dark:border-brand-900/30';
  };

  const renderList = () => (
    <div className="space-y-3">
      {myShifts.map((shiftInfo, idx) => {
        const dateObj = parseISO(shiftInfo.date);
        return (
          <div key={idx} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between transition-all hover:shadow-md">
            <div className="flex flex-col">
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100">
                {format(dateObj, 'd MMMM', { locale: pl })}
              </span>
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {format(dateObj, 'EEEE', { locale: pl })}
              </span>
              {shiftInfo.companions && shiftInfo.companions.length > 0 && (
                <div className="mt-2 flex flex-col">
                  <span className="text-[9px] uppercase font-bold text-gray-300 dark:text-gray-600 tracking-widest">Współpracownik:</span>
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                    {shiftInfo.companions.join(', ')}
                  </span>
                </div>
              )}
            </div>
            <div className={clsx("flex flex-col items-end space-y-1")}>
              <div className={clsx("px-4 py-2 rounded-xl text-xs font-black uppercase border whitespace-nowrap", getShiftColor(shiftInfo.type))}>
                {shiftInfo.type}
              </div>
              {shiftInfo.time && shiftInfo.time !== '12h' && (
                <div className="bg-brand-50 dark:bg-brand-900/20 px-3 py-1 rounded-xl text-sm font-black text-brand-700 dark:text-brand-400 border-2 border-brand-100 dark:border-brand-900/30">
                  {shiftInfo.time}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderGrid = () => (
    <div className="grid grid-cols-3 gap-2">
      {myShifts.map((shiftInfo, idx) => {
        const dateObj = parseISO(shiftInfo.date);
        return (
          <div key={idx} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 flex flex-col items-center text-center space-y-1 transition-all hover:border-brand-500">
            <span className="text-xl font-black text-gray-900 dark:text-white">{format(dateObj, 'd')}</span>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter leading-none">{format(dateObj, 'MMM', { locale: pl })}</p>
            <div className={clsx("w-full py-1.5 rounded-lg text-[10px] font-black uppercase border-2 mt-2", getShiftColor(shiftInfo.type))}>
              {shiftInfo.time || (shiftInfo.type === 'Dniówka' ? 'D' : 'N')}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderCalendar = () => {
    const startWeek = startOfMonth(scheduleDate);
    const endWeek = endOfMonth(scheduleDate);
    const calendarDays = eachDayOfInterval({ start: startWeek, end: endWeek });
    const firstDayOfWeek = parseInt(format(startWeek, 'i')) - 1; 
    const blanks = Array(firstDayOfWeek).fill(null);

    return (
      <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <div className="grid grid-cols-7 gap-2 mb-6">
          {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
            <div key={d} className="text-center text-[10px] font-black text-gray-300 dark:text-gray-600 uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {blanks.map((_, i) => <div key={`b-${i}`} className="aspect-square"></div>)}
          {calendarDays.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const shift = myShifts.find(s => s.date === dateKey);
            return (
              <div key={idx} className={clsx(
                "aspect-square rounded-2xl flex flex-col items-center justify-center relative transition-all border-2",
                shift 
                  ? (shift.type === 'Dniówka' ? "bg-yellow-50 border-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:border-yellow-900/30" : "bg-indigo-50 border-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-900/30") 
                  : "bg-white dark:bg-gray-800/30 border-transparent text-gray-400"
              )}>
                <span className={clsx("text-xs font-black", shift && "text-[10px]")}>{format(day, 'd')}</span>
                {shift && (
                  <div className={clsx(
                    "mt-0.5 px-1 rounded text-[9px] font-black leading-tight border border-current",
                    shift.type === 'Dniówka' ? "bg-yellow-200 text-yellow-900" : "bg-indigo-200 text-indigo-900"
                  )}>
                    {shift.time || (shift.type === 'Dniówka' ? 'D' : 'N')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-10 text-center text-gray-400 font-bold animate-pulse">Pobieranie zmian...</div>;

  return (
    <div className="p-4 space-y-6 pb-24 max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-900 p-5 rounded-[2rem] shadow-sm border border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-gray-800 dark:text-gray-100 tracking-tight uppercase">Moje Zmiany</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{monthName}</p>
        </div>
        <div className="flex bg-gray-50 dark:bg-gray-800 p-1.5 rounded-2xl">
          <button onClick={() => setViewMode('list')} className={clsx("p-2.5 rounded-xl transition-all", viewMode === 'list' ? "bg-white dark:bg-gray-700 text-brand-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}><List size={20} /></button>
          <button onClick={() => setViewMode('grid')} className={clsx("p-2.5 rounded-xl transition-all", viewMode === 'grid' ? "bg-white dark:bg-gray-700 text-brand-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}><LayoutGrid size={20} /></button>
          <button onClick={() => setViewMode('calendar')} className={clsx("p-2.5 rounded-xl transition-all", viewMode === 'calendar' ? "bg-white dark:bg-gray-700 text-brand-600 shadow-sm" : "text-gray-400 hover:text-gray-600")}><CalendarIcon size={20} /></button>
        </div>
      </div>

      {!isPublished && userRole !== 'admin' ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800">
          <div className="w-20 h-20 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-200 dark:text-gray-700 mb-6">
            <Calendar size={40} />
          </div>
          <h3 className="text-xl font-black text-gray-800 dark:text-white">Grafik w przygotowaniu</h3>
          <p className="text-sm text-gray-400 mt-2 max-w-[200px]">Szefowa jeszcze nie opublikowała grafiku na ten miesiąc.</p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {myShifts.length === 0 ? (
            <div className="text-center p-12 text-gray-400 font-bold bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800">
              Brak przypisanych zmian.
            </div>
          ) : (
            <>
              {viewMode === 'list' && renderList()}
              {viewMode === 'grid' && renderGrid()}
              {viewMode === 'calendar' && renderCalendar()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

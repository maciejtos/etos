import React, { useState, useEffect, useRef } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, isWeekend } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { Sun, Moon, X, Plus, Trash2, ChevronLeft, ChevronRight, CheckCircle2, Clock, Calendar, LayoutList, Table } from 'lucide-react';
import { db } from '../firebase';
import { collection, doc, getDoc, setDoc, addDoc, serverTimestamp, onSnapshot, getDocs } from 'firebase/firestore';
import clsx from 'clsx';

export default function Schedule() {
  const { userRole, currentUser } = useAuth();
  const { scheduleDate, setScheduleDate } = useOutletContext();
  const todayRef = useRef(null);
  const tableRef = useRef(null);
  
  const [monthData, setMonthData] = useState({});
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('list');
  // Common Modal state
  const [selectedDay, setSelectedDay] = useState(null);

  // Employee Modal state
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [swapReason, setSwapReason] = useState('');
  const [swapShift, setSwapShift] = useState('dniowka');
  const [submitting, setSubmitting] = useState(false);

  // Admin Modal state
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminDayData, setAdminDayData] = useState({ dniowka: [], nocka: [] });
  const [allUsers, setAllUsers] = useState([]);

  // Table Cell Edit state
  const [isCellModalOpen, setIsCellModalOpen] = useState(false);
  const [cellEditData, setCellEditData] = useState({ emp: '', day: null, shiftType: '', time: '12h' });

  const monthStart = startOfMonth(scheduleDate);
  const monthEnd = endOfMonth(scheduleDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const monthId = format(scheduleDate, 'yyyy-MM');

  // Fetch data
  useEffect(() => {
    async function fetchSchedule() {
      setLoading(true);
      try {
        const docRef = doc(db, 'schedules', monthId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMonthData(docSnap.data().days || {});
          setIsPublished(docSnap.data().isPublished || false);
        } else {
          setMonthData({});
          setIsPublished(false);
        }
      } catch (err) {
        console.warn('Firebase read error:', err.message);
        setMonthData({});
        setIsPublished(false);
      } finally {
        setLoading(false);
      }
    }
    fetchSchedule();
  }, [monthId]);

  // Scroll to today ONLY after loading is finished and DOM is ready
  useEffect(() => {
    if (!loading && todayRef.current && format(scheduleDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM')) {
      const timer = setTimeout(() => {
        todayRef.current.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, scheduleDate]);

  const handlePrevMonth = () => setScheduleDate(subMonths(scheduleDate, 1));
  const handleNextMonth = () => setScheduleDate(addMonths(scheduleDate, 1));

  const handlePublishToggle = async () => {
    setSubmitting(true);
    try {
      const newStatus = !isPublished;
      await setDoc(doc(db, 'schedules', monthId), { isPublished: newStatus }, { merge: true });
      setIsPublished(newStatus);
    } catch (err) {
      alert('Błąd podczas zmiany statusu grafiku.');
    } finally {
      setSubmitting(false);
    }
  };



  // Fetch users list for Admin dropdown
  useEffect(() => {
    if (userRole === 'admin') {
      const fetchUsers = async () => {
        try {
          const snapshot = await getDocs(collection(db, 'users'));
          const list = snapshot.docs.map(d => ({
            id: d.id,
            name: d.data().firstName && d.data().lastName 
              ? `${d.data().firstName} ${d.data().lastName}`
              : (d.data().email ? d.data().email.split('@')[0] : 'Użytkownik')
          }));
          setAllUsers(list);
        } catch (err) {
          console.error("Fetch users error:", err);
        }
      };
      fetchUsers();
    }
  }, [userRole]);

  const handleDayClick = (day) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    setSelectedDay(day);

    if (userRole === 'admin') {
      const existingData = monthData[dateKey] || { dniowka: [], nocka: [] };
      // Deep copy to avoid mutating state directly during edits
      setAdminDayData(JSON.parse(JSON.stringify(existingData)));
      setIsAdminModalOpen(true);
    } else {
      setIsEmployeeModalOpen(true);
    }
  };

  // --- Employee Logic ---
  const handleSwapSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDay || !currentUser) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'swap_requests'), {
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email || 'Pracownik',
        date: format(selectedDay, 'yyyy-MM-dd'),
        shiftType: swapShift,
        reason: swapReason,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsEmployeeModalOpen(false);
      setSwapReason('');
      alert('Prośba została wysłana.');
    } catch (err) {
      alert('Błąd: upewnij się, że masz poprawnie skonfigurowaną bazę Firestore i reguły (rules).');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Table Cell Logic ---
  const handleCellClick = (day, emp) => {
    if (userRole !== 'admin') {
      handleDayClick(day); // For employees, fallback to regular modal
      return;
    }
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayData = monthData[dateKey] || { dniowka: [], nocka: [] };
    const dShift = dayData.dniowka?.find(s => s.user === emp);
    const nShift = dayData.nocka?.find(s => s.user === emp);
    
    let shiftType = '';
    let time = '12h';
    if (dShift) { shiftType = 'dniowka'; time = dShift.time; }
    else if (nShift) { shiftType = 'nocka'; time = nShift.time; }
    
    setCellEditData({ emp, day, shiftType, time });
    setIsCellModalOpen(true);
  };

  const handleCellSave = async () => {
    setSubmitting(true);
    const dateKey = format(cellEditData.day, 'yyyy-MM-dd');
    const dayData = monthData[dateKey] ? JSON.parse(JSON.stringify(monthData[dateKey])) : { dniowka: [], nocka: [] };
    
    // Remove existing shifts for this employee
    dayData.dniowka = dayData.dniowka.filter(s => s.user !== cellEditData.emp);
    dayData.nocka = dayData.nocka.filter(s => s.user !== cellEditData.emp);
    
    // Add new shift if type is selected
    if (cellEditData.shiftType) {
      dayData[cellEditData.shiftType].push({ user: cellEditData.emp, time: cellEditData.time || '12h' });
    }
    
    const updatedMonthData = { ...monthData, [dateKey]: dayData };
    
    try {
      const docRef = doc(db, 'schedules', monthId);
      await setDoc(docRef, { days: updatedMonthData }, { merge: true });
      setMonthData(updatedMonthData);
      setIsCellModalOpen(false);
    } catch (err) {
      alert('Błąd podczas zapisywania komórki.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Admin Logic ---
  const handleAdminSave = async () => {
    if (!selectedDay) return;
    setSubmitting(true);
    const dateKey = format(selectedDay, 'yyyy-MM-dd');
    const updatedMonthData = { ...monthData, [dateKey]: adminDayData };

    try {
      const docRef = doc(db, 'schedules', monthId);
      await setDoc(docRef, { days: updatedMonthData }, { merge: true });
      setMonthData(updatedMonthData);
      setIsAdminModalOpen(false);
    } catch (err) {
      alert('Błąd podczas zapisywania grafiku. Sprawdź reguły bazy danych.');
    } finally {
      setSubmitting(false);
    }
  };

  const addShiftRow = (type) => {
    setAdminDayData(prev => ({
      ...prev,
      [type]: [...prev[type], { user: '', time: '12h' }]
    }));
  };

  const updateShiftRow = (type, index, field, value) => {
    setAdminDayData(prev => {
      const newArray = [...prev[type]];
      newArray[index] = { ...newArray[index], [field]: value };
      return { ...prev, [type]: newArray };
    });
  };

  const removeShiftRow = (type, index) => {
    setAdminDayData(prev => {
      const newArray = [...prev[type]];
      newArray.splice(index, 1);
      return { ...prev, [type]: newArray };
    });
  };

  const renderShiftBlock = (shifts, type) => {
    const isDay = type === 'dniowka';
    const bgColor = isDay ? 'bg-yellow-50 dark:bg-yellow-900/10' : 'bg-indigo-50 dark:bg-indigo-900/10';
    const borderColor = isDay ? 'border-yellow-100 dark:border-yellow-900/20' : 'border-indigo-100 dark:border-indigo-900/20';
    const titleColor = isDay ? 'text-yellow-800 dark:text-yellow-400' : 'text-indigo-800 dark:text-indigo-400';
    const Icon = isDay ? Sun : Moon;
    const title = isDay ? 'Dniówka (6:00 - 18:00)' : 'Nocka (18:00 - 6:00)';

    return (
      <div className={clsx("p-3 border rounded-lg", bgColor, borderColor)}>
        <div className={clsx("flex items-center text-xs font-bold mb-2", titleColor)}>
          <Icon size={14} className="mr-1" />
          {title}
        </div>
        <div className="space-y-1.5">
          {shifts && shifts.length > 0 ? (
            shifts.map((s, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm bg-white dark:bg-gray-800 bg-opacity-80 dark:bg-opacity-50 px-2 py-1.5 rounded shadow-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{s.user}</span>
                <span className="px-2 py-1 rounded text-sm font-black border-2 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 shadow-sm">
                  {s.time}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-400 italic">Brak obsady</div>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Ładowanie grafiku...</div>;

  const isEmployeeAndNotPublished = userRole !== 'admin' && !isPublished;

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 pb-8 flex flex-col">
      {/* Pasek Miesiąca - PRZYKLEJONY NA SZTYWNO (FIXED) pod czerwonym navbarem */}
      <div className="fixed top-[60px] left-0 right-0 z-40 w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-md py-3 px-4 flex justify-between items-center">
        <button onClick={handlePrevMonth} className="p-2 -ml-2 text-brand-600 hover:bg-brand-50 rounded-full transition">
          <ChevronLeft size={24} />
        </button>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 capitalize text-center flex-1">
          {format(scheduleDate, 'LLLL yyyy', { locale: pl })}
        </h2>
        <button onClick={handleNextMonth} className="p-2 -mr-2 text-brand-600 hover:bg-brand-50 rounded-full transition">
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Kontener na treść - Dodałem pt-[56px], żeby zrekompensować stałą wysokość paska miesiąca */}
      <div className="flex-1 pt-[56px]">
        {userRole === 'admin' && (
          <div className="px-4 pt-4">
            <button 
              onClick={handlePublishToggle}
              disabled={submitting}
              className={clsx(
                "w-full py-3 rounded-xl shadow-sm border font-bold flex items-center justify-center space-x-2 transition",
                isPublished 
                  ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100" 
                  : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-100"
              )}
            >
              {isPublished ? <CheckCircle2 size={18} /> : <Clock size={18} />}
              <span>{isPublished ? 'Grafik opublikowany (Widoczny)' : 'Publikuj grafik dla pracowników'}</span>
            </button>
          </div>
        )}

        {isEmployeeAndNotPublished ? (
          <div className="flex flex-col items-center justify-center p-8 text-center mt-12 space-y-4">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500">
              <Calendar size={32} />
            </div>
            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">W trakcie przygotowania</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Grafik na ten miesiąc nie został jeszcze opublikowany przez Szefową.</p>
          </div>
        ) : (
          <>
            {/* Toggler removed from here, moved to floating bar */}

            {viewMode === 'table' ? (() => {
              const employees = Array.from(new Set([
                ...(userRole === 'admin' ? allUsers.map(u => u.name) : []),
                ...Object.values(monthData).flatMap(day => [
                  ...(day.dniowka || []).map(s => s.user),
                  ...(day.nocka || []).map(s => s.user)
                ])
              ])).filter(Boolean).sort((a, b) => {
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
                  return 50; // Inni nad Edytą i Karolem
                };

                const indexA = getIndex(a);
                const indexB = getIndex(b);

                if (indexA !== indexB) return indexA - indexB;
                return a.localeCompare(b);
              });
              const monthName = format(scheduleDate, 'LLLL', { locale: pl });
              
              const formatShortName = (fullName) => {
                if (!fullName) return '';
                const parts = fullName.split(' ');
                if (parts.length > 1) {
                  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
                }
                return fullName;
              };

              return (
              <div className="flex flex-col">
                <div className="px-4 pb-4">
                  <div ref={tableRef} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                    <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="p-2 font-bold border border-gray-200 dark:border-gray-700 capitalize sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 w-[1%] whitespace-nowrap">
                          {monthName}
                        </th>
                        {daysInMonth.map(day => (
                          <th key={day.toString()} className={clsx("p-2 font-bold text-center border border-gray-200 dark:border-gray-700 min-w-[36px]", isWeekend(day) && "bg-gray-200 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300")}>
                            {format(day, 'd')}
                          </th>
                        ))}
                        <th className="p-2 font-bold text-center border border-gray-200 dark:border-gray-700 min-w-[60px] sticky right-0 bg-gray-50 dark:bg-gray-800 shadow-[-1px_0_0_0_#e5e7eb] dark:shadow-[-1px_0_0_0_#374151] z-10">
                          Suma
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.length === 0 ? (
                        <tr>
                          <td colSpan={daysInMonth.length + 2} className="p-4 text-center text-gray-500 italic border border-gray-200 dark:border-gray-700">
                            Brak danych o pracownikach w tym miesiącu
                          </td>
                        </tr>
                      ) : (
                        employees.map(emp => {
                          let totalHours = 0;
                            daysInMonth.forEach(d => {
                              const dKey = format(d, 'yyyy-MM-dd');
                              const dData = monthData[dKey] || { dniowka: [], nocka: [] };
                              const dShift = dData.dniowka?.find(s => s.user === emp);
                              const nShift = dData.nocka?.find(s => s.user === emp);
                              
                              if (dShift && dShift.time) {
                                const match = dShift.time.match(/^(\d+)/);
                                if (match) totalHours += parseInt(match[1], 10);
                              } else if (nShift && nShift.time) {
                                const match = nShift.time.match(/^(\d+)/);
                                if (match) totalHours += parseInt(match[1], 10);
                              } else if (emp.toLowerCase().includes('karol') && !isWeekend(d)) {
                                // Domyślne 4h dla Karola w tygodniu (jeśli nie ma innej zmiany)
                                totalHours += 4;
                              }
                            });

                          return (
                          <tr key={emp} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition group">
                            <td className="p-2 border border-gray-200 dark:border-gray-700 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50 shadow-[1px_0_0_0_#e5e7eb] dark:shadow-[1px_0_0_0_#374151] z-10 whitespace-nowrap">
                              {formatShortName(emp)}
                            </td>
                            {daysInMonth.map(day => {
                              const dateKey = format(day, 'yyyy-MM-dd');
                              const dayData = monthData[dateKey] || { dniowka: [], nocka: [] };
                              const isTodayFlag = isToday(day);
                              const isWeekendDay = isWeekend(day);
                              
                              const dniowkaShift = dayData.dniowka?.find(s => s.user === emp);
                              const nockaShift = dayData.nocka?.find(s => s.user === emp);
                              
                              let content = null;
                              let bgClass = "bg-transparent";
                              
                              if (dniowkaShift && nockaShift) {
                                const dText = dniowkaShift.time === '12h' ? 'D' : dniowkaShift.time;
                                const nText = nockaShift.time === '12h' ? 'N' : nockaShift.time;
                                content = `${dText}/${nText}`;
                                bgClass = "bg-gradient-to-br from-yellow-100 to-indigo-100 dark:from-yellow-900/30 dark:to-indigo-900/30 text-gray-800 dark:text-gray-200";
                              } else if (dniowkaShift) {
                                content = dniowkaShift.time === '12h' ? 'D' : dniowkaShift.time;
                                bgClass = "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400";
                              } else if (nockaShift) {
                                content = nockaShift.time === '12h' ? 'N' : nockaShift.time;
                                bgClass = "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400";
                              } else if (emp.toLowerCase().includes('karol') && !isWeekendDay) {
                                content = "4h";
                                bgClass = "bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 italic font-normal";
                              }
                              
                              return (
                                <td 
                                  key={day.toString()} 
                                  onClick={() => handleCellClick(day, emp)}
                                  className={clsx(
                                    "p-1 border border-gray-200 dark:border-gray-700 text-center text-[10px] cursor-pointer transition",
                                    isTodayFlag ? "bg-brand-50/30 dark:bg-brand-900/10 ring-inset ring-1 ring-brand-500/50" : 
                                    isWeekendDay ? "bg-gray-100 dark:bg-gray-800/80 hover:bg-gray-200 dark:hover:bg-gray-700" : 
                                    "hover:bg-gray-100 dark:hover:bg-gray-800"
                                  )}
                                >
                                  {content ? (
                                    <div className={clsx("w-full h-full min-h-[24px] flex items-center justify-center rounded px-0.5 font-bold", bgClass)}>
                                      {content}
                                    </div>
                                  ) : (
                                    <div className="w-full h-full min-h-[24px]"></div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-2 border border-gray-200 dark:border-gray-700 font-bold text-center text-gray-800 dark:text-gray-200 sticky right-0 bg-gray-50 dark:bg-gray-900 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 shadow-[-1px_0_0_0_#e5e7eb] dark:shadow-[-1px_0_0_0_#374151] z-10">
                              {totalHours > 0 ? `${totalHours}h` : '-'}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs text-center text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800" data-html2canvas-ignore>
                    {userRole === 'admin' ? 'Naciśnij na pustą lub wypełnioną komórkę, aby przypisać / zmienić zmianę dla danego pracownika.' : 'Naciśnij komórkę, aby zgłosić prośbę o zmianę w danym dniu'}
                  </div>
                </div>
              </div>
              </div>
              );
            })() : (
              <div className="space-y-4 p-4">
                {daysInMonth.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayData = monthData[dateKey] || { dniowka: [], nocka: [] };
                  const isCurrentDay = isToday(day);
                  
                  return (
                    <div 
                      key={dateKey} 
                      ref={isCurrentDay ? todayRef : null}
                      onClick={() => handleDayClick(day)}
                      className={clsx(
                        "bg-white dark:bg-gray-900 rounded-xl shadow-sm border overflow-hidden scroll-mt-32 transition-transform active:scale-[0.98] cursor-pointer",
                        isCurrentDay ? "border-brand-500 ring-2 ring-brand-500" : "border-gray-100 dark:border-gray-800"
                      )}
                    >
                      <div className={clsx(
                        "px-4 py-2 border-b flex justify-between items-center",
                        isCurrentDay ? "bg-brand-50 dark:bg-brand-900/20 border-brand-100 dark:border-brand-900/30" : "bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800"
                      )}>
                        <div className="flex items-center space-x-2">
                          <span className={clsx(
                            "text-lg font-bold",
                            isCurrentDay ? "text-brand-700" : "text-gray-700"
                          )}>
                            {format(day, 'd')}
                          </span>
                          <span className={clsx(
                            "text-sm font-medium capitalize",
                            isCurrentDay ? "text-brand-600 dark:text-brand-400" : "text-gray-500 dark:text-gray-400"
                          )}>
                            {format(day, 'EEEE', { locale: pl })}
                          </span>
                        </div>
                        {isCurrentDay && (
                          <span className="text-xs font-bold text-brand-600 bg-brand-100 px-2 py-1 rounded">Dzisiaj</span>
                        )}
                      </div>
                      
                      <div className="p-3 space-y-3">
                        {renderShiftBlock(dayData.dniowka, 'dniowka')}
                        {renderShiftBlock(dayData.nocka, 'nocka')}
                      </div>
                      
                      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/30 text-xs text-center text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
                        {userRole === 'admin' ? 'Naciśnij, aby edytować obsadę' : 'Naciśnij, aby zgłosić prośbę o zmianę'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      {/* Floating View Toggle */}
      {!isEmployeeAndNotPublished && (
        <div className="fixed bottom-20 right-4 z-40">
          <div className="bg-white dark:bg-gray-800 p-1.5 rounded-full flex space-x-1 border border-gray-200 dark:border-gray-700 shadow-xl">
            <button 
              onClick={() => setViewMode('list')}
              className={clsx("flex items-center px-4 py-2 rounded-full text-sm font-bold transition", viewMode === 'list' ? "bg-brand-50 text-brand-600 dark:bg-gray-700 dark:text-brand-400 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}
            >
              <LayoutList size={18} className="mr-2" /> Lista
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={clsx("flex items-center px-4 py-2 rounded-full text-sm font-bold transition", viewMode === 'table' ? "bg-brand-50 text-brand-600 dark:bg-gray-700 dark:text-brand-400 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}
            >
              <Table size={18} className="mr-2" /> Tabela
            </button>
          </div>
        </div>
      )}
    </div>

      {/* --- EMPLOYEE MODAL --- */}
      {isEmployeeModalOpen && selectedDay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="bg-brand-600 px-4 py-3 flex justify-between items-center text-white">
              <h3 className="font-bold">Zgłoś prośbę o zmianę</h3>
              <button onClick={() => setIsEmployeeModalOpen(false)} className="p-1 hover:bg-brand-700 rounded-full transition">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSwapSubmit} className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Wybrany dzień:</p>
                <p className="font-bold text-gray-800 dark:text-gray-100 capitalize">
                  {format(selectedDay, 'EEEE, d MMMM yyyy', { locale: pl })}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Której zmiany dotyczy prośba?</label>
                <select 
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                  value={swapShift}
                  onChange={(e) => setSwapShift(e.target.value)}
                >
                  <option value="dniowka">Dniówka (6:00 - 18:00)</option>
                  <option value="nocka">Nocka (18:00 - 6:00)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Powód / Komentarz</label>
                <textarea 
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 min-h-[80px] bg-white dark:bg-gray-800 dark:text-white"
                  placeholder="Np. Potrzebne wolne rano..."
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                disabled={submitting}
                className="w-full bg-brand-600 text-white font-bold py-3 rounded-xl shadow-sm hover:bg-brand-700 transition disabled:opacity-50"
              >
                {submitting ? 'Wysyłanie...' : 'Wyślij prośbę'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- ADMIN MODAL --- */}
      {isAdminModalOpen && selectedDay && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex flex-col justify-end p-0 sm:p-4 sm:justify-center">
          <div className="bg-gray-50 dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="bg-brand-600 px-4 py-4 flex justify-between items-center text-white sm:rounded-t-2xl rounded-t-2xl shrink-0">
              <div>
                <h3 className="font-bold">Edycja Grafiku</h3>
                <p className="text-xs opacity-90 capitalize">{format(selectedDay, 'EEEE, d MMMM yyyy', { locale: pl })}</p>
              </div>
              <button onClick={() => setIsAdminModalOpen(false)} className="p-1 hover:bg-brand-700 rounded-full transition">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-6">
              {/* Sekcja Dniówki */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-yellow-100 dark:border-yellow-900/30">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center font-bold text-yellow-800 text-sm">
                    <Sun size={16} className="mr-1" /> Dniówka
                  </div>
                  <button onClick={() => addShiftRow('dniowka')} className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded flex items-center hover:bg-yellow-200">
                    <Plus size={12} className="mr-1" /> Dodaj
                  </button>
                </div>
                
                <div className="space-y-2">
                  {adminDayData.dniowka.length === 0 && <p className="text-xs text-gray-400 italic">Brak osób</p>}
                  {adminDayData.dniowka.map((row, idx) => (
                    <div key={idx} className="flex space-x-2 items-center bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-100 dark:border-gray-700">
                      <select 
                        value={row.user} 
                        onChange={(e) => updateShiftRow('dniowka', idx, 'user', e.target.value)}
                        className="flex-1 min-w-0 text-sm p-1.5 border dark:border-gray-700 rounded focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                      >
                        <option value="">Wybierz pracownika...</option>
                        {allUsers.map(u => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                      <input 
                        type="text" placeholder="12h, 6h1..." 
                        value={row.time} onChange={(e) => updateShiftRow('dniowka', idx, 'time', e.target.value)}
                        className="w-16 text-center text-sm p-1.5 border dark:border-gray-700 rounded focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                      />
                      <button onClick={() => removeShiftRow('dniowka', idx)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sekcja Nocki */}
              <div className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900/30">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center font-bold text-indigo-800 text-sm">
                    <Moon size={16} className="mr-1" /> Nocka
                  </div>
                  <button onClick={() => addShiftRow('nocka')} className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded flex items-center hover:bg-indigo-200">
                    <Plus size={12} className="mr-1" /> Dodaj
                  </button>
                </div>
                
                <div className="space-y-2">
                  {adminDayData.nocka.length === 0 && <p className="text-xs text-gray-400 italic">Brak osób</p>}
                  {adminDayData.nocka.map((row, idx) => (
                    <div key={idx} className="flex space-x-2 items-center bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-100 dark:border-gray-700">
                      <select 
                        value={row.user} 
                        onChange={(e) => updateShiftRow('nocka', idx, 'user', e.target.value)}
                        className="flex-1 min-w-0 text-sm p-1.5 border dark:border-gray-700 rounded focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                      >
                        <option value="">Wybierz pracownika...</option>
                        {allUsers.map(u => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                      <input 
                        type="text" placeholder="12h, 6h1..." 
                        value={row.time} onChange={(e) => updateShiftRow('nocka', idx, 'time', e.target.value)}
                        className="w-16 text-center text-sm p-1.5 border dark:border-gray-700 rounded focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                      />
                      <button onClick={() => removeShiftRow('nocka', idx)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-white dark:bg-gray-900 shrink-0 sm:rounded-b-2xl pb-safe dark:border-gray-800">
              <button 
                onClick={handleAdminSave}
                disabled={submitting}
                className="w-full bg-brand-600 text-white font-bold py-3.5 rounded-xl shadow-sm hover:bg-brand-700 transition disabled:opacity-50"
              >
                {submitting ? 'Zapisywanie...' : 'Zapisz zmiany grafiku'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- CELL EDIT MODAL (TABLE VIEW ONLY) --- */}
      {isCellModalOpen && cellEditData.day && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl">
            <div className="bg-brand-600 px-4 py-3 flex justify-between items-center text-white">
              <h3 className="font-bold text-sm truncate pr-2">Edytuj: {cellEditData.emp}</h3>
              <button onClick={() => setIsCellModalOpen(false)} className="p-1 hover:bg-brand-700 rounded-full transition shrink-0">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Dzień:</p>
                <p className="font-bold text-gray-800 dark:text-gray-100 capitalize text-sm">
                  {format(cellEditData.day, 'EEEE, d MMMM yyyy', { locale: pl })}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zmiana</label>
                <select 
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                  value={cellEditData.shiftType}
                  onChange={(e) => setCellEditData({...cellEditData, shiftType: e.target.value})}
                >
                  <option value="">Brak (Usuń zmianę z grafiku)</option>
                  <option value="dniowka">Dniówka (D)</option>
                  <option value="nocka">Nocka (N)</option>
                </select>
              </div>

              {cellEditData.shiftType !== '' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ilość godzin / Skrót (np. 12h, 6h1)</label>
                  <input 
                    type="text"
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 bg-white dark:bg-gray-800 dark:text-white"
                    value={cellEditData.time}
                    onChange={(e) => setCellEditData({...cellEditData, time: e.target.value})}
                    placeholder="np. 12h, 8h..."
                  />
                </div>
              )}

              <button 
                onClick={handleCellSave}
                disabled={submitting}
                className="w-full bg-brand-600 text-white font-bold py-3 mt-2 rounded-xl shadow-sm hover:bg-brand-700 transition disabled:opacity-50 text-sm"
              >
                {submitting ? 'Zapisywanie...' : 'Zapisz zmianę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { format, addDays } from 'date-fns';

export default function NotificationHandler() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    const checkShifts = async () => {
      try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            await Notification.requestPermission();
          }

          if (Notification.permission !== 'granted') return;

          const now = new Date();
          const todayDateKey = format(now, 'yyyy-MM-dd');
          const tomorrowDateKey = format(addDays(now, 1), 'yyyy-MM-dd');
          const currentMonthId = format(now, 'yyyy-MM');
          const tomorrowMonthId = format(addDays(now, 1), 'yyyy-MM');

          const userName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Pracownik';

          // Pobierz grafik(i)
          const schedDocs = {};
          
          const currentSchedDoc = await getDoc(doc(db, 'schedules', currentMonthId));
          schedDocs[currentMonthId] = currentSchedDoc.exists() && currentSchedDoc.data().isPublished ? currentSchedDoc.data().days || {} : null;

          if (currentMonthId !== tomorrowMonthId) {
            const tomorrowSchedDoc = await getDoc(doc(db, 'schedules', tomorrowMonthId));
            schedDocs[tomorrowMonthId] = tomorrowSchedDoc.exists() && tomorrowSchedDoc.data().isPublished ? tomorrowSchedDoc.data().days || {} : null;
          }

          const getShiftsForDate = (dateKey, monthId) => {
            const daysData = schedDocs[monthId];
            if (!daysData) return { dniowka: [], nocka: [] };
            return daysData[dateKey] || { dniowka: [], nocka: [] };
          };

          const todayShifts = getShiftsForDate(todayDateKey, currentMonthId);
          const tomorrowShifts = getShiftsForDate(tomorrowDateKey, tomorrowMonthId || currentMonthId);

          const checkAndNotify = (shiftName, shiftStartTime, dateKey) => {
            const timeDiff = shiftStartTime.getTime() - now.getTime();
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            // 12h before
            if (hoursDiff <= 12.5 && hoursDiff >= 11.5) {
              const storageKey = `notified_12h_${currentUser.uid}_${dateKey}_${shiftName}`;
              if (!localStorage.getItem(storageKey)) {
                new Notification(`ETOS Grafik: Zmiana za 12h!`, {
                  body: `Przypomnienie: Twoja zmiana (${shiftName}) zaczyna się za 12 godzin.`,
                  icon: "/vite.svg",
                  tag: storageKey
                });
                localStorage.setItem(storageKey, 'true');
              }
            }

            // 1h before
            if (hoursDiff <= 1.5 && hoursDiff >= 0.5) {
              const storageKey = `notified_1h_${currentUser.uid}_${dateKey}_${shiftName}`;
              if (!localStorage.getItem(storageKey)) {
                new Notification(`ETOS Grafik: Zmiana za 1h!`, {
                  body: `Przypomnienie: Twoja zmiana (${shiftName}) zaczyna się za godzinę.`,
                  icon: "/vite.svg",
                  tag: storageKey
                });
                localStorage.setItem(storageKey, 'true');
              }
            }
          };

          const todayDniowkaStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0);
          const todayNockaStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);
          const tomorrow = addDays(now, 1);
          const tomorrowDniowkaStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 6, 0, 0);
          const tomorrowNockaStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 18, 0, 0);

          if (todayShifts.dniowka.some(s => s.user === userName)) checkAndNotify('Dniówka', todayDniowkaStart, todayDateKey);
          if (todayShifts.nocka.some(s => s.user === userName)) checkAndNotify('Nocka', todayNockaStart, todayDateKey);
          if (tomorrowShifts.dniowka.some(s => s.user === userName)) checkAndNotify('Dniówka', tomorrowDniowkaStart, tomorrowDateKey);
          if (tomorrowShifts.nocka.some(s => s.user === userName)) checkAndNotify('Nocka', tomorrowNockaStart, tomorrowDateKey);

          // Ceny reminder
          if (todayShifts.dniowka.some(s => s.user === userName)) {
            const h = now.getHours();
            const m = now.getMinutes();
            const t = h + m / 60;

            const isMorningWindow = (t >= 8.0 && t <= 9.5);
            const isAfternoonWindow = (t >= 13.0 && t <= 14.5);

            if (isMorningWindow) {
              const storageKey = `notified_ceny_rano_${currentUser.uid}_${todayDateKey}`;
              if (!localStorage.getItem(storageKey)) {
                new Notification(`Przypomnienie o cenach`, {
                  body: `Jesteś na dniówce! Pamiętaj o wysłaniu cen.`,
                  icon: "/vite.svg",
                  tag: storageKey
                });
                localStorage.setItem(storageKey, 'true');
              }
            }

            if (isAfternoonWindow) {
              const storageKey = `notified_ceny_popoludnie_${currentUser.uid}_${todayDateKey}`;
              if (!localStorage.getItem(storageKey)) {
                new Notification(`Przypomnienie o cenach`, {
                  body: `Jesteś na dniówce! Pamiętaj o wysłaniu cen.`,
                  icon: "/vite.svg",
                  tag: storageKey
                });
                localStorage.setItem(storageKey, 'true');
              }
            }
          }
        }
      } catch (err) {
        console.warn('Notification check error:', err);
      }
    };

    // Sprawdź przy załadowaniu i co 15 minut
    checkShifts();
    const interval = setInterval(checkShifts, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [currentUser]);

  return null;
}

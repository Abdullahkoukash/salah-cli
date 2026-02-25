import notifier from 'node-notifier';
import { getMosque } from './config.js';
import { fetchTodayTimes, fetchMosqueCalendar, PRAYER_NAMES } from './api.js';


export async function getNextPrayer(mosque) {
    const data = await fetchTodayTimes(mosque.slug, mosque.name);
    if (!data || !data.times) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < data.times.length; i++) {
        if (!data.times[i]) continue;
        const [h, m] = data.times[i].split(':').map(Number);
        const prayerMinutes = h * 60 + m;
        if (prayerMinutes > currentMinutes) {
            return {
                name: PRAYER_NAMES[i],
                time: data.times[i],
                minutesLeft: prayerMinutes - currentMinutes,
            };
        }
    }

    try {
        const calendarData = await fetchMosqueCalendar(mosque.slug);
        if (calendarData && calendarData.calendar) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const monthKey = String(tomorrow.getMonth());
            const dayKey = String(tomorrow.getDate());
            const monthData = calendarData.calendar[monthKey] || calendarData.calendar[tomorrow.getMonth()];
            if (monthData) {
                const dayTimes = monthData[dayKey] || monthData[tomorrow.getDate()];
                if (dayTimes && Array.isArray(dayTimes) && dayTimes[0]) {
                    const [fh, fm] = dayTimes[0].split(':').map(Number);
                    const minsLeft = (1440 - currentMinutes) + fh * 60 + fm;
                    return {
                        name: 'Fajr',
                        time: dayTimes[0],
                        minutesLeft: minsLeft,
                        tomorrow: true,
                    };
                }
            }
        }
    } catch { }

    return null;
}


export function sendPrayerNotification(prayerName, prayerTime, minutesLeft, mosqueName) {
    const isNow = minutesLeft <= 0;
    const title = isNow
        ? `🕌 It's time for ${prayerName}!`
        : `🕌 ${prayerName} in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`;

    const message = isNow
        ? `${prayerName} at ${prayerTime} — ${mosqueName}`
        : `${prayerName} at ${prayerTime} — ${mosqueName}`;

    notifier.notify({
        title,
        message,
        sound: true,
        timeout: 10,
    });
}


export async function notifyNextPrayer() {
    const mosque = getMosque();
    if (!mosque) {
        return { ok: false, reason: 'no-mosque' };
    }

    const next = await getNextPrayer(mosque);
    if (!next) {
        return { ok: false, reason: 'no-times' };
    }

    sendPrayerNotification(next.name, next.time, next.minutesLeft, mosque.name);
    return { ok: true, prayer: next };
}

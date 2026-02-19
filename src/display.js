import chalk from 'chalk';
import Table from 'cli-table3';
import { resolveIqamaTime, PRAYER_NAMES, IQAMA_PRAYER_INDICES } from './api.js';

const theme = {
    primary: chalk.hex('#4FC3F7'),
    secondary: chalk.hex('#81C784'),
    accent: chalk.hex('#FFD54F'),
    muted: chalk.hex('#90A4AE'),
    white: chalk.white.bold,
    dim: chalk.dim,
    success: chalk.hex('#66BB6A'),
    warning: chalk.hex('#FFA726'),
    error: chalk.hex('#EF5350'),
    highlight: chalk.hex('#FF7043'),
    mosque: chalk.hex('#4DD0E1').bold,
    date: chalk.hex('#B0BEC5'),
};

function findNextPrayer(times) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < times.length; i++) {
        if (!times[i]) continue;
        const [h, m] = times[i].split(':').map(Number);
        if (h * 60 + m > currentMinutes) {
            return i;
        }
    }
    return -1;
}

export function renderDailyTable(mosqueData, tomorrowFajr = null) {
    const { name, localisation, times, iqama, jumua, jumua2, jumua3, iqamaEnabled } = mosqueData;

    const now = new Date();
    const isFriday = now.getDay() === 5;

    const nextPrayerIdx = findNextPrayer(times);

    const iqamaMap = { 0: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

    console.log();
    for (let i = 0; i < PRAYER_NAMES.length; i++) {
        const prayerName = PRAYER_NAMES[i];
        const adhanTime = times[i] || '--:--';
        const isNext = i === nextPrayerIdx;
        const isShurooq = i === 1;

        let line = '';
        if (isNext) {
            line += `  ${theme.highlight('▸')} ${theme.highlight.bold(prayerName.padEnd(10))}`;
            line += theme.highlight(adhanTime);
        } else if (isShurooq) {
            line += `    ${chalk.dim(prayerName.padEnd(10))}`;
            line += chalk.dim(adhanTime);
        } else {
            line += `    ${chalk.white(prayerName.padEnd(10))}`;
            line += chalk.white(adhanTime);
        }

        if (iqamaEnabled && !isShurooq && iqamaMap[i] !== undefined && iqama[iqamaMap[i]]) {
            const iqamaTime = resolveIqamaTime(adhanTime, iqama[iqamaMap[i]]);
            if (isNext) {
                line += `  ${chalk.dim('→')}  ${theme.highlight(iqamaTime)}`;
            } else {
                line += `  ${chalk.dim('→')}  ${theme.accent(iqamaTime)}`;
            }
        }

        console.log(line);
    }

    if (isFriday && jumua) {
        console.log();
        const jumuaTimes = [jumua, jumua2, jumua3].filter(Boolean);
        console.log(`  ${chalk.dim('Jumu\'ah:')} ${chalk.white.bold(jumuaTimes.join(', '))}`);
    }
    console.log();
}

export function renderMonthlyTable(calendarData, mosqueName, mosqueLocalisation) {
    const { calendar, iqamaCalendar } = calendarData;

    if (!calendar) {
        console.log(theme.error('\n  Could not retrieve the monthly calendar.\n'));
        return;
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    const year = now.getFullYear();

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const dateStr = `${monthNames[currentMonth]} ${year}`;

    console.log();
    console.log(`  ${chalk.white.bold(dateStr)}  ${chalk.dim('·')}  ${chalk.dim('Monthly Calendar')}`);
    console.log(`  ${chalk.dim('─'.repeat(48))}`);

    const monthKey = String(currentMonth);
    const monthData = calendar[monthKey] || calendar[currentMonth];

    if (!monthData) {
        console.log(theme.error(`\n  No calendar data available for ${monthNames[currentMonth]}.\n`));
        return;
    }

    const table = new Table({
        head: [
            chalk.dim('Day'),
            chalk.dim('Fajr'),
            chalk.dim('Shurooq'),
            chalk.dim('Dhuhr'),
            chalk.dim('Asr'),
            chalk.dim('Maghrib'),
            chalk.dim('Isha'),
        ],
        style: {
            head: [],
            border: ['gray'],
        },
        chars: {
            'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
            'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
            'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
            'right': '│', 'right-mid': '┤', 'middle': '│',
        },
        colWidths: [8, 10, 10, 10, 10, 10, 10],
        colAligns: ['center', 'center', 'center', 'center', 'center', 'center', 'center'],
    });

    const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dayKey = String(day);
        const dayTimes = monthData[dayKey] || monthData[day];

        if (!dayTimes || !Array.isArray(dayTimes)) continue;

        const isToday = day === currentDay;
        const colorFn = isToday ? theme.highlight : chalk.white;
        const dayLabel = isToday
            ? theme.highlight.bold(`▸${day}`)
            : chalk.dim(String(day));

        table.push([
            dayLabel,
            colorFn(dayTimes[0] || '—'),
            colorFn(dayTimes[1] || '—'),
            colorFn(dayTimes[2] || '—'),
            colorFn(dayTimes[3] || '—'),
            colorFn(dayTimes[4] || '—'),
            colorFn(dayTimes[5] || '—'),
        ]);
    }

    console.log(table.toString());
    console.log();
}

export function renderWeeklyTable(calendarData, mosqueName, mosqueLocalisation) {
    const { calendar } = calendarData;

    if (!calendar) {
        console.log(theme.error('\n  Could not retrieve the weekly calendar.\n'));
        return;
    }

    const now = new Date();
    const year = now.getFullYear();

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 6);
    const startStr = now.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const endStr = endDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    console.log();
    console.log(`  ${chalk.white.bold(`${startStr} – ${endStr}`)}  ${chalk.dim('·')}  ${chalk.dim('Weekly Overview')}`);
    console.log(`  ${chalk.dim('─'.repeat(48))}`);

    const table = new Table({
        head: [
            chalk.dim('Day'),
            chalk.dim('Date'),
            chalk.dim('Fajr'),
            chalk.dim('Shurooq'),
            chalk.dim('Dhuhr'),
            chalk.dim('Asr'),
            chalk.dim('Maghrib'),
            chalk.dim('Isha'),
        ],
        style: {
            head: [],
            border: ['gray'],
        },
        chars: {
            'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
            'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
            'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
            'right': '│', 'right-mid': '┤', 'middle': '│',
        },
        colWidths: [7, 8, 9, 9, 9, 9, 9, 9],
        colAligns: ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
    });

    for (let offset = 0; offset < 7; offset++) {
        const date = new Date(now);
        date.setDate(now.getDate() + offset);

        const month = date.getMonth();
        const day = date.getDate();
        const monthKey = String(month);
        const dayKey = String(day);

        const monthData = calendar[monthKey] || calendar[month];
        if (!monthData) continue;

        const dayTimes = monthData[dayKey] || monthData[day];
        if (!dayTimes || !Array.isArray(dayTimes)) continue;

        const isToday = offset === 0;
        const colorFn = isToday ? theme.highlight : chalk.white;
        const dayLabel = isToday
            ? theme.highlight.bold(`▸${dayNames[date.getDay()]}`)
            : chalk.dim(dayNames[date.getDay()]);
        const dateLabel = isToday
            ? theme.highlight(String(day))
            : chalk.dim(String(day));

        table.push([
            dayLabel,
            dateLabel,
            colorFn(dayTimes[0] || '—'),
            colorFn(dayTimes[1] || '—'),
            colorFn(dayTimes[2] || '—'),
            colorFn(dayTimes[3] || '—'),
            colorFn(dayTimes[4] || '—'),
            colorFn(dayTimes[5] || '—'),
        ]);
    }

    console.log(table.toString());
    console.log();
}

export function info(message) {
    console.log(`\n  ${theme.primary(message)}\n`);
}

export function success(message) {
    console.log(`\n  ${theme.success(message)}\n`);
}

export function warn(message) {
    console.log(`\n  ${theme.warning(message)}\n`);
}

export function error(message) {
    console.log(`\n  ${theme.error(message)}\n`);
}

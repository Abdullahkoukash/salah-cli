import { Command } from 'commander';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { searchMosques, fetchTodayTimes, fetchMosqueCalendar, detectLocation } from './api.js';
import { saveMosque, getMosque, clearConfig, getConfigPath } from './config.js';
import { renderDailyTable, renderMonthlyTable, renderWeeklyTable, info, success, warn, error } from './display.js';

const program = new Command();

program
    .name('salah')
    .description('Display daily prayer times (Adhan & Iqama) from Mawaqit mosques')
    .version('1.0.0');

program
    .option('-a, --all', 'Show the full monthly prayer calendar')
    .option('-w, --week', 'Show the weekly prayer calendar')
    .action(async (options) => {
        try {
            if (options.all || options.week) {
                const mosque = getMosque();
                if (!mosque) {
                    warn('No mosque configured yet.');
                    info('Run "salah" and select "Change mosque" to set up.');
                    return;
                }
                if (options.all) await showMonthlyView(mosque);
                if (options.week) await showWeeklyView(mosque);
                return;
            }

            await showMainMenu();
        } catch (err) {
            if (err.name === 'ExitPromptError') {
                console.log();
                return;
            }
            handleError(err);
        }
    });

program
    .command('config')
    .description('Configure your preferred mosque')
    .option('-c, --city <city>', 'Search for mosques in a city directly')
    .option('--clear', 'Clear saved configuration')
    .action(async (options) => {
        try {
            if (options.clear) {
                clearConfig();
                success('Configuration cleared.');
                return;
            }
            if (options.city) {
                await searchAndSelectMosque(options.city.trim());
                return;
            }
            await showConfigMenu();
        } catch (err) {
            if (err.name === 'ExitPromptError') {
                console.log();
                return;
            }
            handleError(err);
        }
    });

program
    .command('reset')
    .description('Reset saved mosque configuration')
    .action(() => {
        clearConfig();
        success('Configuration has been reset.');
    });

async function getTomorrowFajr(slug) {
    try {
        const calendarData = await fetchMosqueCalendar(slug);
        if (!calendarData || !calendarData.calendar) return null;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const monthKey = String(tomorrow.getMonth());
        const dayKey = String(tomorrow.getDate());
        const monthData = calendarData.calendar[monthKey] || calendarData.calendar[tomorrow.getMonth()];
        if (!monthData) return null;
        const dayTimes = monthData[dayKey] || monthData[tomorrow.getDate()];
        if (!dayTimes || !Array.isArray(dayTimes) || !dayTimes[0]) return null;
        return dayTimes[0];
    } catch {
        return null;
    }
}

async function showMainMenu() {
    const mosque = getMosque();

    process.stdout.write('\x1Bc');
    let row = 1;

    const g = chalk.hex('#66BB6A').bold;
    const logo = [
        g('  ███████╗ █████╗ ██╗      █████╗ ██╗  ██╗') + '  ' + chalk.hex('#FFD54F')('🌙'),
        g('  ██╔════╝██╔══██╗██║     ██╔══██╗██║  ██║'),
        g('  ███████╗███████║██║     ███████║███████║'),
        g('  ╚════██║██╔══██║██║     ██╔══██║██╔══██║'),
        g('  ███████║██║  ██║███████╗██║  ██║██║  ██║'),
        g('  ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝'),
    ];

    console.log(); row++;
    for (const line of logo) { console.log(line); row++; }
    console.log(`             ${chalk.dim('Prayer Times from Mawaqit | Made by Abdullah')}`); row++;
    console.log(); row++;
    console.log(chalk.dim('─'.repeat(60))); row++;

    if (mosque) {
        console.log(); row++;
        console.log(`  ${chalk.hex('#81C784').bold(mosque.name)}`); row++;
        if (mosque.localisation) {
            console.log(`  ${chalk.dim(mosque.localisation)}`); row++;
        }
    } else {
        console.log(); row++;
        console.log(`  ${chalk.hex('#FFA726')('No mosque configured — select "Change mosque" to get started.')}`); row++;
    }

    let allPrayers = [];
    let nextPrayerInfo = null;
    let tomorrowFajrTime = null;
    if (mosque) {
        try {
            const data = await fetchTodayTimes(mosque.slug, mosque.name);
            if (data && data.times) {
                const names = ['Fajr', 'Shurooq', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
                for (let i = 0; i < data.times.length; i++) {
                    if (!data.times[i]) continue;
                    const [h, m] = data.times[i].split(':').map(Number);
                    allPrayers.push({ name: names[i], time: data.times[i], minutes: h * 60 + m, index: i });
                }
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                for (const p of allPrayers) {
                    if (p.minutes > currentMinutes) {
                        nextPrayerInfo = { ...p, tomorrow: false };
                        break;
                    }
                }
                if (!nextPrayerInfo) {
                    tomorrowFajrTime = await getTomorrowFajr(mosque.slug);
                    if (tomorrowFajrTime) {
                        const [fh, fm] = tomorrowFajrTime.split(':').map(Number);
                        nextPrayerInfo = { name: 'Fajr', time: tomorrowFajrTime, minutes: fh * 60 + fm, tomorrow: true };
                    }
                }
            }
        } catch { }
    }

    const y = chalk.hex('#FFD54F');
    const r = chalk.hex('#EF5350').bold;

    const buildClockLine = () => {
        const n = new Date();
        const wd = n.toLocaleDateString('en-US', { weekday: 'long' });
        const ds = n.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
        const ts = n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return `  ${y.bold(wd)}  ${y('·')}  ${y(ds)}  ${y('·')}  ${y.bold(ts)}`;
    };

    let blinkState = null;

    const advanceToNextPrayer = () => {
        if (!nextPrayerInfo) return;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const curIdx = nextPrayerInfo.tomorrow ? -1
            : allPrayers.findIndex(p => p.name === nextPrayerInfo.name && p.minutes === nextPrayerInfo.minutes);

        let found = false;
        for (let i = curIdx + 1; i < allPrayers.length; i++) {
            if (allPrayers[i].minutes > currentMinutes) {
                nextPrayerInfo = { ...allPrayers[i], tomorrow: false };
                found = true;
                break;
            }
        }

        if (!found) {
            if (tomorrowFajrTime) {
                const [fh, fm] = tomorrowFajrTime.split(':').map(Number);
                nextPrayerInfo = { name: 'Fajr', time: tomorrowFajrTime, minutes: fh * 60 + fm, tomorrow: true };
            } else {
                nextPrayerInfo = null;
            }
        }
    };

    const buildCountdownLine = () => {
        if (blinkState) {
            const elapsed = Math.floor((Date.now() - blinkState.startedAt) / 1000);
            if (elapsed >= 10) {
                blinkState = null;
                advanceToNextPrayer();
            } else {
                const visible = elapsed % 2 === 0;
                if (visible) {
                    return `  ${r(`It's time for ${blinkState.prayerName}!`)}`;
                } else {
                    return '  ';
                }
            }
        }
        if (!nextPrayerInfo) return null;
        const n = new Date();
        const curMins = n.getHours() * 60 + n.getMinutes();
        const curSecs = n.getSeconds();
        let diffSecs;
        if (nextPrayerInfo.tomorrow) {
            diffSecs = ((1440 - curMins) + nextPrayerInfo.minutes) * 60 - curSecs;
        } else {
            diffSecs = (nextPrayerInfo.minutes - curMins) * 60 - curSecs;
        }
        if (diffSecs <= 0) {
            blinkState = { prayerName: nextPrayerInfo.name, startedAt: Date.now() };
            return `  ${r(`It's time for ${nextPrayerInfo.name}!`)}`;
        }
        const hrs = Math.floor(diffSecs / 3600);
        const mins = Math.floor((diffSecs % 3600) / 60);
        const secs = diffSecs % 60;
        const parts = [];
        if (hrs > 0) parts.push(`${hrs}h`);
        parts.push(`${mins}m`);
        parts.push(`${String(secs).padStart(2, '0')}s`);
        const tmrw = nextPrayerInfo.tomorrow ? ` ${y.bold('(tomorrow)')}` : '';
        return `  ${y('Next:')} ${y.bold(nextPrayerInfo.name)} ${y('at')} ${y.bold(nextPrayerInfo.time)} ${y('·')} ${y.bold(parts.join(' '))} ${y('remaining')}${tmrw}`;
    };

    console.log(); row++;
    const clockRow = row;
    console.log(buildClockLine()); row++;
    const countdownRow = row;
    const cdl = buildCountdownLine();
    if (cdl) { console.log(cdl); row++; }

    console.log(); row++;
    console.log(chalk.dim('─'.repeat(60))); row++;
    console.log(); row++;

    const clockInterval = setInterval(() => {
        try {
            process.stdout.write('\x1B7');
            process.stdout.write(`\x1B[${clockRow};1H`);
            process.stdout.write('\x1B[2K');
            process.stdout.write(buildClockLine());
            const cd = buildCountdownLine();
            if (cd !== null) {
                process.stdout.write(`\x1B[${countdownRow};1H`);
                process.stdout.write('\x1B[2K');
                process.stdout.write(cd);
            }
            process.stdout.write('\x1B8');
        } catch { }
    }, 1000);

    const choices = [];

    if (mosque) {
        choices.push(
            {
                name: "Today's prayer times",
                value: 'daily',
                description: 'View Adhan & Iqama for today',
            },
            {
                name: 'Weekly overview',
                value: 'weekly',
                description: 'Prayer times for the next 7 days',
            },
            {
                name: 'Monthly calendar',
                value: 'monthly',
                description: 'Full month prayer calendar',
            },
        );
    }

    choices.push({
        name: 'Change mosque',
        value: 'config',
        description: 'Search and select a different mosque',
    });

    if (mosque) {
        choices.push(
            {
                name: 'Current config',
                value: 'view',
                description: 'View saved mosque details',
            },
            {
                name: 'Reset config',
                value: 'reset',
                description: 'Clear your saved mosque',
            },
        );
    }

    choices.push({
        name: 'Exit',
        value: 'exit',
    });

    const action = await select({
        message: 'What would you like to do?',
        choices,
        pageSize: 12,
    });

    clearInterval(clockInterval);

    switch (action) {
        case 'daily':
            await showDailyView(mosque);
            await returnToMenu();
            break;

        case 'weekly':
            await showWeeklyView(mosque);
            await returnToMenu();
            break;

        case 'monthly':
            await showMonthlyView(mosque);
            await returnToMenu();
            break;

        case 'config':
            await showConfigMenu();
            break;

        case 'view':
            showCurrentConfig(mosque);
            await returnToMenu();
            break;

        case 'reset': {
            const confirm = await select({
                message: 'Are you sure you want to reset your mosque config?',
                choices: [
                    { name: 'No, go back', value: false },
                    { name: 'Yes, reset', value: true },
                ],
            });
            if (confirm) {
                clearConfig();
                success('Configuration has been reset.');
                await returnToMenu();
            } else {
                await showMainMenu();
            }
            break;
        }

        case 'exit':
            console.log(chalk.dim('\n  Assalamu Alaikum 👋 \n'));
            break;
    }
}

async function returnToMenu() {
    const action = await select({
        message: 'What next?',
        choices: [
            { name: 'Back to menu', value: 'menu' },
            { name: 'Exit', value: 'exit' },
        ],
    });

    if (action === 'menu') {
        await showMainMenu();
    } else {
        console.log(chalk.dim('\n  Assalamu Alaikum.\n'));
    }
}

async function showConfigMenu() {
    process.stdout.write('\x1Bc');
    console.log();
    console.log(chalk.dim('─'.repeat(52)));
    console.log(`  ${chalk.hex('#4DD0E1').bold('Mosque Search')}`);
    console.log(chalk.dim('─'.repeat(52)));
    console.log();

    const spinner = createSpinner();
    spinner.start('Detecting your location...');
    const location = await detectLocation();
    spinner.stop();

    let country = '';

    if (location) {
        console.log(`  Detected country: ${chalk.hex('#81C784').bold(location.country)}`);
        console.log();

        const useDetected = await select({
            message: `Use ${location.country} as your country?`,
            choices: [
                { name: `Yes, use ${location.country}`, value: 'yes' },
                { name: 'No, enter a different country', value: 'no' },
                { name: 'Back to menu', value: 'back' },
            ],
        });

        if (useDetected === 'back') {
            await showMainMenu();
            return;
        }

        if (useDetected === 'yes') {
            country = location.country;
        } else {
            country = await input({
                message: 'Enter country name:',
                validate: (val) => val.trim().length > 0 || 'Please enter a country name.',
            });
            country = country.trim();
        }
    } else {
        console.log(`  ${chalk.dim('Could not detect location automatically.')}`);
        console.log();
        country = await input({
            message: 'Enter your country:',
            validate: (val) => val.trim().length > 0 || 'Please enter a country name.',
        });
        country = country.trim();
    }

    console.log();
    const searchType = await select({
        message: `Search in ${chalk.hex('#81C784')(country)} by:`,
        choices: [
            { name: 'City name — show all mosques in a city', value: 'city' },
            { name: 'Mosque name — find a specific mosque', value: 'mosque' },
            { name: 'Change country', value: 'country' },
            { name: 'Back to menu', value: 'back' },
        ],
    });

    if (searchType === 'back') {
        await showMainMenu();
        return;
    }

    if (searchType === 'country') {
        await showConfigMenu();
        return;
    }

    const label = searchType === 'city' ? 'Enter city name:' : 'Enter mosque name (partial is fine):';
    const query = await input({
        message: label,
        validate: (val) => val.trim().length > 0 || 'Please enter a search term.',
    });

    await searchAndSelectMosque(query.trim(), country);
}

async function searchAndSelectMosque(query, country = null) {
    const spinner = createSpinner();
    const searchLabel = country ? `"${query}" in ${country}` : `"${query}"`;
    spinner.start(`Searching for ${searchLabel}...`);

    const mosques = await searchMosques(query, country);
    spinner.stop();

    if (mosques.length === 0) {
        error(`No mosques found for ${searchLabel}.`);
        console.log(chalk.dim(`    Tip: Mawaqit uses local city names, e.g.:`));
        console.log(chalk.dim(`         Köln (not Cologne), München (not Munich)`));
        console.log(chalk.dim(`         Try the city name in the local language.\n`));

        const tryAgain = await select({
            message: 'What would you like to do?',
            choices: [
                { name: 'Search again', value: 'retry' },
                { name: 'Back to menu', value: 'menu' },
            ],
        });

        if (tryAgain === 'retry') {
            await showConfigMenu();
        } else {
            await showMainMenu();
        }
        return;
    }

    const countryLabel = country ? ` in ${country}` : '';
    info(`Found ${mosques.length} mosque(s)${countryLabel}:`);

    const choices = mosques.map((m) => ({
        name: `${chalk.white.bold(m.name)}  ${chalk.dim('—')}  ${chalk.dim(m.localisation || 'No address')}`,
        value: m.slug,
    }));

    choices.push(
        { name: chalk.dim('─'.repeat(40)), value: '__sep', disabled: true },
        { name: 'Search again', value: '__retry' },
        { name: 'Back to menu', value: '__menu' },
    );

    const selectedSlug = await select({
        message: 'Select your mosque:',
        choices,
        pageSize: 15,
    });

    if (selectedSlug === '__retry') {
        await showConfigMenu();
        return;
    }
    if (selectedSlug === '__menu') {
        await showMainMenu();
        return;
    }

    const selectedMosque = mosques.find((m) => m.slug === selectedSlug);
    if (!selectedMosque) {
        error('Selection failed. Please try again.');
        return;
    }

    saveMosque(selectedMosque);

    console.log();
    console.log(chalk.dim('─'.repeat(52)));
    console.log(`  ${chalk.hex('#66BB6A').bold('Mosque saved successfully!')}`);
    console.log();
    console.log(`  ${chalk.white.bold(selectedMosque.name)}`);
    console.log(`  ${chalk.dim(selectedMosque.localisation || '—')}`);
    console.log(chalk.dim('─'.repeat(52)));

    info("Here are today's prayer times:");
    renderDailyTable(selectedMosque);

    await returnToMenu();
}

function showCurrentConfig(mosque) {
    console.log();
    console.log(chalk.dim('─'.repeat(52)));
    console.log(`  ${chalk.hex('#81C784').bold('Current Configuration')}`);
    console.log(chalk.dim('─'.repeat(52)));
    console.log();
    console.log(`  ${chalk.dim('Mosque:')}     ${chalk.white.bold(mosque.name)}`);
    console.log(`  ${chalk.dim('Location:')}   ${chalk.white(mosque.localisation || '—')}`);
    console.log(`  ${chalk.dim('Slug:')}       ${chalk.dim(mosque.slug)}`);
    console.log(`  ${chalk.dim('Config:')}     ${chalk.dim(getConfigPath())}`);
    console.log();
}

async function showDailyView(mosque) {
    const spinner = createSpinner();
    spinner.start('Fetching prayer times...');

    const data = await fetchTodayTimes(mosque.slug, mosque.name);
    spinner.stop();

    if (!data) {
        error('Could not fetch today\'s prayer times.');
        info('The mosque may have been removed. Try "Change mosque".');
        return;
    }

    const tomorrowFajr = await getTomorrowFajr(mosque.slug);
    renderDailyTable(data, tomorrowFajr);
}

async function showWeeklyView(mosque) {
    const spinner = createSpinner();
    spinner.start('Fetching weekly calendar...');

    const calendarData = await fetchMosqueCalendar(mosque.slug);
    spinner.stop();

    renderWeeklyTable(calendarData, mosque.name, mosque.localisation);
}

async function showMonthlyView(mosque) {
    const spinner = createSpinner();
    spinner.start('Fetching monthly calendar...');

    const calendarData = await fetchMosqueCalendar(mosque.slug);
    spinner.stop();

    renderMonthlyTable(calendarData, mosque.name, mosque.localisation);
}

function createSpinner() {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let interval = null;
    let frameIdx = 0;

    return {
        start(message) {
            frameIdx = 0;
            interval = setInterval(() => {
                process.stdout.write(`\r  ${chalk.cyan(frames[frameIdx])} ${chalk.dim(message)}`);
                frameIdx = (frameIdx + 1) % frames.length;
            }, 80);
        },
        stop() {
            if (interval) {
                clearInterval(interval);
                interval = null;
                process.stdout.write('\r' + ' '.repeat(60) + '\r');
            }
        },
    };
}

function handleError(err) {
    if (err.code === 'ENOTFOUND' || err.code === 'FETCH_ERROR' || err.type === 'system') {
        error('Network error. Please check your internet connection.');
    } else if (err.message) {
        error(err.message);
    } else {
        error('An unexpected error occurred.');
    }

    if (process.env.DEBUG) {
        console.error(err);
    }
}

export function run() {
    program.parse(process.argv);
}

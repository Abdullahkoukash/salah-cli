
import { getMosque } from './config.js';
import { getNextPrayer, sendPrayerNotification } from './notify.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PID_FILE = path.join(os.homedir(), '.salah-cli-daemon.pid');
const LOG_FILE = path.join(os.homedir(), '.salah-cli-daemon.log');

const MINUTES_BEFORE = parseInt(process.argv[2], 10) || 10;
const CHECK_INTERVAL_MS = 60 * 1000;

function log(msg) {
    const ts = new Date().toLocaleString();
    const line = `[${ts}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch { }
}

fs.writeFileSync(PID_FILE, String(process.pid));
log(`Daemon started (PID ${process.pid}, notify ${MINUTES_BEFORE}min before)`);

const notifiedPrayers = new Set();

function resetAtMidnight() {
    const now = new Date();
    const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

    setTimeout(() => {
        notifiedPrayers.clear();
        log('Midnight reset — cleared notification history');
        resetAtMidnight();
    }, msUntilMidnight + 1000);
}
resetAtMidnight();

async function check() {
    try {
        const mosque = getMosque();
        if (!mosque) {
            log('No mosque configured, skipping check');
            return;
        }

        const next = await getNextPrayer(mosque);
        if (!next) {
            log('Could not determine next prayer');
            return;
        }

        const key = `${next.name}-${next.time}-${next.tomorrow ? 'tmrw' : 'today'}`;

        if (next.minutesLeft <= MINUTES_BEFORE && !notifiedPrayers.has(key + '-before')) {
            log(`Sending notification: ${next.name} at ${next.time} (${next.minutesLeft}min left)`);
            sendPrayerNotification(next.name, next.time, next.minutesLeft, mosque.name);
            notifiedPrayers.add(key + '-before');
        }

        if (next.minutesLeft <= 0 && !notifiedPrayers.has(key + '-now')) {
            log(`Sending notification: ${next.name} NOW`);
            sendPrayerNotification(next.name, next.time, 0, mosque.name);
            notifiedPrayers.add(key + '-now');
        }
    } catch (err) {
        log(`Error during check: ${err.message}`);
    }
}

check();

const interval = setInterval(check, CHECK_INTERVAL_MS);

function cleanup() {
    log('Daemon stopping');
    clearInterval(interval);
    try {
        fs.unlinkSync(PID_FILE);
    } catch { }
    process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

process.stdin.resume();

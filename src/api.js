import fetch from 'node-fetch';

const BASE_URL = 'https://mawaqit.net';
const SEARCH_URL = `${BASE_URL}/api/2.0/mosque/search`;

function fixRtl(text) {
    if (!text) return text;
    const hasRtl = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/.test(text);
    if (!hasRtl) return text;
    return `\u202A${text}\u202C`;
}

export async function detectLocation() {
    try {
        const res = await fetch('http://ip-api.com/json/?fields=country,countryCode,city', {
            headers: { 'User-Agent': 'salah-cli/1.0' },
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.country && data.city) return data;
        return null;
    } catch {
        return null;
    }
}

export async function searchMosques(query, countryFilter = null) {
    const url = `${SEARCH_URL}?word=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'salah-cli/1.0',
            'Accept': 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(`Search failed (HTTP ${res.status}). Please try again.`);
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    let results = data.map((m) => ({
        uuid: m.uuid,
        name: fixRtl(m.name),
        slug: m.slug,
        localisation: fixRtl(m.localisation || ''),
        localisationRaw: m.localisation || '',
        latitude: m.latitude,
        longitude: m.longitude,
        times: m.times || [],
        iqama: m.iqama || [],
        jumua: m.jumua || null,
        jumua2: m.jumua2 || null,
        jumua3: m.jumua3 || null,
        iqamaEnabled: m.iqamaEnabled ?? false,
        image: m.image || null,
    }));

    if (countryFilter) {
        const cf = countryFilter.toLowerCase();
        results = results.filter((m) =>
            m.localisationRaw.toLowerCase().includes(cf)
        );
    }

    return results;
}

export async function fetchMosqueCalendar(slug) {
    const url = `${BASE_URL}/en/${slug}`;

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'salah-cli/1.0',
            'Accept': 'text/html',
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch mosque page (HTTP ${res.status}).`);
    }

    const html = await res.text();

    const confDataMatch = html.match(/(?:let|var|const)\s+confData\s*=\s*(\{.+?\});/s);

    if (!confDataMatch) {
        throw new Error('Could not extract prayer calendar data from the mosque page.');
    }

    let confData;
    try {
        confData = JSON.parse(confDataMatch[1]);
    } catch {
        throw new Error('Failed to parse prayer calendar data.');
    }

    return {
        calendar: confData.calendar || null,
        iqamaCalendar: confData.iqamaCalendar || null,
        spiTimes: confData.spiTimes || null,
        jumua: confData.jumua || null,
        jumua2: confData.jumua2 || null,
        jumuaAsDuhr: confData.jumuaAsDuhr || false,
        name: fixRtl(confData.name || null),
        localisation: fixRtl(confData.localisation || null),
        hijriAdjustment: confData.hijriAdjustment || 0,
    };
}

export async function fetchTodayTimes(slug, name) {
    const trySearch = async (query) => {
        if (!query || !query.trim()) return null;
        const results = await searchMosques(query.trim());
        return results.find((m) => m.slug === slug) || null;
    };

    const slugParts = slug.split('-');
    const cityWord = slugParts.slice().reverse().find(p => p.length > 3 && !/^\d+$/.test(p) && p !== 'germany' && p !== 'france' && p !== 'austria' && p !== 'switzerland');
    if (cityWord) {
        const found = await trySearch(cityWord);
        if (found) return found;
    }

    const tailQuery = slugParts.slice(-3).join(' ');
    const found2 = await trySearch(tailQuery);
    if (found2) return found2;

    const cleanName = (name || '').replace(/[\u202A\u202B\u202C\u202D\u202E\u200F\u200E]/g, '').trim();
    if (cleanName) {
        const found3 = await trySearch(cleanName);
        if (found3) return found3;
    }

    return null;
}

export function resolveIqamaTime(adhanTime, iqamaValue) {
    if (!iqamaValue || iqamaValue === '0' || iqamaValue === '+0') {
        return adhanTime;
    }

    const offsetMatch = iqamaValue.match(/^\+(\d+)$/);
    if (offsetMatch) {
        const offsetMinutes = parseInt(offsetMatch[1], 10);
        const [hours, minutes] = adhanTime.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes + offsetMinutes;
        const newHours = Math.floor(totalMinutes / 60) % 24;
        const newMinutes = totalMinutes % 60;
        return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
    }

    if (/^\d{1,2}:\d{2}$/.test(iqamaValue)) {
        return iqamaValue;
    }

    return adhanTime;
}

export const PRAYER_NAMES = ['Fajr', 'Shurooq', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export const IQAMA_PRAYER_INDICES = [0, 2, 3, 4, 5];

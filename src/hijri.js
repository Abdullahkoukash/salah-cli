const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-tbla', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    era: 'short',
});

export function getHijriDateString(date = new Date(), adjustment = 0) {
    const adjusted = new Date(date);
    if (adjustment) {
        adjusted.setDate(adjusted.getDate() + adjustment);
    }

    const parts = formatter.formatToParts(adjusted);
    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';

    return `${day} ${month} ${year} AH`;
}

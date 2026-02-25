import Conf from 'conf';

const config = new Conf({
    projectName: 'salah-cli',
    schema: {
        mosque: {
            type: 'object',
            properties: {
                slug: { type: 'string' },
                name: { type: 'string' },
                uuid: { type: 'string' },
                localisation: { type: 'string' },
            },
        },
        notifyMinutes: {
            type: 'number',
            default: 10,
        },
    },
});

export function saveMosque(mosque) {
    config.set('mosque', {
        slug: mosque.slug,
        name: mosque.name,
        uuid: mosque.uuid,
        localisation: mosque.localisation || '',
    });
}

export function getMosque() {
    const mosque = config.get('mosque');
    if (!mosque || !mosque.slug) {
        return null;
    }
    return mosque;
}

export function clearConfig() {
    config.clear();
}

export function getConfigPath() {
    return config.path;
}

export function getNotifyMinutes() {
    return config.get('notifyMinutes') || 10;
}

export function setNotifyMinutes(minutes) {
    config.set('notifyMinutes', minutes);
}

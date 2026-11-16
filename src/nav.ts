/** Reads a value from the part of the hash after "?", e.g. #/swap?from=TSLA */
export const hashParam = (key: string) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(key)
export const go = (path: string) => { location.hash = '#/' + path }

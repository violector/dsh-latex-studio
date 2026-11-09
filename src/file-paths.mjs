export const isWithinPath = (path, parent) => path === parent || path.startsWith(parent + '/');
export const remapPath = (path, from, to) => isWithinPath(path, from) ? to + path.slice(from.length) : path;

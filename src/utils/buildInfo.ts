const normalizeVersion = (version: string) => version.replace(/(\.0)+$/, '');

export const appVersion = `v${normalizeVersion(__APP_VERSION__)}`;
export const buildNumber = __BUILD_NUMBER__.trim();
export const displayVersion = buildNumber ? `${appVersion}+build.${buildNumber}` : appVersion;

import type { Response, CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'token';
export const AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Generates standardized cookie options for the authentication JWT cookie.
 *
 * @param isProduction - Whether application is running in production mode (controls Secure flag)
 * @returns Express-compatible CookieOptions
 */
export function getAuthCookieOptions(
  isProduction: boolean = process.env.NODE_ENV === 'production'
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

/**
 * Generates standardized cookie clearing options matching the original cookie's scope.
 * Path, sameSite, secure, and httpOnly must match the set attributes for clean removal.
 *
 * @param isProduction - Whether application is running in production mode
 * @returns Express-compatible CookieOptions for clearCookie
 */
export function getClearAuthCookieOptions(
  isProduction: boolean = process.env.NODE_ENV === 'production'
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * Sets the HttpOnly authentication JWT cookie on an Express response.
 *
 * @param res - Express Response object
 * @param token - Signed JWT string
 * @param isProduction - Explicit production override flag (defaults to process.env.NODE_ENV === 'production')
 */
export function setAuthCookie(
  res: Response,
  token: string,
  isProduction: boolean = process.env.NODE_ENV === 'production'
): void {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions(isProduction));
}

/**
 * Clears the HttpOnly authentication JWT cookie from an Express response with identical scope flags.
 *
 * @param res - Express Response object
 * @param isProduction - Explicit production override flag (defaults to process.env.NODE_ENV === 'production')
 */
export function clearAuthCookie(
  res: Response,
  isProduction: boolean = process.env.NODE_ENV === 'production'
): void {
  res.clearCookie(AUTH_COOKIE_NAME, getClearAuthCookieOptions(isProduction));
}

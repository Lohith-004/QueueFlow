import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
  setAuthCookie,
  clearAuthCookie,
} from '../../src/utils/cookies.js';

describe('Cookie Utilities (server/src/utils/cookies.ts)', () => {
  it('should use consistent cookie name and max age', () => {
    expect(AUTH_COOKIE_NAME).toBe('token');
    expect(AUTH_COOKIE_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000); // 86,400,000 ms
  });

  describe('getAuthCookieOptions', () => {
    it('should configure HttpOnly, SameSite=Lax, Path=/, and Secure=true in production', () => {
      const options = getAuthCookieOptions(true);

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(86400000);
    });

    it('should configure Secure=false in local development', () => {
      const options = getAuthCookieOptions(false);

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
      expect(options.maxAge).toBe(86400000);
    });
  });

  describe('getClearAuthCookieOptions', () => {
    it('should match auth cookie scope with HttpOnly, SameSite=Lax, Path=/, and matching Secure flag', () => {
      const prodOptions = getClearAuthCookieOptions(true);
      expect(prodOptions.httpOnly).toBe(true);
      expect(prodOptions.secure).toBe(true);
      expect(prodOptions.sameSite).toBe('lax');
      expect(prodOptions.path).toBe('/');
      expect(prodOptions.maxAge).toBeUndefined();

      const devOptions = getClearAuthCookieOptions(false);
      expect(devOptions.httpOnly).toBe(true);
      expect(devOptions.secure).toBe(false);
      expect(devOptions.sameSite).toBe('lax');
      expect(devOptions.path).toBe('/');
      expect(devOptions.maxAge).toBeUndefined();
    });
  });

  describe('setAuthCookie & clearAuthCookie', () => {
    it('should call res.cookie with AUTH_COOKIE_NAME and generated options', () => {
      const mockRes = {
        cookie: vi.fn(),
      } as unknown as Response;

      const dummyToken = 'dummy.jwt.token';
      setAuthCookie(mockRes, dummyToken, false);

      expect(mockRes.cookie).toHaveBeenCalledOnce();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        dummyToken,
        getAuthCookieOptions(false)
      );
    });

    it('should call res.clearCookie with AUTH_COOKIE_NAME and matching clear options', () => {
      const mockRes = {
        clearCookie: vi.fn(),
      } as unknown as Response;

      clearAuthCookie(mockRes, true);

      expect(mockRes.clearCookie).toHaveBeenCalledOnce();
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        AUTH_COOKIE_NAME,
        getClearAuthCookieOptions(true)
      );
    });
  });
});

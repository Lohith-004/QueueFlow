export const BUSINESS_HOURS = {
  OPEN_TIME: '09:00',
  CLOSE_TIME: '17:00',
  DEFAULT_TIMEZONE: 'UTC',
  CLOSED_DAYS_OF_WEEK: [0, 6], // 0 = Sunday, 6 = Saturday
} as const;

export const TICKET_CONFIG = {
  PREFIX: 'A-',
  PADDING_LENGTH: 3,
} as const;

export const AUTH_CONFIG = {
  COOKIE_NAME: 'token',
  TOKEN_EXPIRY_SECONDS: 24 * 60 * 60, // 24 hours
  BCRYPT_SALT_ROUNDS: 10,
} as const;

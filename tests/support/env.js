export function requiredEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return process.env[name];
}

export const adminConfig = {
  baseUrl: process.env.ADMIN_BASE_URL || 'https://admin.calibee.vn',
  email: requiredEnv('ADMIN_EMAIL'),
  password: requiredEnv('ADMIN_PASSWORD'),
};

export const bookingConfig = {
  serviceMode: process.env.BOOKING_SERVICE_MODE || 'fixed',
  service: process.env.BOOKING_SERVICE || 'basic_cleaning',
  customerQuery: process.env.CUSTOMER_QUERY || 'CUS-1 | Calibee Support |',
  shouldUpdateStatus: process.env.UPDATE_BOOKING_STATUS === 'true',
  timeoutMs: Number(process.env.TEST_TIMEOUT_MS || 300000),
  calculateOnly: process.env.CALCULATE_ONLY === 'true',
  timeMode: process.env.BOOKING_TIME_MODE || 'fixed',
  minDurationHours: Number(process.env.BOOKING_MIN_DURATION_HOURS || 2),
  maxDurationHours: Number(process.env.BOOKING_MAX_DURATION_HOURS || 8),
  startTime: process.env.BOOKING_START_TIME || '09:00',
  endTime: process.env.BOOKING_END_TIME || '11:00',
};

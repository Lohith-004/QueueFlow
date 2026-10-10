export enum AppointmentStatus {
  BOOKED = 'BOOKED',
  CHECKED_IN = 'CHECKED_IN',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export interface IAvailableSlot {
  startTime: string; // '09:00'
  endTime: string; // '09:30' (startTime + durationMinutes)
  serviceId: string;
  date: string; // 'YYYY-MM-DD'
}

export interface IAppointmentSummary {
  id: string;
  customerId: string;
  serviceId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt: string;
}

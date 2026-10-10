export enum TicketStatus {
  WAITING = 'WAITING',
  CALLED = 'CALLED',
  SERVING = 'SERVING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export interface IQueueTicketSummary {
  id: string;
  ticketNumber: string; // 'A-001'
  sequenceNumber: number;
  queueDate: string; // 'YYYY-MM-DD'
  serviceId: string;
  customerId?: string;
  customerName: string; // Redacted from public feeds
  status: TicketStatus;
  counterName?: string;
  servedBy?: string;
  checkInTime: string;
  calledAt?: string;
}

// Zero PII payload for public display boards & public socket feed
export interface IPublicQueueSummary {
  queueDate: string;
  nowServing: Array<{
    ticketNumber: string;
    counterName: string;
    serviceName: string;
  }>;
  nextInLine: string[];
  totalWaiting: number;
}

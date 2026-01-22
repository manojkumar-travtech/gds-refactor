export interface FlightInfo {
  airline?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  date?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  bookingClass?: string;
  status?: string;
  seatNumber?: string | null;
  bookingReference?: string;
  ticketNumber?: string;
  fare?: {
    total?: string;
    currency?: string;
  };
  notes?: string;
  rawData?: any;
  departure?: string;
  classOfService?: string | null;
}

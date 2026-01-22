export interface CarRentalSegment {
  company?: string | null | undefined;
  confirmation?: string | null | undefined;
  confirmationNumber?: string | null | undefined;
  carType?: string;
  pickupLocation?: string | null | undefined;
  pickupDate?: string;
  pickupTime?: string;
  returnLocation?: string;
  returnDate?: string;
  returnTime?: string;
  dailyRate?: number | string;
  currency?: string;
  rawData?: any;
  // Additional optional fields
  vendor?: string;
  vehicleClass?: string;
  transmissionType?: string;
  numberOfDays?: number;
  totalCost?: number | string;
  status?: string;
  specialInstructions?: string;
  metadata?: Record<string, any>;
  dropoffLocation?: string | null | undefined;
  vehicleType?: string | null | undefined;
  rate?: string | null | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
}

export interface CarRentalData {
  id: string;
  pnr_number: string;
  company: string;
  confirmation_number: string;
  car_type: string;
  pickup_location: string;
  pickup_date: string;
  pickup_time: string;
  return_location: string;
  return_date: string;
  return_time: string;
  daily_rate: number;
  currency: string;
  raw_data: any;
}

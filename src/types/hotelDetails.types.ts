export interface HotelSegment {
  name?: string | null | undefined;
  hotelName?: string;
  confirmation?: string | null | undefined;
  confirmationNumber?: string | null | undefined;
  details?: string;
  address?: any;
  city?: string;
  country?: string;
  checkInDate?: string | null | undefined;
  checkIn?: string | null | undefined;
  checkOutDate?: string | null | undefined;
  checkOut?: string | null | undefined;
  roomType?: string | null | undefined;
  room_type?: string;
  numberOfRooms?: number;
  rate?: string | number | null | undefined;
  dailyRate?: number;
  currency?: string;
  status?: string;
  specialRequests?: string;
  ratePlan?: string;
  rawData?: any;
  metadata?: Record<string, any>;
  hotelChain?: string | null;
}

export interface HotelData {
  id: string;
  trip_id: string | null;
  confirmation_number: string;
  hotel_name: string;
  hotel_chain: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  check_in_date: string;
  check_out_date: string;
  room_type: string;
  number_of_rooms: number;
  booking_reference: string;
  cost: number;
  currency: string;
  status: string;
  special_requests: string | null;
  metadata: Record<string, any>;
}

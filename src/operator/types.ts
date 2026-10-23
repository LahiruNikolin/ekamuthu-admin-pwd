export interface OperatorCourt {
  id: string;
  name: string;
  address?: string;
  timezone?: string;
  sport_types?: string[];
  image_urls?: string[];
  is_active?: boolean;
}

export interface OperatorPlayArea {
  id: string;
  name: string;
  sport_types?: string[];
  surface?: string;
  booking_mode?: "slot_based" | "flexible";
  show_in_player_app?: boolean;
}

export interface OperatorCalendarBlock {
  admin_contact_name?: string;
  admin_contact_phone?: string;
  locked_by_game?: string;
  recurring_booking_kind?: string;
  admin_assigned_player?: { name?: string };
  booking_creator?: { name?: string };
  reservation_note?: string;
  id: string;
  court_id: string;
  court_name: string;
  starts_at: string;
  ends_at: string;
  price: number;
  status: string;
  booking_type?: string;
  booking_mode?: "slot_based" | "flexible";
  game_status?: string;
  play_area_id?: string;
  play_area_name?: string;
  reservation_purpose?: string;
  admin_outcome?: string;
  is_recurring?: boolean;
}

export interface OperatorAnalytics {
  total_slots: number;
  booked_slots: number;
  occupancy_rate: number;
  revenue_confirmed: number;
  revenue_potential: number;
  games_by_status: {
    confirmed: number;
    ongoing?: number;
    completed: number;
    cancelled: number;
    no_show: number;
  };
}

export interface OperatorGame {
  court_name?: string;
  flagged_player_count?: number;
  id: string;
  status: string;
  starts_at: string;
  court_id: string;
  max_players?: number;
}

export interface OperatorNotification {
  id: string;
  payload: { title?: string; body?: string };
  type: string;
  read_at?: string | null;
  created_at: string;
}

export type OperatorContextValue = {
  courtsLoading: boolean;
  courtsError: boolean;
  retryCourts: () => void;
  courts: OperatorCourt[];
  selectedCourtId: string;
  selectedCourt?: OperatorCourt;
  setSelectedCourtId: (id: string) => void;
};

import { create } from "zustand";
import api from "../api/axios";

export const useDriverStore = create((set, get) => ({
  drivers: [],
  filteredDrivers: [],
  loading: false,
  locationFilter: "",

  fetchDrivers: async () => {
    set({ loading: true });
    try {
      const res = await api.get("drivers/");
      set({
        drivers: res.data,
        filteredDrivers: res.data,
        loading: false,
      });
    } catch (error) {
      console.error("Fetch drivers error:", error);
      set({ loading: false });
    }
  },

  setLocationFilter: (location) => {
    const { drivers } = get();
    const search = location.toLowerCase();

    const filtered = drivers.filter((driver) =>
      driver.district.toLowerCase().includes(search) ||
      driver.taluk.toLowerCase().includes(search) ||
      driver.panchayath_name.toLowerCase().includes(search)
    );

    set({
      locationFilter: location,
      filteredDrivers: filtered,
    });
  },
}));

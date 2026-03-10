import api from "./axios";

export const contactDriver = (driverId) => {
  return api.post(`drivers/${driverId}/contact/`);
};


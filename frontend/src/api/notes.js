import axios from "axios";

const API_URL = "http://127.0.0.1:8000/notes";

export const getNotes = async (token) => {
  const response = await axios.get(`${API_URL}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const createNote = async (note, token) => {
  const response = await axios.post(`${API_URL}/`, note, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

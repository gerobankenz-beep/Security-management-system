import axios from 'axios';

// Create an axios instance that points to the backend.
const apiClient = axios.create({
  // Uses the VITE_API_URL from your .env file.
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1',
  timeout: 10000,
});

// Automatically attach the JWT token to every request.
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = ['Bearer', token].join(' ');
  }
  return config;
});

// Handle expired tokens globally.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export { apiClient };

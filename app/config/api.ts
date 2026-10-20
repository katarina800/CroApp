// app/config/api.ts

// 🔥 KORISTI OVU IP ADRESU (tvoja Wi-Fi IP)
const YOUR_COMPUTER_IP = "10.33.74.205"; // 🔹 tvoj laptop IP
const BACKEND_PORT = "7089";

const getBaseUrl = () => {
  if (__DEV__) {
    return "https://cromap.onrender.com";
  }
  return "https://cromap.onrender.com";
};

export const API_BASE_URL = getBaseUrl();

console.log("🌐 API URL:", API_BASE_URL);

// 🔥 SVI API ENDPOINTI
export const API_ENDPOINTS = {
  // AUTH
  REGISTER: `${API_BASE_URL}/api/auth/register`,
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  USERS: `${API_BASE_URL}/api/auth/users`,
  USER_BY_ID: (id: number) => `${API_BASE_URL}/api/auth/users/${id}`,
  GOOGLE_AUTH: `${API_BASE_URL}/api/auth/google`,
  COMPLETE_PROFILE: `${API_BASE_URL}/api/auth/complete-profile`,
  SET_PASSWORD: `${API_BASE_URL}/api/auth/set-password`,
  UPDATE_LANGUAGE: `${API_BASE_URL}/api/auth/language`,
  VERIFY_EMAIL: `${API_BASE_URL}/api/auth/verify-email`,
  RESEND_VERIFICATION: `${API_BASE_URL}/api/auth/resend-verification`,
  FORGOT_PASSWORD: `${API_BASE_URL}/api/auth/forgot-password`,
  VERIFY_RESET_CODE: `${API_BASE_URL}/api/auth/verify-reset-code`,
  RESET_PASSWORD: `${API_BASE_URL}/api/auth/reset-password`,
  // 204 dok je prijava valjana, 401 kad je poništena (npr. reset lozinke).
  SESSION: `${API_BASE_URL}/api/auth/session`,

  // VIDEO
  VIDEOS: `${API_BASE_URL}/api/video`,
  VIDEO_BY_ID: (id: number) => `${API_BASE_URL}/api/video/${id}`,
  VIDEOS_BY_USER: (userId: number) =>
    `${API_BASE_URL}/api/video/user/${userId}`,
  DELETE_VIDEO: (videoId: number, userId: number) =>
    `${API_BASE_URL}/api/video/${videoId}/user/${userId}`,
  UPLOAD_VIDEO: `${API_BASE_URL}/api/video/upload`,
  UPDATE_VIDEO: `${API_BASE_URL}/api/video`,

  // LIKE
  LIKE_TOGGLE: `${API_BASE_URL}/api/like/toggle`,
  LIKE_COUNT: (videoId: number) => `${API_BASE_URL}/api/like/count/${videoId}`,
  IS_LIKED: (videoId: number, userId: number) =>
    `${API_BASE_URL}/api/like/isliked?videoId=${videoId}&userId=${userId}`,
  USER_LIKES: (userId: number) => `${API_BASE_URL}/api/like/user/${userId}`,

  // COMMENT
  COMMENTS_BY_VIDEO: (videoId: number) =>
    `${API_BASE_URL}/api/comment/video/${videoId}`,
  ADD_COMMENT: `${API_BASE_URL}/api/comment`,
  DELETE_COMMENT: (commentId: number, userId: number) =>
    `${API_BASE_URL}/api/comment/${commentId}?userId=${userId}`,

  // SAVED VIDEO
  IS_SAVED: (videoId: number, userId: number) =>
    `${API_BASE_URL}/api/savedvideo/is-saved?videoId=${videoId}&userId=${userId}`,
  SAVE_VIDEO: `${API_BASE_URL}/api/savedvideo/save`,
  UNSAVE_VIDEO: (videoId: number, userId: number) =>
    `${API_BASE_URL}/api/savedvideo/unsave?videoId=${videoId}&userId=${userId}`,
  SAVED_VIDEOS_BY_USER: (userId: number) =>
    `${API_BASE_URL}/api/savedvideo/user/${userId}`,

  // SHARE
  ADD_SHARE: `${API_BASE_URL}/api/share/add`,
  SHARES_BY_VIDEO: (videoId: number) =>
    `${API_BASE_URL}/api/share/video/${videoId}`,
  SHARES_BY_USER: (userId: number) =>
    `${API_BASE_URL}/api/share/user/${userId}`,

  // WISHLIST
  WISHLIST_BY_USER: (userId: number) =>
    `${API_BASE_URL}/api/wishlistvideo/user/${userId}`,
  IS_IN_WISHLIST: (userId: number, videoId: number) =>
    `${API_BASE_URL}/api/wishlistvideo/check?userId=${userId}&videoId=${videoId}`,
  ADD_TO_WISHLIST: `${API_BASE_URL}/api/wishlistvideo/add`,
  REMOVE_FROM_WISHLIST: (userId: number, videoId: number) =>
    `${API_BASE_URL}/api/wishlistvideo/remove?userId=${userId}&videoId=${videoId}`,
  UPDATE_WISHLIST_NOTES: `${API_BASE_URL}/api/wishlistvideo/notes`,

  // MESSAGE
  SEND_MESSAGE: `${API_BASE_URL}/api/message/send`,
  GET_CHAT: (user1Id: number, user2Id: number) =>
    `${API_BASE_URL}/api/message/chat?user1Id=${user1Id}&user2Id=${user2Id}`,
  INBOX: (userId: number) => `${API_BASE_URL}/api/message/inbox/${userId}`,
  MARK_AS_READ: (messageId: number) =>
    `${API_BASE_URL}/api/message/read/${messageId}`,
  CONVERSATIONS: (userId: number) =>
    `${API_BASE_URL}/api/message/conversations/${userId}`,
  UNREAD_COUNT: (userId: number) =>
    `${API_BASE_URL}/api/message/unread/${userId}`,
  DELETE_MESSAGE: (messageId: number) =>
    `${API_BASE_URL}/api/message/${messageId}`,
};

// 🔥 HELPER FUNKCIJE ZA API POZIVE
export const api = {
  // GET zahtjev
  get: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },

  // POST zahtjev
  post: async (url: string, data: any) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },

  // PUT zahtjev
  put: async (url: string, data: any) => {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },

  // DELETE zahtjev
  delete: async (url: string) => {
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },

  // UPLOAD zahtjev (za file-ove)
  upload: async (url: string, formData: FormData) => {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },
};

// 🔥 DEFAULT EXPORT ZA LAKŠI IMPORT
export default {
  API_BASE_URL,
  API_ENDPOINTS,
  api,
};

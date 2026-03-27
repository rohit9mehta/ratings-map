import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDeKv2pGHtcdLDR3u_6SZuWDqP-ETyn7vU",
  authDomain: "farmers-market-book.firebaseapp.com",
  projectId: "farmers-market-book",
  storageBucket: "farmers-market-book.firebasestorage.app",
  messagingSenderId: "540071859912",
  appId: "1:540071859912:web:21bfc6c8a8b44616bdb7fd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

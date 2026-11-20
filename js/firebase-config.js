import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqkGqL00Z_RTEn1mMIKwHyXkqEXWUp1M8",
  authDomain: "lagunna-boutique.firebaseapp.com",
  projectId: "lagunna-boutique",
  storageBucket: "lagunna-boutique.firebasestorage.app",
  messagingSenderId: "30441503755",
  appId: "1:30441503755:web:e69cc4c41f9cf881cb9b0e",
  measurementId: "G-XPDHSPSZS4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
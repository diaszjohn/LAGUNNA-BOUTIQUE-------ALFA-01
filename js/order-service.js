import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export async function createReservation(cartItems, customerInfo) {
  const total = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const docRef = await addDoc(collection(db, "reservas"), {
    cliente: {
      nome: customerInfo.nome.trim(),
      telefone: customerInfo.telefone.trim(),
      modalidade: customerInfo.modalidade,
      endereco: customerInfo.endereco || null,
      pagamento: customerInfo.pagamento,
      observacoes: customerInfo.observacoes.trim()
    },
    itens: cartItems.map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size || "Único",
      price: Number(item.price),
      qty: Number(item.qty)
    })),
    total,
    status: "pendente",
    criadoEm: serverTimestamp()
  });

  return docRef.id;
}
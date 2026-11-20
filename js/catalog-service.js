import { db } from "./firebase-config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "Único"];

export function normalizeSizes(rawSizes, fallbackStock = 0) {
  if (rawSizes && typeof rawSizes === "object" && Object.keys(rawSizes).length > 0) {
    const clean = {};
    for (const [size, qty] of Object.entries(rawSizes)) {
      clean[size] = Math.max(0, Number(qty) || 0);
    }
    return clean;
  }
  return { "Único": Math.max(0, Number(fallbackStock) || 0) };
}

export function getSortedSizeEntries(sizesObj) {
  return Object.entries(sizesObj).sort(([a], [b]) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export function subscribeToCatalog(onData, onError) {
  const colRef = collection(db, "produtos");

  return onSnapshot(
    colRef,
    (snapshot) => {
      const items = snapshot.docs.map((doc) => {
        const data = doc.data();
        const sizes = normalizeSizes(data.tamanhos, data.estoque);
        const totalStock = Object.values(sizes).reduce((sum, q) => sum + q, 0);

        return {
          id: doc.id,
          name: data.nome || "",
          category: data.categoria || "",
          style: data.estilo || "",
          material: data.material || "",
          price: Number(data.preco || 0),
          stock: totalStock,
          sizes,
          featured: Boolean(data.destaque),
          description: data.descricao || "",
          imageUrl: data.imagemUrl || ""
        };
      });
      onData(items);
    },
    (error) => {
      console.error("Erro ao ler catálogo no Firestore:", error);
      if (onError) onError(error);
    }
  );
}
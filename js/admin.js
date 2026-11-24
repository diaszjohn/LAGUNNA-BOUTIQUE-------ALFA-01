import { auth, db } from "./firebase-config.js";
import { normalizeSizes, getSortedSizeEntries } from "./catalog-service.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const CLOUDINARY_CLOUD_NAME = "bhm10caz";
const CLOUDINARY_UPLOAD_PRESET = "lagunna_fotos";

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const adminUserBar = document.getElementById("adminUserBar");
const adminEmailLabel = document.getElementById("adminEmailLabel");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");

const productForm = document.getElementById("productForm");
const formTitle = document.getElementById("formTitle");
const saveProdBtn = document.getElementById("saveProdBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const initialSizesBox = document.getElementById("initialSizesBox");

const prodFotoFile = document.getElementById("prodFotoFile");
const photoFileName = document.getElementById("photoFileName");
const photoPreview = document.getElementById("photoPreview");

const adminStockList = document.getElementById("adminStockList");
const adminCatalogList = document.getElementById("adminCatalogList");
const adminOrdersList = document.getElementById("adminOrdersList");
const adminHistoryList = document.getElementById("adminHistoryList");
const filteredCountLabel = document.getElementById("filteredCountLabel");
const pendingCount = document.getElementById("pendingCount");

let unsubProducts = null;
let unsubOrders = null;
let unsubHistory = null;
let currentProducts = [];
let currentOrders = [];
let isBusy = false;

const STOCK_DEDUCTED_STATUSES = ["confirmado", "saiu_entrega", "concluido"];

const STATUS_LABELS = {
  pendente: "Pendente",
  confirmado: "Confirmado (Separado)",
  saiu_entrega: "Saiu para Entrega",
  concluido: "Concluído / Entregue",
  cancelado: "Cancelado"
};

function formatBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(ts) {
  if (!ts || typeof ts.toDate !== "function") return "Agora";
  return ts.toDate().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizePhoneBR(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits || digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function buildDeliveryWhatsAppUrl(order) {
  const phone = normalizePhoneBR(order.cliente?.telefone);
  if (!phone) return null;

  const nome = order.cliente?.nome || "cliente";
  const itens = (order.itens || [])
    .map((i) => `• ${i.qty}x ${i.name} [${i.size || "Único"}]`)
    .join("\n");
  const endereco = order.cliente?.endereco?.texto || "endereço informado";
  const pagamento = order.cliente?.pagamento || "combinado";

  const msg =
    `Olá, *${nome}*! Aqui é da *Lagunna Boutique*.\n\n` +
    `Seu pedido *#${order.id.slice(0, 6)}* acabou de *sair para entrega*! 🛵✨\n\n` +
    `*Itens:*\n${itens}\n\n` +
    `*Endereço:* ${endereco}\n` +
    `*Pagamento:* ${pagamento} (${formatBRL(order.total)})\n\n` +
    `Qualquer dúvida estamos à disposição!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

function showNotice(msg) {
  console.warn("[Gestão Lagunna]:", msg);
  window.alert(msg);
}

function switchTab(panelId) {
  document.querySelectorAll(".admin-tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.panel === panelId);
  });
  document.querySelectorAll(".admin-panel").forEach((p) => {
    p.hidden = p.id !== panelId;
  });
}

prodFotoFile?.addEventListener("change", () => {
  const file = prodFotoFile.files?.[0];
  if (!file) return;
  if (photoFileName) photoFileName.textContent = file.name;
  if (photoPreview) {
    photoPreview.src = URL.createObjectURL(file);
    photoPreview.hidden = false;
  }
});

async function uploadPhotoToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    throw new Error("Falha ao enviar a imagem para o Cloudinary.");
  }

  const data = await response.json();
  return data.secure_url;
}

async function logStockMovement({ produtoNome, tamanho, delta, saldoFinal, motivo }) {
  try {
    await addDoc(collection(db, "movimentacoes_estoque"), {
      produtoNome: String(produtoNome || ""),
      tamanho: String(tamanho || "Único"),
      delta: Number(delta || 0),
      saldoFinal: Number(saldoFinal || 0),
      motivo: String(motivo || "Movimentação"),
      usuario: auth.currentUser?.email || "gestor",
      criadoEm: serverTimestamp()
    });
  } catch (err) {
    console.error("Falha ao registrar histórico de estoque:", err);
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isBusy) return;
  isBusy = true;

  loginError.hidden = true;
  const submitBtn = document.getElementById("loginSubmitBtn");
  if (submitBtn) submitBtn.disabled = true;

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (err) {
    console.error("Erro no login:", err);
    loginError.textContent = "E-mail ou senha inválidos, ou acesso não autorizado.";
    loginError.hidden = false;
  } finally {
    isBusy = false;
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Erro ao sair:", err);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    adminUserBar.hidden = false;
    adminEmailLabel.textContent = user.email || "";
    startListeners();
  } else {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
    adminUserBar.hidden = true;
    stopListeners();
  }
});

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.panel));
});

function stopListeners() {
  if (typeof unsubProducts === "function") unsubProducts();
  if (typeof unsubOrders === "function") unsubOrders();
  if (typeof unsubHistory === "function") unsubHistory();
  unsubProducts = null;
  unsubOrders = null;
  unsubHistory = null;
}

function startListeners() {
  stopListeners();

  const qProducts = query(collection(db, "produtos"), orderBy("nome", "asc"));
  unsubProducts = onSnapshot(
    qProducts,
    (snapshot) => {
      currentProducts = snapshot.docs.map((d) => {
        const data = d.data();
        const sizes = normalizeSizes(data.tamanhos, data.estoque);
        const totalStock = Object.values(sizes).reduce((s, q) => s + q, 0);
        return { id: d.id, ...data, sizes, totalStock };
      });
      updateKPIs();
      renderStockControl();
      renderCatalogManagement();
    },
    (err) => {
      console.error("Erro no listener de produtos:", err);
    }
  );

  const qOrders = query(collection(db, "reservas"), orderBy("criadoEm", "desc"));
  unsubOrders = onSnapshot(
    qOrders,
    (snapshot) => {
      currentOrders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      pendingCount.textContent = currentOrders.filter((o) => o.status === "pendente").length;
      renderOrders(currentOrders);
    },
    (err) => {
      console.error("Erro no listener de reservas:", err);
    }
  );

  const qHistory = query(collection(db, "movimentacoes_estoque"), orderBy("criadoEm", "desc"), limit(40));
  unsubHistory = onSnapshot(
    qHistory,
    (snapshot) => {
      const logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderHistory(logs);
    },
    (err) => {
      console.error("Erro no listener de histórico:", err);
    }
  );
}

function updateKPIs() {
  const totalModels = currentProducts.length;
  const totalUnits = currentProducts.reduce((sum, p) => sum + p.totalStock, 0);
  const lowStock = currentProducts.filter((p) => p.totalStock > 0 && p.totalStock <= 2).length;
  const outStock = currentProducts.filter((p) => p.totalStock <= 0).length;

  document.getElementById("kpiModels").textContent = totalModels;
  document.getElementById("kpiTotalUnits").textContent = totalUnits;
  document.getElementById("kpiLowStock").textContent = lowStock;
  document.getElementById("kpiOutStock").textContent = outStock;
}

function renderStockControl() {
  if (!adminStockList) return;

  const activeElement = document.activeElement;
  const editingForm = activeElement?.closest?.("[data-grade-form]");
  const editingProdId = editingForm?.dataset?.gradeForm || null;
  const draftValues = {};

  if (editingForm) {
    editingForm.querySelectorAll("input[data-size-key]").forEach((inp) => {
      draftValues[inp.dataset.sizeKey] = inp.value;
    });
  }

  const search = document.getElementById("adminSearch")?.value.trim().toLowerCase() || "";
  const cat = document.getElementById("adminFilterCat")?.value || "todos";
  const status = document.getElementById("adminFilterStatus")?.value || "todos";

  const filtered = currentProducts.filter((p) => {
    const qty = p.totalStock;
    const matchSearch =
      !search ||
      (p.nome || "").toLowerCase().includes(search) ||
      (p.material || "").toLowerCase().includes(search) ||
      p.id.toLowerCase().includes(search);
    const matchCat = cat === "todos" || p.categoria === cat;
    const matchStatus =
      status === "todos" ||
      (status === "baixo" && qty > 0 && qty <= 2) ||
      (status === "esgotado" && qty <= 0) ||
      (status === "disponivel" && qty > 0);

    return matchSearch && matchCat && matchStatus;
  });

  if (filteredCountLabel) {
    filteredCountLabel.textContent = `Exibindo ${filtered.length} de ${currentProducts.length} peças`;
  }

  if (filtered.length === 0) {
    adminStockList.innerHTML = `<p class="admin-item__meta">Nenhuma peça encontrada com este filtro.</p>`;
    return;
  }

  adminStockList.innerHTML = filtered
    .map((p) => {
      const qty = p.totalStock;
      const alertClass = qty <= 0 ? "admin-item--out" : qty <= 2 ? "admin-item--low" : "";
      const entries = getSortedSizeEntries(p.sizes);

      return `
        <div class="admin-item ${alertClass}">
          <div>
            <div class="admin-item__title">${p.nome} — Total: ${qty} unid.</div>
            <div class="admin-item__meta">${p.categoria} • ${p.material}</div>
          </div>

          <form class="size-grid-editor" data-grade-form="${p.id}">
            ${entries
              .map(([size, sizeQty]) => {
                const val = editingProdId === p.id && size in draftValues ? draftValues[size] : sizeQty;
                return `
                  <label class="size-box">
                    <span class="size-box__label">${size}</span>
                    <input type="number" min="0" step="1" data-size-key="${size}" value="${val}" />
                  </label>
                `;
              })
              .join("")}
            <button type="submit" class="btn btn--outline btn--sm">Salvar Grade</button>
          </form>
        </div>
      `;
    })
    .join("");
}

["adminSearch", "adminFilterCat", "adminFilterStatus"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", renderStockControl);
  document.getElementById(id)?.addEventListener("change", renderStockControl);
});

adminStockList.addEventListener("submit", async (e) => {
  const form = e.target.closest("[data-grade-form]");
  if (!form || isBusy) return;
  e.preventDefault();

  const id = form.dataset.gradeForm;
  const prod = currentProducts.find((p) => p.id === id);
  if (!prod) return;

  const updatedSizes = {};
  const changes = [];

  form.querySelectorAll("input[data-size-key]").forEach((input) => {
    const size = input.dataset.sizeKey;
    const nextVal = Math.max(0, parseInt(input.value, 10) || 0);
    const prevVal = Number(prod.sizes?.[size] || 0);
    updatedSizes[size] = nextVal;
    if (nextVal !== prevVal) {
      changes.push({ size, delta: nextVal - prevVal, saldoFinal: nextVal });
    }
  });

  if (changes.length === 0) return;

  isBusy = true;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const nextTotal = Object.values(updatedSizes).reduce((s, q) => s + q, 0);
    await updateDoc(doc(db, "produtos", id), {
      tamanhos: updatedSizes,
      estoque: nextTotal
    });

    for (const ch of changes) {
      await logStockMovement({
        produtoNome: prod.nome,
        tamanho: ch.size,
        delta: ch.delta,
        saldoFinal: ch.saldoFinal,
        motivo: "Ajuste manual no painel"
      });
    }
  } catch (err) {
    console.error("Erro ao salvar grade:", err);
    showNotice("Não foi possível atualizar a grade de tamanhos.");
  } finally {
    isBusy = false;
    if (submitBtn) submitBtn.disabled = false;
  }
});

function renderCatalogManagement() {
  if (!adminCatalogList) return;

  if (currentProducts.length === 0) {
    adminCatalogList.innerHTML = `<p class="admin-item__meta">Nenhuma peça cadastrada ainda.</p>`;
    return;
  }

  adminCatalogList.innerHTML = currentProducts
    .map((p) => {
      const gradeSummary = getSortedSizeEntries(p.sizes)
        .map(([s, q]) => `${s}:${q}`)
        .join(" | ");

      return `
        <div class="admin-item">
          <div>
            <div class="admin-item__title">${p.nome} ${p.destaque ? "• ★ Vitrine" : ""}</div>
            <div class="admin-item__meta">${p.categoria} | ${p.estilo} | ${formatBRL(p.preco)}</div>
            <div class="admin-item__meta">Grade: ${gradeSummary} (Total: ${p.totalStock})</div>
          </div>
          <div class="admin-item__controls">
            <button type="button" class="btn btn--outline btn--sm" data-edit-id="${p.id}">Editar Ficha</button>
            <button type="button" class="btn btn--outline btn--danger btn--sm" data-delete-id="${p.id}">Excluir</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function readInitialGrade() {
  const map = {
    PP: Math.max(0, parseInt(document.getElementById("initPP")?.value, 10) || 0),
    P: Math.max(0, parseInt(document.getElementById("initP")?.value, 10) || 0),
    M: Math.max(0, parseInt(document.getElementById("initM")?.value, 10) || 0),
    G: Math.max(0, parseInt(document.getElementById("initG")?.value, 10) || 0),
    GG: Math.max(0, parseInt(document.getElementById("initGG")?.value, 10) || 0),
    "Único": Math.max(0, parseInt(document.getElementById("initUnico")?.value, 10) || 0)
  };

  const activeEntries = Object.entries(map).filter(([, qty]) => qty > 0);
  if (activeEntries.length === 0) return { "Único": 0 };
  return Object.fromEntries(activeEntries);
}

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isBusy) return;

  const id = document.getElementById("prodId").value;
  const priceNum = Number(document.getElementById("prodPreco").value);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    showNotice("Informe um preço válido.");
    return;
  }

  isBusy = true;
  if (saveProdBtn) saveProdBtn.disabled = true;

  try {
    let finalImageUrl = document.getElementById("prodImagemUrl").value.trim();
    const selectedFile = prodFotoFile?.files?.[0];

    if (selectedFile) {
      saveProdBtn.textContent = "Enviando foto...";
      finalImageUrl = await uploadPhotoToCloudinary(selectedFile);
    }

    const basePayload = {
      nome: document.getElementById("prodNome").value.trim(),
      categoria: document.getElementById("prodCategoria").value,
      estilo: document.getElementById("prodEstilo").value,
      material: document.getElementById("prodMaterial").value.trim(),
      preco: priceNum,
      imagemUrl: finalImageUrl,
      descricao: document.getElementById("prodDescricao").value.trim(),
      destaque: document.getElementById("prodDestaque").checked
    };

    if (id) {
      await updateDoc(doc(db, "produtos", id), basePayload);
    } else {
      const initialGrade = readInitialGrade();
      const initialTotal = Object.values(initialGrade).reduce((s, q) => s + q, 0);

      await addDoc(collection(db, "produtos"), {
        ...basePayload,
        tamanhos: initialGrade,
        estoque: initialTotal
      });

      for (const [size, qty] of Object.entries(initialGrade)) {
        if (qty > 0) {
          await logStockMovement({
            produtoNome: basePayload.nome,
            tamanho: size,
            delta: qty,
            saldoFinal: qty,
            motivo: "Cadastro inicial de peça"
          });
        }
      }
    }

    resetProductForm();
  } catch (err) {
    console.error("Erro ao salvar peça:", err);
    showNotice(err.message || "Não foi possível salvar a peça.");
  } finally {
    isBusy = false;
    if (saveProdBtn) {
      saveProdBtn.disabled = false;
      saveProdBtn.textContent = document.getElementById("prodId").value ? "Salvar Alterações" : "Cadastrar Peça";
    }
  }
});

function resetProductForm() {
  productForm.reset();
  ["initPP", "initP", "initM", "initG", "initGG", "initUnico"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "0";
  });
  document.getElementById("prodId").value = "";
  document.getElementById("prodImagemUrl").value = "";
  if (prodFotoFile) prodFotoFile.value = "";
  if (photoFileName) photoFileName.textContent = "Nenhuma foto selecionada";
  if (photoPreview) {
    photoPreview.src = "";
    photoPreview.hidden = true;
  }
  formTitle.textContent = "Cadastrar Nova Peça";
  saveProdBtn.textContent = "Cadastrar Peça";
  initialSizesBox.hidden = false;
  cancelEditBtn.hidden = true;
}

cancelEditBtn.addEventListener("click", resetProductForm);

adminCatalogList.addEventListener("click", async (e) => {
  const editBtn = e.target.closest("[data-edit-id]");
  if (editBtn) {
    const prod = currentProducts.find((p) => p.id === editBtn.dataset.editId);
    if (!prod) return;

    document.getElementById("prodId").value = prod.id;
    document.getElementById("prodNome").value = prod.nome || "";
    document.getElementById("prodCategoria").value = prod.categoria || "vestidos";
    document.getElementById("prodEstilo").value = prod.estilo || "Casual Chic";
    document.getElementById("prodMaterial").value = prod.material || "";
    document.getElementById("prodPreco").value = prod.preco ?? 0;
    document.getElementById("prodImagemUrl").value = prod.imagemUrl || "";
    document.getElementById("prodDescricao").value = prod.descricao || "";
    document.getElementById("prodDestaque").checked = Boolean(prod.destaque);

    if (prodFotoFile) prodFotoFile.value = "";
    if (photoFileName) photoFileName.textContent = prod.imagemUrl ? "Foto atual mantida" : "Nenhuma foto selecionada";
    if (photoPreview) {
      photoPreview.src = prod.imagemUrl || "";
      photoPreview.hidden = !prod.imagemUrl;
    }

    formTitle.textContent = `Editando Ficha: ${prod.nome}`;
    saveProdBtn.textContent = "Salvar Alterações";
    initialSizesBox.hidden = true;
    cancelEditBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const delBtn = e.target.closest("[data-delete-id]");
  if (delBtn && !isBusy) {
    const prod = currentProducts.find((p) => p.id === delBtn.dataset.deleteId);
    if (!prod) return;
    if (window.confirm(`Excluir "${prod.nome}" do catálogo?`)) {
      isBusy = true;
      try {
        await deleteDoc(doc(db, "produtos", prod.id));
        if (document.getElementById("prodId").value === prod.id) {
          resetProductForm();
        }
      } catch (err) {
        console.error("Erro ao excluir peça:", err);
        showNotice("Não foi possível excluir a peça.");
      } finally {
        isBusy = false;
      }
    }
  }
});

/* ABA 3: RESERVAS */
function renderOrders(orders) {
  if (!adminOrdersList) return;

  if (orders.length === 0) {
    adminOrdersList.innerHTML = `<p class="admin-item__meta">Nenhuma reserva recebida ainda.</p>`;
    return;
  }

  adminOrdersList.innerHTML = orders
    .map((order) => {
      const itemsText = (order.itens || [])
        .map((i) => `${i.qty}x ${i.name} [${i.size || "Único"}]`)
        .join(", ");
      const clienteNome = order.cliente?.nome || "Cliente não identificada";
      const clienteFone = order.cliente?.telefone || "";
      const modalidade = order.cliente?.modalidade || order.cliente?.entrega || "Retirada na loja";
      const enderecoTexto = order.cliente?.endereco?.texto || "";
      const pagamento = order.cliente?.pagamento || "Não informado";
      const obs = order.cliente?.observacoes || "";
      const status = order.status || "pendente";
      const isDelivery = modalidade.toLowerCase().includes("entrega");
      const waUrl = buildDeliveryWhatsAppUrl(order);

      const statusSelect = `
        <select class="select-input" style="width:auto; padding:6px 10px; font-size:0.78rem;" data-status-select="${order.id}" aria-label="Alterar situação">
          <option value="pendente" ${status === "pendente" ? "selected" : ""}>Pendente</option>
          <option value="confirmado" ${status === "confirmado" ? "selected" : ""}>Confirmado (Baixar)</option>
          ${isDelivery ? `<option value="saiu_entrega" ${status === "saiu_entrega" ? "selected" : ""}>Saiu p/ Entrega</option>` : ""}
          <option value="concluido" ${status === "concluido" ? "selected" : ""}>Concluído</option>
          <option value="cancelado" ${status === "cancelado" ? "selected" : ""}>Cancelado</option>
        </select>
      `;

      const notifyBtn =
        isDelivery && waUrl && status !== "cancelado"
          ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn--outline btn--sm" data-notify-delivery="${order.id}">🛵 Avisar Saída (WhatsApp)</a>`
          : "";

      const cancelBtn =
        status !== "cancelado"
          ? `<button type="button" class="btn btn--outline btn--danger btn--sm" data-cancel-order="${order.id}">Cancelar</button>`
          : "";

      const deleteBtn = `<button type="button" class="btn btn--outline btn--danger btn--sm" data-delete-order="${order.id}" title="Apagar registro">Excluir</button>`;

      return `
        <div class="admin-item ${status === "cancelado" ? "admin-item--out" : ""}">
          <div>
            <div class="admin-item__title">Reserva #${order.id.slice(0, 6)} — ${clienteNome} (${formatBRL(order.total)})</div>
            <div class="admin-item__meta">${itemsText}</div>
            <div class="admin-item__meta">
              <strong>${modalidade}</strong>${enderecoTexto ? `: ${enderecoTexto}` : ""} • Pgto: <strong>${pagamento}</strong>
            </div>
            ${obs ? `<div class="admin-item__meta">Obs.: ${obs}</div>` : ""}
            <div class="admin-item__meta">${clienteFone ? `Tel: ${clienteFone} • ` : ""}${formatDateBR(order.criadoEm)} • Status: <strong>${STATUS_LABELS[status] || status}</strong></div>
          </div>
          <div class="admin-item__controls">
            ${statusSelect}
            ${notifyBtn}
            ${cancelBtn}
            ${deleteBtn}
          </div>
        </div>
      `;
    })
    .join("");
}

async function changeOrderStatus(orderId, targetStatus) {
  if (isBusy) return;
  isBusy = true;

  try {
    const logsToWrite = [];
    let updatedOrderSnapshot = null;

    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, "reservas", orderId);
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) throw new Error("Reserva não encontrada.");

      const orderData = orderSnap.data();
      const prevStatus = orderData.status || "pendente";
      if (prevStatus === targetStatus) return;

      const wasDeducted = STOCK_DEDUCTED_STATUSES.includes(prevStatus);
      const willBeDeducted = STOCK_DEDUCTED_STATUSES.includes(targetStatus);
      const items = Array.isArray(orderData.itens) ? orderData.itens : [];

      if (!wasDeducted && willBeDeducted) {
        // Baixar estoque
        const productSnaps = [];
        for (const item of items) {
          const prodRef = doc(db, "produtos", item.id);
          const prodSnap = await transaction.get(prodRef);
          if (!prodSnap.exists()) throw new Error(`Produto "${item.name}" não existe mais.`);
          productSnaps.push({ item, prodRef, prodSnap });
        }

        const updates = [];
        for (const { item, prodRef, prodSnap } of productSnaps) {
          const pData = prodSnap.data();
          const sizes = normalizeSizes(pData.tamanhos, pData.estoque);
          const sizeKey = item.size || "Único";
          const qtyNeeded = Math.max(1, Number(item.qty || 1));
          const currentSizeStock = Number(sizes[sizeKey] || 0);

          if (currentSizeStock < qtyNeeded) {
            throw new Error(`Estoque insuficiente para "${item.name}" Tam. ${sizeKey} (atual: ${currentSizeStock}).`);
          }

          sizes[sizeKey] = currentSizeStock - qtyNeeded;
          const nextTotal = Object.values(sizes).reduce((s, q) => s + q, 0);
          updates.push({ ref: prodRef, sizes, nextTotal });

          logsToWrite.push({
            produtoNome: item.name,
            tamanho: sizeKey,
            delta: -qtyNeeded,
            saldoFinal: sizes[sizeKey],
            motivo: `Reserva #${orderId.slice(0, 6)} (${STATUS_LABELS[targetStatus] || targetStatus})`
          });
        }

        for (const u of updates) {
          transaction.update(u.ref, { tamanhos: u.sizes, estoque: u.nextTotal });
        }
      } else if (wasDeducted && !willBeDeducted) {
        // Estornar estoque (cancelado ou voltou para pendente)
        const foundProds = [];
        for (const item of items) {
          const prodRef = doc(db, "produtos", item.id);
          const prodSnap = await transaction.get(prodRef);
          if (prodSnap.exists()) foundProds.push({ item, prodRef, prodSnap });
        }

        const updates = [];
        for (const { item, prodRef, prodSnap } of foundProds) {
          const pData = prodSnap.data();
          const sizes = normalizeSizes(pData.tamanhos, pData.estoque);
          const sizeKey = item.size || "Único";
          const qtyRefund = Math.max(0, Number(item.qty || 0));

          sizes[sizeKey] = Number(sizes[sizeKey] || 0) + qtyRefund;
          const nextTotal = Object.values(sizes).reduce((s, q) => s + q, 0);
          updates.push({ ref: prodRef, sizes, nextTotal });

          logsToWrite.push({
            produtoNome: item.name,
            tamanho: sizeKey,
            delta: qtyRefund,
            saldoFinal: sizes[sizeKey],
            motivo: `Estorno Reserva #${orderId.slice(0, 6)} (${STATUS_LABELS[targetStatus] || targetStatus})`
          });
        }

        for (const u of updates) {
          transaction.update(u.ref, { tamanhos: u.sizes, estoque: u.nextTotal });
        }
      }

      transaction.update(orderRef, { status: targetStatus });
      updatedOrderSnapshot = { id: orderId, ...orderData, status: targetStatus };
    });

    for (const lg of logsToWrite) {
      await logStockMovement(lg);
    }

    if (targetStatus === "saiu_entrega" && updatedOrderSnapshot) {
      const waUrl = buildDeliveryWhatsAppUrl(updatedOrderSnapshot);
      if (waUrl && window.confirm("Pedido marcado como 'Saiu para Entrega'. Abrir WhatsApp para avisar o cliente agora?")) {
        window.open(waUrl, "_blank", "noopener,noreferrer");
      }
    }
  } catch (err) {
    showNotice(err.message || "Não foi possível atualizar a situação da reserva.");
    renderOrders(currentOrders);
  } finally {
    isBusy = false;
  }
}

adminOrdersList.addEventListener("change", (e) => {
  const select = e.target.closest("[data-status-select]");
  if (!select) return;
  changeOrderStatus(select.dataset.statusSelect, select.value);
});

adminOrdersList.addEventListener("click", async (e) => {
  const notifyLink = e.target.closest("[data-notify-delivery]");
  if (notifyLink) {
    const orderId = notifyLink.dataset.notifyDelivery;
    const order = currentOrders.find((o) => o.id === orderId);
    if (order && order.status !== "saiu_entrega") {
      changeOrderStatus(orderId, "saiu_entrega");
    }
    return;
  }

  const cancelBtn = e.target.closest("[data-cancel-order]");
  if (cancelBtn) {
    const orderId = cancelBtn.dataset.cancelOrder;
    if (window.confirm("Cancelar esta reserva? Se já foi confirmada, o estoque será estornado.")) {
      changeOrderStatus(orderId, "cancelado");
    }
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-order]");
  if (deleteBtn && !isBusy) {
    const orderId = deleteBtn.dataset.deleteOrder;
    const order = currentOrders.find((o) => o.id === orderId);
    if (!order) return;

    if (STOCK_DEDUCTED_STATUSES.includes(order.status)) {
      showNotice("Cancele a reserva primeiro antes de excluir para que o estoque seja estornado.");
      return;
    }

    if (window.confirm(`Excluir permanentemente o registro da Reserva #${orderId.slice(0, 6)}?`)) {
      isBusy = true;
      try {
        await deleteDoc(doc(db, "reservas", orderId));
      } catch (err) {
        console.error("Erro ao excluir reserva:", err);
        showNotice("Não foi possível excluir o registro.");
      } finally {
        isBusy = false;
      }
    }
  }
});

/* ABA 4: HISTÓRICO */
function renderHistory(logs) {
  if (!adminHistoryList) return;

  if (logs.length === 0) {
    adminHistoryList.innerHTML = `<p class="admin-item__meta">Nenhuma movimentação registrada ainda.</p>`;
    return;
  }

  adminHistoryList.innerHTML = logs
    .map((lg) => {
      const sign = Number(lg.delta) > 0 ? `+${lg.delta}` : `${lg.delta}`;
      return `
        <div class="admin-item">
          <div>
            <div class="admin-item__title">${lg.produtoNome} — Tam. ${lg.tamanho} (<strong>${sign}</strong>)</div>
            <div class="admin-item__meta">${lg.motivo} • Saldo após: ${lg.saldoFinal} unid.</div>
          </div>
          <div class="admin-item__controls">
            <span class="log-badge">${formatDateBR(lg.criadoEm)}</span>
            <span class="admin-item__meta">${lg.usuario || ""}</span>
          </div>
        </div>
      `;
    })
    .join("");
}
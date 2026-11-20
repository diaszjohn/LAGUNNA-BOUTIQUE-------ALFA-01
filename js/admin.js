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
let isBusy = false;

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
      const orders = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      pendingCount.textContent = orders.filter((o) => o.status === "pendente").length;
      renderOrders(orders);
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

  const basePayload = {
    nome: document.getElementById("prodNome").value.trim(),
    categoria: document.getElementById("prodCategoria").value,
    estilo: document.getElementById("prodEstilo").value,
    material: document.getElementById("prodMaterial").value.trim(),
    preco: priceNum,
    imagemUrl: document.getElementById("prodImagemUrl").value.trim(),
    descricao: document.getElementById("prodDescricao").value.trim(),
    destaque: document.getElementById("prodDestaque").checked
  };

  try {
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
    showNotice("Não foi possível salvar a peça.");
  } finally {
    isBusy = false;
    if (saveProdBtn) saveProdBtn.disabled = false;
  }
});

function resetProductForm() {
  productForm.reset();
  ["initPP", "initP", "initM", "initG", "initGG", "initUnico"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "0";
  });
  document.getElementById("prodId").value = "";
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

      let actionButtons = "";
      if (order.status === "pendente") {
        actionButtons = `
          <button type="button" class="btn btn--primary btn--sm" data-confirm-order="${order.id}">Confirmar & Baixar</button>
          <button type="button" class="btn btn--outline btn--danger btn--sm" data-cancel-order="${order.id}">Cancelar</button>
        `;
      } else if (order.status === "confirmado") {
        actionButtons = `
          <button type="button" class="btn btn--outline btn--danger btn--sm" data-cancel-order="${order.id}">Cancelar & Estornar Estoque</button>
        `;
      }

      return `
        <div class="admin-item">
          <div>
            <div class="admin-item__title">Reserva #${order.id.slice(0, 6)} — ${clienteNome} (${formatBRL(order.total)})</div>
            <div class="admin-item__meta">${itemsText}</div>
            <div class="admin-item__meta">
              <strong>${modalidade}</strong>${enderecoTexto ? `: ${enderecoTexto}` : ""} • Pgto: <strong>${pagamento}</strong>
            </div>
            ${obs ? `<div class="admin-item__meta">Obs.: ${obs}</div>` : ""}
            <div class="admin-item__meta">${clienteFone ? `Tel: ${clienteFone} • ` : ""}${formatDateBR(order.criadoEm)} • Status: <strong>${order.status}</strong></div>
          </div>
          <div class="admin-item__controls">${actionButtons}</div>
        </div>
      `;
    })
    .join("");
}

adminOrdersList.addEventListener("click", async (e) => {
  if (isBusy) return;

  const confirmBtn = e.target.closest("[data-confirm-order]");
  if (confirmBtn) {
    const orderId = confirmBtn.dataset.confirmOrder;
    isBusy = true;
    confirmBtn.disabled = true;

    try {
      const appliedLogs = [];

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "reservas", orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Reserva não encontrada.");

        const orderData = orderSnap.data();
        if (orderData.status !== "pendente") return;

        const items = Array.isArray(orderData.itens) ? orderData.itens : [];
        const productSnaps = [];
        for (const item of items) {
          const prodRef = doc(db, "produtos", item.id);
          const prodSnap = await transaction.get(prodRef);
          if (!prodSnap.exists()) {
            throw new Error(`Produto "${item.name}" não existe mais.`);
          }
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

          appliedLogs.push({
            produtoNome: item.name,
            tamanho: sizeKey,
            delta: -qtyNeeded,
            saldoFinal: sizes[sizeKey],
            motivo: `Reserva #${orderId.slice(0, 6)} confirmada`
          });
        }

        for (const u of updates) {
          transaction.update(u.ref, { tamanhos: u.sizes, estoque: u.nextTotal });
        }
        transaction.update(orderRef, { status: "confirmado" });
      });

      for (const lg of appliedLogs) {
        await logStockMovement(lg);
      }
    } catch (err) {
      showNotice(err.message || "Não foi possível confirmar a reserva.");
    } finally {
      isBusy = false;
      confirmBtn.disabled = false;
    }
    return;
  }

  const cancelBtn = e.target.closest("[data-cancel-order]");
  if (cancelBtn) {
    const orderId = cancelBtn.dataset.cancelOrder;
    isBusy = true;
    cancelBtn.disabled = true;

    try {
      const refundLogs = [];

      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "reservas", orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Reserva não encontrada.");

        const orderData = orderSnap.data();
        if (orderData.status === "cancelado") return;

        if (orderData.status === "confirmado") {
          const items = Array.isArray(orderData.itens) ? orderData.itens : [];
          const foundProds = [];

          for (const item of items) {
            const prodRef = doc(db, "produtos", item.id);
            const prodSnap = await transaction.get(prodRef);
            if (prodSnap.exists()) {
              foundProds.push({ item, prodRef, prodSnap });
            }
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
            refundLogs.push({
              produtoNome: item.name,
              tamanho: sizeKey,
              delta: qtyRefund,
              saldoFinal: sizes[sizeKey],
              motivo: `Estorno Reserva #${orderId.slice(0, 6)}`
            });
          }

          for (const u of updates) {
            transaction.update(u.ref, { tamanhos: u.sizes, estoque: u.nextTotal });
          }
        }

        transaction.update(orderRef, { status: "cancelado" });
      });

      for (const lg of refundLogs) {
        await logStockMovement(lg);
      }
    } catch (err) {
      showNotice(err.message || "Não foi possível cancelar a reserva.");
    } finally {
      isBusy = false;
      cancelBtn.disabled = false;
    }
  }
});

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
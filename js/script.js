import { subscribeToCatalog, getSortedSizeEntries } from "./catalog-service.js";
import { createReservation } from "./order-service.js";

const WHATSAPP_NUMBER = "5586994499556";

let catalog = [];
let selectedSizeByProduct = {};
let cart = JSON.parse(localStorage.getItem("lagunna_cart")) || [];

function saveCart() {
  localStorage.setItem("lagunna_cart", JSON.stringify(cart));
}

function formatBRL(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStockStatus(stock) {
  if (stock <= 0) {
    return { label: "Esgotado", className: "stock-pill--out", available: false };
  }
  if (stock <= 2) {
    return { label: `Últimas ${stock} unidade(s)`, className: "stock-pill--low", available: true };
  }
  return { label: `Em estoque (${stock} unid.)`, className: "stock-pill--ok", available: true };
}

function ensureDefaultSelectedSize(product) {
  const entries = getSortedSizeEntries(product.sizes);
  const current = selectedSizeByProduct[product.id];
  if (current && (product.sizes[current] || 0) > 0) return current;

  const firstAvailable = entries.find(([, qty]) => qty > 0);
  selectedSizeByProduct[product.id] = firstAvailable ? firstAvailable[0] : (entries[0]?.[0] || "Único");
  return selectedSizeByProduct[product.id];
}

function renderSizeChips(product, context = "card") {
  const entries = getSortedSizeEntries(product.sizes);
  const activeSize = ensureDefaultSelectedSize(product);

  return `
    <div class="size-picker" role="group" aria-label="Escolha o tamanho">
      ${entries
        .map(([size, qty]) => {
          const disabled = qty <= 0;
          const isSelected = !disabled && activeSize === size;
          return `
            <button
              type="button"
              class="size-chip ${isSelected ? "is-selected" : ""}"
              data-select-size="${size}"
              data-product-id="${product.id}"
              data-context="${context}"
              ${disabled ? "disabled" : ""}
              title="${disabled ? "Tamanho esgotado" : `${qty} disponível(is)`}"
            >
              ${size}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function createProductCard(product) {
  const status = getStockStatus(product.stock);
  const visualContent = product.imageUrl
    ? `<img src="${product.imageUrl}" alt="${product.name}" class="card__photo" loading="lazy" />`
    : `<svg width="68" height="68" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="#B2B8A6" stroke="#FAF3EC" stroke-width="3"/>
        <path d="M14 61 Q26 53 38 61 T62 61 T86 61" stroke="#FAF3EC" stroke-width="3.8" stroke-linecap="round"/>
        <path d="M18 73 Q30 65 42 73 T66 73 T82 73" stroke="#FAF3EC" stroke-width="3.8" stroke-linecap="round"/>
      </svg>`;

  return `
    <article class="card ${!status.available ? "card--out" : ""}">
      <div class="card__visual">
        <div class="card__badges">
          <span class="badge">${product.category}</span>
          <span class="badge badge--style">${product.style}</span>
        </div>
        ${visualContent}
      </div>
      <div class="card__body">
        <h3 class="card__title">${product.name}</h3>
        <p class="card__material">${product.material}</p>
        <span class="stock-pill ${status.className}">${status.label}</span>
        ${renderSizeChips(product, "card")}
        <div class="card__price">${formatBRL(product.price)}</div>
        <div class="card__actions">
          <button type="button" class="btn btn--outline" data-action="details" data-id="${product.id}">Detalhes</button>
          <button type="button" class="btn btn--primary" data-action="add" data-id="${product.id}" ${!status.available ? "disabled" : ""}>
            ${status.available ? "Adicionar" : "Indisponível"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function syncCartWithCatalog() {
  let changed = false;
  cart = cart
    .map((cartItem) => {
      const liveProduct = catalog.find((p) => p.id === cartItem.id);
      if (!liveProduct) {
        changed = true;
        return null;
      }
      const sizeKey = cartItem.size || "Único";
      const sizeStock = Number(liveProduct.sizes?.[sizeKey] || 0);
      if (sizeStock <= 0) {
        changed = true;
        return null;
      }
      const adjustedQty = Math.min(cartItem.qty, sizeStock);
      if (adjustedQty !== cartItem.qty) changed = true;
      return {
        id: liveProduct.id,
        name: liveProduct.name,
        size: sizeKey,
        price: liveProduct.price,
        qty: adjustedQty
      };
    })
    .filter(Boolean);

  if (changed) saveCart();
  updateCartUI();
}

function renderViews() {
  const showcaseGrid = document.getElementById("showcaseGrid");
  if (showcaseGrid) {
    const featuredItems = catalog.filter((item) => item.featured);
    showcaseGrid.innerHTML = featuredItems.map(createProductCard).join("");
  }

  const catalogGrid = document.getElementById("catalogGrid");
  if (catalogGrid) {
    const searchTerm = document.getElementById("searchCatalog")?.value.trim().toLowerCase() || "";
    const catValue = document.getElementById("filterCategory")?.value || "todos";
    const styleValue = document.getElementById("filterStyle")?.value || "todos";
    const sortValue = document.getElementById("sortCatalog")?.value || "padrao";
    const stockOnly = Boolean(document.getElementById("onlyInStock")?.checked);

    let filtered = catalog.filter((item) => {
      const matchCat = catValue === "todos" || item.category === catValue;
      const matchStyle = styleValue === "todos" || item.style === styleValue;
      const matchStock = !stockOnly || item.stock > 0;
      const matchSearch =
        !searchTerm ||
        item.name.toLowerCase().includes(searchTerm) ||
        item.material.toLowerCase().includes(searchTerm) ||
        item.description.toLowerCase().includes(searchTerm);
      return matchCat && matchStyle && matchStock && matchSearch;
    });

    if (sortValue === "menor") filtered = [...filtered].sort((a, b) => a.price - b.price);
    if (sortValue === "maior") filtered = [...filtered].sort((a, b) => b.price - a.price);

    const statsEl = document.getElementById("catalogStats");
    if (statsEl) {
      statsEl.textContent = `Exibindo ${filtered.length} de ${catalog.length} peças do catálogo`;
    }

    catalogGrid.innerHTML =
      filtered.length > 0
        ? filtered.map(createProductCard).join("")
        : `<p style="grid-column: 1/-1; text-align:center; padding: 40px 0;">Nenhuma peça encontrada com esses filtros.</p>`;
  }
}

function addToCart(productId) {
  const product = catalog.find((p) => p.id === productId);
  if (!product || product.stock <= 0) return;

  const chosenSize = ensureDefaultSelectedSize(product);
  const availableForSize = Number(product.sizes?.[chosenSize] || 0);
  if (availableForSize <= 0) {
    alert("Selecione um tamanho disponível.");
    return;
  }

  const existing = cart.find((item) => item.id === productId && item.size === chosenSize);
  if (existing) {
    if (existing.qty >= availableForSize) {
      alert(`Temos apenas ${availableForSize} unidade(s) no tamanho ${chosenSize}.`);
      return;
    }
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      size: chosenSize,
      price: product.price,
      qty: 1
    });
  }

  saveCart();
  updateCartUI();
  openCart();
}

function removeFromCart(productId, size) {
  cart = cart.filter((item) => !(item.id === productId && item.size === size));
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  const cartCount = document.getElementById("cartCount");
  const cartItemsEl = document.getElementById("cartItems");
  const cartTotalEl = document.getElementById("cartTotal");
  const checkoutBtn = document.getElementById("checkoutBtn");

  const totalItems = cart.reduce((acc, item) => acc + item.qty, 0);
  const totalValue = cart.reduce((acc, item) => acc + item.price * item.qty, 0);

  if (cartCount) cartCount.textContent = totalItems;
  if (cartTotalEl) cartTotalEl.textContent = formatBRL(totalValue);
  if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;

  if (!cartItemsEl) return;

  if (cart.length === 0) {
    cartItemsEl.innerHTML = `<p class="drawer__empty">Sua sacola está vazia.</p>`;
    return;
  }

  cartItemsEl.innerHTML = cart
    .map(
      (item) => `
      <div class="cart-item">
        <div>
          <div class="cart-item__title">${item.name} — <strong>Tam. ${item.size}</strong></div>
          <div class="cart-item__meta">${item.qty}x ${formatBRL(item.price)}</div>
        </div>
        <button type="button" class="cart-item__remove" data-remove-id="${item.id}" data-remove-size="${item.size}">Remover</button>
      </div>
    `
    )
    .join("");
}

const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const quickViewModal = document.getElementById("quickViewModal");
const modalContent = document.getElementById("modalContent");

function openCart() {
  if (!cartDrawer || !cartOverlay) return;
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
  cartOverlay.hidden = false;
}

function closeCart() {
  if (!cartDrawer || !cartOverlay) return;
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
  cartOverlay.hidden = true;
}

function openQuickView(productId) {
  const product = catalog.find((p) => p.id === productId);
  if (!product || !quickViewModal || !modalContent) return;

  const status = getStockStatus(product.stock);
  modalContent.innerHTML = `
    <span class="section__eyebrow">${product.category} • ${product.style}</span>
    <h3 id="modalTitle" class="card__title" style="font-size:1.25rem; margin-bottom:6px;">${product.name}</h3>
    <p class="card__material">${product.material}</p>
    <span class="stock-pill ${status.className}">${status.label}</span>
    ${renderSizeChips(product, "modal")}
    <p style="margin-bottom:18px; font-size:0.94rem;">${product.description}</p>
    <div class="card__price" style="font-size:1.2rem;">${formatBRL(product.price)}</div>
    <button type="button" class="btn btn--primary btn--full" data-modal-add="${product.id}" ${!status.available ? "disabled" : ""}>
      ${status.available ? "Adicionar à Sacola" : "Produto Esgotado"}
    </button>
  `;
  quickViewModal.hidden = false;
}

function closeQuickView() {
  if (!quickViewModal) return;
  quickViewModal.hidden = true;
}

document.addEventListener("click", (e) => {
  const sizeBtn = e.target.closest("[data-select-size]");
  if (sizeBtn) {
    const prodId = sizeBtn.dataset.productId;
    selectedSizeByProduct[prodId] = sizeBtn.dataset.selectSize;
    if (sizeBtn.dataset.context === "modal") {
      openQuickView(prodId);
    }
    renderViews();
    return;
  }

  const actionBtn = e.target.closest("[data-action]");
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    if (actionBtn.dataset.action === "add") addToCart(id);
    if (actionBtn.dataset.action === "details") openQuickView(id);
    return;
  }

  const removeBtn = e.target.closest("[data-remove-id]");
  if (removeBtn) {
    removeFromCart(removeBtn.dataset.removeId, removeBtn.dataset.removeSize);
    return;
  }

  const modalAddBtn = e.target.closest("[data-modal-add]");
  if (modalAddBtn) {
    addToCart(modalAddBtn.dataset.modalAdd);
    closeQuickView();
  }
});

document.querySelectorAll(".quick-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".quick-tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const selectCat = document.getElementById("filterCategory");
    if (selectCat) selectCat.value = tab.dataset.catTarget;
    renderViews();
  });
});

["searchCatalog", "filterCategory", "filterStyle", "sortCatalog", "onlyInStock"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", renderViews);
  document.getElementById(id)?.addEventListener("change", renderViews);
});

document.getElementById("resetFiltersBtn")?.addEventListener("click", () => {
  ["searchCatalog", "filterCategory", "filterStyle", "sortCatalog"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = id === "searchCatalog" ? "" : id === "sortCatalog" ? "padrao" : "todos";
  });
  const stockCheck = document.getElementById("onlyInStock");
  if (stockCheck) stockCheck.checked = false;
  document.querySelectorAll(".quick-tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.catTarget === "todos");
  });
  renderViews();
});

const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mainNav = document.getElementById("mainNav");
mobileMenuBtn?.addEventListener("click", () => {
  const isOpen = mainNav?.classList.toggle("is-open");
  mobileMenuBtn.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

document.getElementById("openCartBtn")?.addEventListener("click", openCart);
document.getElementById("closeCartBtn")?.addEventListener("click", closeCart);
cartOverlay?.addEventListener("click", closeCart);
document.getElementById("closeModalBtn")?.addEventListener("click", closeQuickView);
quickViewModal?.addEventListener("click", (e) => {
  if (e.target === quickViewModal) closeQuickView();
});

const deliveryModeSelect = document.getElementById("deliveryMode");
const deliveryAddressGroup = document.getElementById("deliveryAddressGroup");

deliveryModeSelect?.addEventListener("change", () => {
  if (!deliveryAddressGroup) return;
  deliveryAddressGroup.hidden = deliveryModeSelect.value !== "Entrega";
});

document.getElementById("checkoutBtn")?.addEventListener("click", async () => {
  if (cart.length === 0) return;

  const customerNameInput = document.getElementById("customerName");
  const customerPhoneInput = document.getElementById("customerPhone");
  const deliveryModeInput = document.getElementById("deliveryMode");
  const addrStreetInput = document.getElementById("addrStreet");
  const addrNeighborhoodInput = document.getElementById("addrNeighborhood");
  const addrComplementInput = document.getElementById("addrComplement");
  const paymentMethodInput = document.getElementById("paymentMethod");
  const orderNotesInput = document.getElementById("orderNotes");

  const customerName = customerNameInput?.value.trim() || "";
  if (!customerName) {
    alert("Por favor, informe seu nome antes de reservar.");
    customerNameInput?.focus();
    return;
  }

  const isDelivery = deliveryModeInput?.value === "Entrega";
  const street = addrStreetInput?.value.trim() || "";
  const neighborhood = addrNeighborhoodInput?.value.trim() || "";
  const complement = addrComplementInput?.value.trim() || "";

  if (isDelivery && (!street || !neighborhood)) {
    alert("Para entrega, preencha a rua/número e o bairro.");
    (!street ? addrStreetInput : addrNeighborhoodInput)?.focus();
    return;
  }

  const fullAddress = isDelivery
    ? `${street}, Bairro ${neighborhood}${complement ? ` (${complement})` : ""}`
    : "Retirar na loja física";

  const customerInfo = {
    nome: customerName,
    telefone: customerPhoneInput?.value.trim() || "Não informado",
    modalidade: deliveryModeInput?.value || "Retirada na loja",
    endereco: isDelivery ? { rua: street, bairro: neighborhood, complemento: complement, texto: fullAddress } : null,
    pagamento: paymentMethodInput?.value || "Pix",
    observacoes: orderNotesInput?.value.trim() || ""
  };

  const checkoutBtn = document.getElementById("checkoutBtn");
  const snapshotCart = [...cart];
  const lines = snapshotCart.map(
    (item) => `• ${item.qty}x ${item.name} [Tam. ${item.size}] — ${formatBRL(item.price * item.qty)}`
  );
  const total = snapshotCart.reduce((acc, item) => acc + item.price * item.qty, 0);

  if (checkoutBtn) checkoutBtn.disabled = true;

  try {
    const orderId = await createReservation(snapshotCart, customerInfo);
    cart = [];
    saveCart();
    updateCartUI();
    closeCart();

    const message =
      `Olá, Lagunna Boutique! Reserva #${orderId.slice(0, 6)} registrada:\n\n` +
      `*Cliente:* ${customerInfo.nome}\n` +
      `*Contato:* ${customerInfo.telefone}\n` +
      `*Recebimento:* ${customerInfo.modalidade}\n` +
      `${isDelivery ? `*Endereço:* ${fullAddress}\n` : ""}` +
      `*Pagamento:* ${customerInfo.pagamento}\n` +
      `${customerInfo.observacoes ? `*Obs.:* ${customerInfo.observacoes}\n` : ""}\n` +
      `*Itens:*\n${lines.join("\n")}\n\n` +
      `*Total estimado:* ${formatBRL(total)}`;

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  } catch (err) {
    alert(err.message || "Não foi possível concluir a reserva.");
    if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
  }
});

subscribeToCatalog((items) => {
  catalog = items;
  syncCartWithCatalog();
  renderViews();
});

updateCartUI();
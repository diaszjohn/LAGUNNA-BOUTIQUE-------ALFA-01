const WHATSAPP_NUMBER = "5586994499556";

const catalog = [
  {
    id: 1,
    name: "Vestido Midi Lagunna",
    category: "vestidos",
    style: "Resort & Praia",
    material: "Linho Misto • Verde Sálvia",
    price: 389.90,
    stock: 4,
    featured: true,
    description: "Vestido midi fluido com alças reguláveis e caimento leve, ideal para dias quentes com elegância natural."
  },
  {
    id: 2,
    name: "Conjunto Brisa Maré",
    category: "conjuntos",
    style: "Casual Chic",
    material: "Viscose Texturizada • Off-White",
    price: 429.00,
    stock: 2,
    featured: true,
    description: "Cropped estruturado com amarração posterior e pantalona de cintura alta com forro interno."
  },
  {
    id: 3,
    name: "Blazer Alfaiataria Areia",
    category: "alfaiataria",
    style: "Minimalista",
    material: "Crepe de Alfaiataria • Cru",
    price: 459.90,
    stock: 5,
    featured: true,
    description: "Corte reto atemporal com ombreiras sutis e fechamento frontal por botão forrado."
  },
  {
    id: 4,
    name: "Vestido Longo Aura",
    category: "vestidos",
    style: "Elegante & Noite",
    material: "Seda Fria • Oliva Profundo",
    price: 519.00,
    stock: 1,
    featured: false,
    description: "Decote degagê delicado e fenda lateral equilibrada para eventos noturnos e ocasiões especiais."
  },
  {
    id: 5,
    name: "Conjunto Duna Linho",
    category: "conjuntos",
    style: "Minimalista",
    material: "100% Linho • Areia",
    price: 449.00,
    stock: 0,
    featured: false,
    description: "Colete alongado de botões frontais acompanhado de short-saia de alfaiataria."
  },
  {
    id: 6,
    name: "Calça Pantalona Sol",
    category: "alfaiataria",
    style: "Casual Chic",
    material: "Linho & Algodão • Sálvia",
    price: 319.90,
    stock: 6,
    featured: false,
    description: "Modelagem ampla com pregas frontais e bolsos laterais funcionais."
  },
  {
    id: 7,
    name: "Lenço Seda Ondas",
    category: "acessorios",
    style: "Resort & Praia",
    material: "Toque de Seda • Estampa Exclusiva",
    price: 149.90,
    stock: 8,
    featured: false,
    description: "Acessório versátil para usar no pescoço, cabelo ou alça de bolsa."
  },
  {
    id: 8,
    name: "Cinto Couro Orgânico",
    category: "acessorios",
    style: "Casual Chic",
    material: "Couro Legítimo • Fivela Fosca",
    price: 179.00,
    stock: 3,
    featured: false,
    description: "Acabamento minimalista com fivela arredondada em metal escovado."
  }
];

let cart = JSON.parse(localStorage.getItem("lagunna_cart")) || [];

function saveCart() {
  localStorage.setItem("lagunna_cart", JSON.stringify(cart));
}

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStockStatus(stock) {
  if (stock <= 0) {
    return { label: "Esgotado no estoque", className: "stock-pill--out", available: false };
  }
  if (stock <= 2) {
    return { label: `Últimas ${stock} unidade(s) em estoque`, className: "stock-pill--low", available: true };
  }
  return { label: `Em estoque (${stock} disponíveis)`, className: "stock-pill--ok", available: true };
}

function createProductCard(product) {
  const status = getStockStatus(product.stock);
  return `
    <article class="card ${!status.available ? "card--out" : ""}">
      <div class="card__visual">
        <div class="card__badges">
          <span class="badge">${product.category}</span>
          <span class="badge badge--style">${product.style}</span>
        </div>
        <svg width="68" height="68" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="#B2B8A6" stroke="#F7F5F0" stroke-width="3"/>
          <path d="M14 61 Q26 53 38 61 T62 61 T86 61" stroke="#F7F5F0" stroke-width="3.8" stroke-linecap="round"/>
          <path d="M18 73 Q30 65 42 73 T66 73 T82 73" stroke="#F7F5F0" stroke-width="3.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="card__body">
        <h3 class="card__title">${product.name}</h3>
        <p class="card__material">${product.material}</p>
        <span class="stock-pill ${status.className}">${status.label}</span>
        <div class="card__price">${formatBRL(product.price)}</div>
        <div class="card__actions">
          <button type="button" class="btn btn--outline" onclick="openQuickView(${product.id})">Detalhes</button>
          <button type="button" class="btn btn--primary" ${!status.available ? "disabled" : ""} onclick="addToCart(${product.id})">
            ${status.available ? "Adicionar" : "Indisponível"}
          </button>
        </div>
      </div>
    </article>
  `;
}

/* Renderização da Vitrine (index.html) */
const showcaseGrid = document.getElementById("showcaseGrid");
if (showcaseGrid) {
  const featuredItems = catalog.filter((item) => item.featured);
  showcaseGrid.innerHTML = featuredItems.map(createProductCard).join("");
}

/* Renderização do Catálogo Completo com Filtros (catalogo.html) */
const catalogGrid = document.getElementById("catalogGrid");
const searchCatalog = document.getElementById("searchCatalog");
const filterCategory = document.getElementById("filterCategory");
const filterStyle = document.getElementById("filterStyle");
const sortCatalog = document.getElementById("sortCatalog");
const onlyInStock = document.getElementById("onlyInStock");
const catalogStats = document.getElementById("catalogStats");
const quickTabs = document.querySelectorAll(".quick-tab");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");

function syncQuickTabs(catValue) {
  quickTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.catTarget === catValue);
  });
}

function renderFullCatalog() {
  if (!catalogGrid) return;

  const searchTerm = searchCatalog ? searchCatalog.value.trim().toLowerCase() : "";
  const catValue = filterCategory ? filterCategory.value : "todos";
  const styleValue = filterStyle ? filterStyle.value : "todos";
  const sortValue = sortCatalog ? sortCatalog.value : "padrao";
  const stockOnly = onlyInStock ? onlyInStock.checked : false;

  syncQuickTabs(catValue);

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

  if (sortValue === "menor") {
    filtered = [...filtered].sort((a, b) => a.price - b.price);
  } else if (sortValue === "maior") {
    filtered = [...filtered].sort((a, b) => b.price - a.price);
  }

  if (catalogStats) {
    catalogStats.textContent = `Exibindo ${filtered.length} de ${catalog.length} peças do catálogo`;
  }

  if (filtered.length === 0) {
    catalogGrid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding: 40px 0;">Nenhuma peça encontrada com esses filtros.</p>`;
    return;
  }

  catalogGrid.innerHTML = filtered.map(createProductCard).join("");
}

if (catalogGrid) {
  quickTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (filterCategory) {
        filterCategory.value = tab.dataset.catTarget;
      }
      renderFullCatalog();
    });
  });

  searchCatalog?.addEventListener("input", renderFullCatalog);
  filterCategory?.addEventListener("change", renderFullCatalog);
  filterStyle?.addEventListener("change", renderFullCatalog);
  sortCatalog?.addEventListener("change", renderFullCatalog);
  onlyInStock?.addEventListener("change", renderFullCatalog);

  resetFiltersBtn?.addEventListener("click", () => {
    if (searchCatalog) searchCatalog.value = "";
    if (filterCategory) filterCategory.value = "todos";
    if (filterStyle) filterStyle.value = "todos";
    if (sortCatalog) sortCatalog.value = "padrao";
    if (onlyInStock) onlyInStock.checked = false;
    renderFullCatalog();
  });

  renderFullCatalog();
}

/* Menu Mobile */
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mainNav = document.getElementById("mainNav");
mobileMenuBtn?.addEventListener("click", () => {
  const isOpen = mainNav?.classList.toggle("is-open");
  mobileMenuBtn.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

/* Sacola e Controle de Quantidade pelo Estoque */
function addToCart(productId) {
  const product = catalog.find((p) => p.id === productId);
  if (!product || product.stock <= 0) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    if (existing.qty >= product.stock) {
      alert(`Temos apenas ${product.stock} unidade(s) desta peça em estoque.`);
      return;
    }
    existing.qty += 1;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1
    });
  }

  saveCart();
  updateCartUI();
  openCart();
}

function removeFromCart(productId) {
  cart = cart.filter((item) => item.id !== productId);
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

  cartItemsEl.innerHTML = cart.map((item) => `
    <div class="cart-item">
      <div>
        <div class="cart-item__title">${item.name}</div>
        <div class="cart-item__meta">${item.qty}x ${formatBRL(item.price)}</div>
      </div>
      <button type="button" class="cart-item__remove" onclick="removeFromCart(${item.id})">Remover</button>
    </div>
  `).join("");
}

/* Gaveta e Modal */
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
    <p style="margin-bottom:18px; font-size:0.94rem;">${product.description}</p>
    <div class="card__price" style="font-size:1.2rem;">${formatBRL(product.price)}</div>
    <button type="button" class="btn btn--primary btn--full" ${!status.available ? "disabled" : ""} onclick="addToCart(${product.id}); closeQuickView();">
      ${status.available ? "Adicionar à Sacola" : "Produto Esgotado"}
    </button>
  `;
  quickViewModal.hidden = false;
}

function closeQuickView() {
  if (!quickViewModal) return;
  quickViewModal.hidden = true;
}

document.getElementById("openCartBtn")?.addEventListener("click", openCart);
document.getElementById("closeCartBtn")?.addEventListener("click", closeCart);
cartOverlay?.addEventListener("click", closeCart);
document.getElementById("closeModalBtn")?.addEventListener("click", closeQuickView);

quickViewModal?.addEventListener("click", (e) => {
  if (e.target === quickViewModal) closeQuickView();
});

/* Finalização direta no WhatsApp da Lagunna Boutique */
document.getElementById("checkoutBtn")?.addEventListener("click", () => {
  if (cart.length === 0) return;

  const lines = cart.map((item) => `• ${item.qty}x ${item.name} (${formatBRL(item.price * item.qty)})`);
  const total = cart.reduce((acc, item) => acc + item.price * item.qty, 0);

  const message =
    `Olá, Lagunna Boutique! Gostaria de confirmar a disponibilidade em estoque e reservar:\n\n` +
    `${lines.join("\n")}\n\n` +
    `*Total estimado:* ${formatBRL(total)}`;

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

updateCartUI();
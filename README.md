# LAGUNNA-BOUTIQUE-------ALFA-01
# LAGUNNA BOUTIQUE — Vitrine Digital & Gestão de Estoque

Aplicação web desenvolvida para a **Lagunna Boutique**, combinando vitrine pública com catálogo filtrável, sacola de reservas integrada ao WhatsApp e painel administrativo privado para controle de estoque por grade de tamanhos em tempo real.

---

## Funcionalidades

### Vitrine Pública (`index.html` e `catalogo.html`)
- **Vitrine da Semana:** Exibição automática das peças marcadas como destaque no painel administrativo.
- **Catálogo Completo:** Busca por nome/tecido, filtros por categoria (`vestidos`, `conjuntos`, `alfaiataria`, `acessorios`), estilo, ordenação por preço e filtro de disponibilidade.
- **Grade de Tamanhos em Tempo Real:** Seleção dinâmica de tamanhos (`PP`, `P`, `M`, `G`, `GG`, `Único`) com bloqueio automático de tamanhos esgotados.
- **Sacola & Checkout via WhatsApp:**
  - Persistência local (`localStorage`) sincronizada em tempo real com o estoque do Firestore.
  - Escolha entre **Retirada na loja** ou **Entrega em domicílio** (com campos condicionais de rua/número, bairro e complemento).
  - Seleção de forma de pagamento (`Pix`, `Cartão de Crédito`, `Cartão de Débito`, `Dinheiro`) e observações.
  - Registro automático da reserva no banco de dados e abertura do WhatsApp com o resumo estruturado do pedido.

### Painel Administrativo (`gestao.html`)
- **Autenticação Restrita:** Login via Firebase Authentication (`Email/Senha`) com rota oculta (`noindex, nofollow`).
- **Indicadores (KPIs):** Contagem em tempo real de modelos cadastrados, peças totais em estoque, alertas de estoque baixo (`≤ 2` unidades) e itens esgotados.
- **Controle de Estoque por Grade:** Edição rápida da quantidade de cada tamanho com registro automático de auditoria.
- **Cadastro e Edição de Peças:** Gerenciamento completo de ficha técnica, grade inicial, foto opcional e destaque na vitrine.
- **Gestão de Reservas:** Confirmação de pedidos com baixa atômica no estoque via transação (`runTransaction`) e cancelamento com estorno automático de saldo.
- **Histórico de Movimentações:** Auditoria de entradas, saídas manuais, vendas confirmadas e estornos.

---

## Tecnologias Utilizadas

- **HTML5 & CSS3:** Arquitetura modular responsiva com variáveis CSS e identidade visual personalizada.
- **JavaScript (ES Modules):** Lógica reativa desacoplada em serviços (`catalog-service.js`, `order-service.js`).
- **Firebase:**
  - **Cloud Firestore:** Banco de dados NoSQL em tempo real (`produtos`, `reservas`, `movimentacoes_estoque`).
  - **Firebase Authentication:** Controle de acesso ao painel do gestor.

---

## Estrutura de Arquivos

```text
lagunna-boutique/
├── index.html               # Página inicial (Vitrine da Semana + Localização)
├── catalogo.html            # Catálogo completo com filtros e busca
├── gestao.html              # Painel administrativo restrito
├── css/
│   ├── style.css            # Estilos globais, componentes, sacola e modal
│   ├── catalog.css          # Estilos dos filtros e atalhos do catálogo
│   └── admin.css            # Estilos do painel de gestão e KPIs
└── js/
    ├── firebase-config.js   # Inicialização do Firebase (App, Firestore, Auth)
    ├── catalog-service.js   # Listener em tempo real e normalização de tamanhos
    ├── order-service.js     # Registro de reservas no Firestore
    ├── script.js            # Lógica da vitrine, catálogo, sacola e checkout
    └── admin.js             # Lógica de autenticação, estoque, reservas e auditoria

(Step C: client wiring to server APIs)

(function(){
  const sel = s => document.querySelector(s);
  const menuDiv = sel('#menu');
  const cartDiv = sel('#cart');
  const restaurantsSelect = sel('#restaurants');
  const submitBtn = sel('#submitOrder');
  const subtotalSpan = sel('#subtotal');
  const taxSpan = sel('#tax');
  const deliverySpan = sel('#delivery');
  const totalSpan = sel('#total');
  const minOrderNote = sel('#minOrderNote');
  const submitHint = sel('#submitHint');

  // State
  let restaurants = [];
  let currentRestaurant = null; // full JSON
  let cart = {}; // itemId -> qty

  function money(n) { return '$' + n.toFixed(2); }

  async function loadRestaurants() {
    const res = await fetch('/api/restaurants');
    if (!res.ok) throw new Error('Failed to load restaurants');
    restaurants = await res.json();
    restaurantsSelect.innerHTML = '<option value=\"\">-- Select --</option>' +
      restaurants.map(r => `<option value=\"${r.id}\">${r.name}</option>`).join('');
  }

  async function loadRestaurant(id) {
    const res = await fetch('/api/restaurants/' + id);
    if (!res.ok) throw new Error('Restaurant not found');
    currentRestaurant = await res.json();
    minOrderNote.textContent = `Minimum order: ${money(currentRestaurant.min_order)}; Delivery fee: ${money(currentRestaurant.delivery_fee)}`;
    renderMenu();
    clearCart();
  }

  function clearMenu() { menuDiv.innerHTML = ''; }
  function clearCart() { cart = {}; renderCartAndTotals(); }

  function renderMenu() {
    clearMenu();
    if (!currentRestaurant) return;
    const menu = currentRestaurant.menu || {};
    const frag = document.createDocumentFragment();

    // For each category
    Object.keys(menu).forEach(catName => {
      const cat = menu[catName]; // object of itemId -> item
      const catEl = document.createElement('div');
      catEl.className = 'category';
      catEl.innerHTML = `<h3>${catName}</h3>`;
      const list = document.createElement('div');
      list.className = 'items';

      Object.entries(cat).forEach(([itemId, item]) => {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
          <div class="item-name"><strong>${item.name}</strong> — ${money(item.price)}</div>
          <div class="item-desc" style="color:#555;">${item.description || ''}</div>
          <div class="item-ctrls" style="margin-top:0.25rem;">
            <button class="add" data-item-id="${itemId}">Add</button>
            <button class="remove" data-item-id="${itemId}">Remove</button>
            <span class="qty" id="qty-${itemId}">0</span>
          </div>
        `;
        list.appendChild(row);
      });

      catEl.appendChild(list);
      frag.appendChild(catEl);
    });

    menuDiv.appendChild(frag);
  }

  function findItem(itemId) {
    if (!currentRestaurant) return null;
    for (const cat of Object.values(currentRestaurant.menu || {})) {
      if (Object.prototype.hasOwnProperty.call(cat, itemId)) return cat[itemId];
    }
    return null;
  }

  function renderCartAndTotals() {
    // render cart
    cartDiv.innerHTML = '';
    const entries = Object.entries(cart).filter(([_,q])=>q>0);
    if (entries.length === 0) {
      cartDiv.textContent = '(cart is empty)';
    } else {
      const ul = document.createElement('ul');
      entries.forEach(([itemId, qty]) => {
        const item = findItem(itemId);
        if (!item) return;
        const li = document.createElement('li');
        li.textContent = `${item.name} × ${qty} — ${money(item.price * qty)}`;
        ul.appendChild(li);
      });
      cartDiv.appendChild(ul);
    }

    // totals
    const subtotal = entries.reduce((sum,[itemId, qty]) => {
      const item = findItem(itemId); return item ? sum + item.price * qty : sum;
    }, 0);
    const tax = subtotal * 0.13;
    const delivery = currentRestaurant ? currentRestaurant.delivery_fee : 0;
    const total = subtotal + tax + delivery;

    subtotalSpan.textContent = money(subtotal);
    taxSpan.textContent = money(tax);
    deliverySpan.textContent = money(delivery);
    totalSpan.textContent = money(total);

    // enable/disable submit
    const min = currentRestaurant ? currentRestaurant.min_order : Infinity;
    const ok = subtotal >= min && entries.length > 0;
    submitBtn.disabled = !ok;
    submitHint.textContent = ok ? '' : (currentRestaurant ? `You need at least ${money(min)} subtotal to submit.` : '');

    // update per-item qty labels
    document.querySelectorAll('.item-ctrls .qty').forEach(span => {
      const id = span.id.replace('qty-','');
      span.textContent = cart[id] || 0;
    });
  }

  // Event listeners
  restaurantsSelect?.addEventListener('change', (e) => {
    const id = e.target.value;
    // Clear previous UI regardless
    clearMenu(); clearCart();
    if (id) loadRestaurant(id).catch(err => { console.error(err); });
  });

  menuDiv?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.itemId;
    if (!id) return;
    if (btn.classList.contains('add')) {
      cart[id] = (cart[id] || 0) + 1;
    } else if (btn.classList.contains('remove')) {
      cart[id] = Math.max(0, (cart[id] || 0) - 1);
    }
    renderCartAndTotals();
  });

  submitBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!currentRestaurant) return;
    // build items from cart
    const items = Object.entries(cart)
      .filter(([_,q]) => q > 0)
      .map(([itemId, qty]) => ({ itemId, qty }));
    if (items.length === 0) return;

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: currentRestaurant.id, items })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Order failed');

      // Reset UI to initial state
      restaurantsSelect.value = '';
      minOrderNote.textContent = '';
      submitHint.textContent = '';
      clearMenu();
      clearCart();
      renderCartAndTotals();
      alert('Order placed! Total charged: ' + (data.totals ? ('$' + data.totals.total.toFixed(2)) : 'see stats'));

    } catch (err) {
      alert('Order error: ' + err.message);
    }
  });

  // boot
  document.addEventListener('DOMContentLoaded', () => {
    loadRestaurants().catch(err => console.error(err));
    renderCartAndTotals();
  });
})();

// public/js/pages/home.js
import { listEvents } from '../api.js';
import { el, formatPrice } from '../ui.js';

export async function initHome() {
  const container = document.getElementById('events-container');
  const searchInput = document.getElementById('search-input');
  const citySelect = document.getElementById('city-select');
  const maxPriceInput = document.getElementById('max-price-input');
  const sortSelect = document.getElementById('sort-select');

  async function render() {
    container.textContent = 'Loading events...';
    try {
      const filters = {
        search: searchInput.value,
        city: citySelect.value,
        maxPrice: maxPriceInput.value,
        sort: sortSelect.value
      };
      const data = await listEvents(filters);
      container.textContent = '';

      if (data.events.length === 0) {
        container.appendChild(el('p', {}, ['No events found matching your criteria.']));
        return;
      }

      const grid = el('div', { className: 'events-grid' }, data.events.map(event => {
        const minPrice = Math.min(...event.tiers.map(t => t.price));
        return el('div', { className: 'event-card' }, [
          el('h3', {}, [event.title]),
          el('p', { style: 'color: var(--text-muted); margin: 0;' }, [`📍 ${event.venue}, ${event.city}`]),
          el('p', { style: 'margin: 0;' }, [`📅 ${new Date(event.date).toLocaleDateString()}`]),
          el('p', { style: 'font-weight: bold; color: var(--primary);' }, [`From ${formatPrice(minPrice)}`]),
          el('a', { className: 'btn', href: `event.html?id=${event.id}` }, ['View Details & Tickets'])
        ]);
      }));

      container.appendChild(grid);
    } catch (err) {
      container.textContent = 'Failed to load events.';
      console.error(err);
    }
  }

  searchInput.addEventListener('input', render);
  citySelect.addEventListener('change', render);
  maxPriceInput.addEventListener('input', render);
  sortSelect.addEventListener('change', render);

  render();
}
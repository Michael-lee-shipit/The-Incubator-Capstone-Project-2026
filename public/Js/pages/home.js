import { api } from '../api.js';
import { el, formatPrice } from '../ui.js';

export async function initHome() {
  const container = document.getElementById('events-container');
  const status = document.getElementById('events-status');
  const error = document.getElementById('events-error');
  const search = document.getElementById('search-input');
  const city = document.getElementById('city-select');
  const maxPrice = document.getElementById('max-price-input');
  const sort = document.getElementById('sort-select');
  let debounce;

  async function render() {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      status.textContent = 'Loading events…';
      error.hidden = true;
      container.replaceChildren();
      const filters = {
        q: search.value.trim(),
        city: city.value,
        maxPriceCents: maxPrice.value === '' ? undefined : Math.round(Number(maxPrice.value) * 100),
        sort: sort.value || 'date',
      };
      try {
        const { events } = await api.getEvents(filters);
        status.textContent = events.length ? '' : 'No events found matching your criteria.';
        for (const event of events) {
          container.append(el('article', { className: 'event-card' }, [
            el('h3', {}, [event.title]),
            el('p', {}, [`${event.venue} · ${event.city}`]),
            el('p', {}, [new Date(event.startsAt).toLocaleString()]),
            el('p', {}, [
              event.minPriceCents === null ? 'No ticket tiers yet' : `From ${formatPrice(event.minPriceCents)}`,
            ]),
            el('p', {}, [`${event.seatsLeft} seats remaining`]),
            el('a', { className: 'btn', href: `/event.html?id=${encodeURIComponent(event.id)}` }, ['View tickets']),
          ]));
        }
      } catch (requestError) {
        status.textContent = '';
        error.textContent = requestError.message;
        error.hidden = false;
      }
    }, search.value ? 180 : 0);
  }

  search.addEventListener('input', render);
  city.addEventListener('change', render);
  maxPrice.addEventListener('input', render);
  sort.addEventListener('change', render);
  await render();
}

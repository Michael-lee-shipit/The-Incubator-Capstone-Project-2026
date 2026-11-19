import { api } from '../api.js';
import { getAuthToken } from '../session.js';
import { el, formatPrice } from '../ui.js';

export async function initEvent() {
  const container = document.getElementById('event-detail-container');
  const status = document.getElementById('event-status');
  const error = document.getElementById('event-error');
  const eventId = new URLSearchParams(window.location.search).get('id');
  if (!eventId) {
    status.textContent = '';
    error.textContent = 'Event not found.';
    error.hidden = false;
    return;
  }

  try {
    const event = await api.getEvent(eventId);
    status.textContent = '';
    container.append(
      el('h2', {}, [event.title]),
      el('p', {}, [`${event.venue} · ${event.city} · ${new Date(event.startsAt).toLocaleString()}`]),
      el('h3', {}, ['Ticket tiers']),
    );

    for (const tier of event.tiers) {
      const quantity = el('input', {
        type: 'number',
        min: 1,
        max: Math.min(10, tier.seatsLeft),
        value: tier.seatsLeft > 0 ? 1 : 0,
        disabled: tier.seatsLeft < 1,
        'aria-label': `Quantity for ${tier.name}`,
      });
      const bookButton = el('button', {
        className: 'btn',
        type: 'button',
        disabled: tier.seatsLeft < 1,
      }, [tier.seatsLeft ? 'Book' : 'Sold out']);
      const row = el('div', { className: 'tier-row' }, [
        el('div', {}, [
          el('strong', {}, [tier.name]),
          el('span', {}, [` · ${formatPrice(tier.priceCents)} · ${tier.seatsLeft} left`]),
        ]),
        el('div', { className: 'nav-links' }, [quantity, bookButton]),
      ]);
      const checkout = el('div');
      bookButton.addEventListener('click', async () => {
        error.hidden = true;
        if (!getAuthToken()) {
          window.location.assign('/login.html');
          return;
        }
        bookButton.disabled = true;
        bookButton.textContent = 'Booking…';
        try {
          const booking = await api.createBooking({ tierId: tier.id, quantity: Number(quantity.value) });
          checkout.replaceChildren(
            el('p', {}, [`Booking ${booking.reference} is pending. Total: ${formatPrice(booking.amountCents)}.`]),
          );
          const paymentToken = el('select', { 'aria-label': 'Mock payment result' }, [
            el('option', { value: 'tok_success' }, ['Successful mock payment']),
            el('option', { value: 'tok_declined' }, ['Declined mock payment']),
          ]);
          const payButton = el('button', { className: 'btn', type: 'button' }, ['Pay now']);
          payButton.addEventListener('click', async () => {
            payButton.disabled = true;
            try {
              const paid = await api.payBooking(booking.reference, paymentToken.value);
              checkout.replaceChildren(
                el('p', { className: 'success-message' }, [`Payment ${paid.status}. Reference: ${paid.reference}`]),
                el('a', { href: '/tickets.html' }, ['View my tickets']),
              );
            } catch (requestError) {
              error.textContent = requestError.message;
              error.hidden = false;
              payButton.disabled = false;
            }
          });
          checkout.append(paymentToken, payButton);
        } catch (requestError) {
          error.textContent = requestError.message;
          error.hidden = false;
          bookButton.disabled = false;
          bookButton.textContent = 'Book';
        }
      });
      container.append(row, checkout);
    }
  } catch (requestError) {
    status.textContent = '';
    error.textContent = requestError.message;
    error.hidden = false;
  }
}

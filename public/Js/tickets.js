import { api, requireSession } from './api.js';
import { clearSession } from './session.js';
import { el, formatPrice } from './ui.js';

const status = document.getElementById('page-status');
const error = document.getElementById('error');
const list = document.getElementById('bookings-list');

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.assign('/login.html');
});

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

async function loadBookings() {
  error.hidden = true;
  status.textContent = 'Loading your bookings…';
  list.replaceChildren();
  try {
    const { bookings } = await api.getBookings();
    status.textContent = bookings.length ? '' : 'You have no bookings yet.';
    for (const booking of bookings) {
      const details = el('div', {}, [
        el('h3', {}, [`Booking ${booking.reference}`]),
        el('p', {}, [`${booking.quantity} ticket(s) · ${formatPrice(booking.amountCents)} · ${booking.status}`]),
        el('p', {}, [`Event: ${booking.eventId} · Tier: ${booking.tierId}`]),
      ]);
      const card = el('li', { className: 'panel booking-card' }, [details]);
      if (booking.status === 'pending') {
        const actions = el('div', { className: 'nav-links' });
        const payButton = el('button', { className: 'btn', type: 'button' }, ['Pay with mock success']);
        payButton.addEventListener('click', async () => {
          payButton.disabled = true;
          try {
            await api.payBooking(booking.reference, 'tok_success');
            await loadBookings();
          } catch (requestError) {
            showError(requestError.message);
            payButton.disabled = false;
          }
        });
        const cancelButton = el('button', { className: 'btn btn-danger', type: 'button' }, ['Cancel booking']);
        cancelButton.addEventListener('click', async () => {
          cancelButton.disabled = true;
          try {
            await api.cancelBooking(booking.reference);
            await loadBookings();
          } catch (requestError) {
            showError(requestError.message);
            cancelButton.disabled = false;
          }
        });
        actions.append(payButton, cancelButton);
        card.append(actions);
      }
      list.append(card);
    }
  } catch (requestError) {
    status.textContent = '';
    showError(requestError.message);
  }
}

const user = await requireSession('attendee');
if (user) {
  status.textContent = `Signed in as ${user.email}`;
  await loadBookings();
}

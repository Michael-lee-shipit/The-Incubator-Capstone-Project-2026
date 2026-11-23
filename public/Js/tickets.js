import { api, requireSession } from './api.js';
import { clearSession } from './session.js';
import { el, formatPrice } from './ui.js';

const status = document.getElementById('page-status');
const error = document.getElementById('error');
const list = document.getElementById('bookings-list');
const offersStatus = document.getElementById('offers-status');
const offersList = document.getElementById('offers-list');
let offersTimer;

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.assign('/login.html');
});

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function formatExactPrice(cents) {
  return `₦${(cents / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function updateOfferCountdowns() {
  for (const countdown of offersList.querySelectorAll('[data-expires-at]')) {
    const remaining = Math.max(0, Date.parse(countdown.dataset.expiresAt) - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    countdown.textContent = remaining > 0
      ? `Offer expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : 'Offer expired; refreshing…';
  }
}

async function loadOffers() {
  clearInterval(offersTimer);
  offersList.replaceChildren();
  offersStatus.textContent = 'Loading offers…';
  try {
    const { offers } = await api.getWaitlistOffers();
    offersStatus.textContent = offers.length ? '' : 'You have no active offers.';
    for (const offer of offers) {
      const countdown = el('p', { 'data-expires-at': offer.expiresAt });
      const acceptButton = el('button', { className: 'btn', type: 'button' }, ['Accept offer']);
      acceptButton.addEventListener('click', async () => {
        acceptButton.disabled = true;
        try {
          const result = await api.acceptWaitlistOffer(offer.id);
          showError('');
          await Promise.all([loadOffers(), loadBookings()]);
          status.textContent = `Offer accepted. Booking ${result.booking.reference} is pending payment.`;
        } catch (requestError) {
          showError(requestError.message);
          acceptButton.disabled = false;
          await loadOffers();
        }
      });
      offersList.append(el('li', { className: 'panel' }, [
        el('p', {}, [`${offer.quantity} ticket(s) for tier ${offer.tierId}`]),
        countdown,
        acceptButton,
      ]));
    }
    updateOfferCountdowns();
    if (offers.length) offersTimer = setInterval(updateOfferCountdowns, 1000);
  } catch (requestError) {
    offersStatus.textContent = '';
    showError(requestError.message);
  }
}

async function cancelBooking(booking, card) {
  error.hidden = true;
  try {
    const refund = booking.status === 'paid'
      ? await api.previewRefund(booking.reference)
      : { amountCents: 0, percentage: 0 };
    const prompt = booking.status === 'paid'
      ? `Refund on cancellation: ${formatExactPrice(refund.amountCents)} (${refund.percentage}%). Confirm cancellation?`
      : 'This unpaid booking has no refund. Confirm cancellation to release the seats?';
    const confirmation = el('div', { className: 'panel' }, [el('p', {}, [prompt])]);
    const confirmButton = el('button', { className: 'btn btn-danger', type: 'button' }, ['Confirm cancellation']);
    const keepButton = el('button', { className: 'btn btn-secondary', type: 'button' }, ['Keep booking']);
    keepButton.addEventListener('click', () => confirmation.remove());
    confirmButton.addEventListener('click', async () => {
      confirmButton.disabled = true;
      try {
        await api.cancelBooking(booking.reference);
        await loadBookings();
        await loadOffers();
      } catch (requestError) {
        showError(requestError.message);
        confirmButton.disabled = false;
      }
    });
    confirmation.append(el('div', { className: 'nav-links' }, [confirmButton, keepButton]));
    card.append(confirmation);
  } catch (requestError) {
    showError(requestError.message);
  }
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
        cancelButton.addEventListener('click', () => cancelBooking(booking, card));
        actions.append(payButton, cancelButton);
        card.append(actions);
      } else if (booking.status === 'paid') {
        const cancelButton = el('button', { className: 'btn btn-danger', type: 'button' }, ['Cancel booking']);
        cancelButton.addEventListener('click', () => cancelBooking(booking, card));
        card.append(cancelButton);
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
  await Promise.all([loadBookings(), loadOffers()]);
}

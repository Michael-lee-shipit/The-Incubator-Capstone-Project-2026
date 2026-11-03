// public/js/pages/event.js
import { getEvent, createBooking, payBooking } from '../api.js';
import { el, formatPrice } from '../ui.js';

export async function initEvent() {
  const container = document.getElementById('event-detail-container');
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('id');

  if (!eventId) {
    container.textContent = 'Event not found.';
    return;
  }

  try {
    const { event } = await getEvent(eventId);
    container.textContent = '';

    const titleEl = el('h2', {}, [event.title]);
    const metaEl = el('p', { style: 'color: var(--text-muted);' }, [`📍 ${event.venue}, ${event.city} | 📅 ${new Date(event.date).toLocaleString()}`]);
    
    const tiersContainer = el('div', { style: 'margin-top: 1.5rem;' }, [el('h3', {}, ['Ticket Tiers'])]);

    let activeBooking = null;
    let timerInterval = null;
    const checkoutArea = el('div', { style: 'margin-top: 2rem;' });

    event.tiers.forEach(tier => {
      const available = tier.capacity - tier.sold;
      const isSoldOut = available <= 0;

      const qtyInput = el('input', { 
        type: 'number', 
        min: '1', 
        max: Math.min(10, available), 
        value: '1', 
        disabled: isSoldOut,
        style: 'width: 60px; padding: 0.25rem;'
      });

      const bookBtn = el('button', {
        className: 'btn',
        disabled: isSoldOut,
        onclick: async () => {
          try {
            const qty = parseInt(qtyInput.value, 10);
            const res = await createBooking({ eventId: event.id, tierId: tier.id, quantity: qty });
            activeBooking = res.booking;
            startCheckoutFlow(activeBooking, tier, qty);
          } catch (err) {
            alert('Booking failed: ' + err.message);
          }
        }
      }, [isSoldOut ? 'Sold Out' : 'Book Tickets']);

      const tierRow = el('div', { className: 'tier-row' }, [
        el('div', {}, [
          el('strong', {}, [tier.name]),
          el('span', { style: 'margin-left: 1rem; color: var(--text-muted);' }, [formatPrice(tier.price)]),
          isSoldOut ? el('span', { className: 'badge-soldout', style: 'margin-left: 1rem;' }, ['Sold Out']) :
                      el('span', { style: 'margin-left: 1rem; font-size: 0.85rem; color: var(--text-muted);' }, [`(${available} left)`])
        ]),
        el('div', { style: 'display: flex; gap: 0.5rem; align-items: center;' }, [
          isSoldOut ? null : el('label', {}, [document.createTextNode('Qty '), qtyInput]),
          bookBtn
        ])
      ]);

      tiersContainer.appendChild(tierRow);
    });

    function startCheckoutFlow(booking, tier, qty) {
      if (timerInterval) clearInterval(timerInterval);
      checkoutArea.textContent = '';

      const timerSpan = el('span', { className: 'timer' }, ['05:00']);
      const cardInput = el('input', { type: 'text', placeholder: 'Card Number (ends in 0000 to fail)', style: 'padding: 0.5rem; width: 250px;' });
      const errorDiv = el('div', { style: 'display: none;' });

      const payBtn = el('button', {
        className: 'btn',
        onclick: async () => {
          errorDiv.style.display = 'none';
          try {
            await payBooking({ reference: booking.reference, cardNumber: cardInput.value });
            clearInterval(timerInterval);
            checkoutArea.textContent = '';
            checkoutArea.appendChild(el('div', { style: 'background: rgba(34,197,94,0.1); border: 1px solid var(--success); padding: 1rem; border-radius: 4px; color: var(--success);' }, [
              `🎉 Payment successful! Booking reference: ${booking.reference}. Seats confirmed.`
            ]));
          } catch (err) {
            errorDiv.style.display = 'block';
            errorDiv.className = 'alert-error';
            errorDiv.textContent = err.message === 'PAYMENT_DECLINED' ? 'Card declined. Please try another card or check details.' : 'Payment error: ' + err.message;
          }
        }
      }, [`Pay ${formatPrice(tier.price * qty)}`]);

      const checkoutBox = el('div', { style: 'background: var(--card-bg); border: 1px solid var(--border); padding: 1.5rem; border-radius: 8px;' }, [
        el('h3', {}, ['Checkout']),
        el('p', {}, [`Holding ${qty} x ${tier.name} ticket(s) for ${event.title}. Total: ${formatPrice(tier.price * qty)}`]),
        el('p', {}, [document.createTextNode('Time remaining to pay: '), timerSpan]),
        errorDiv,
        el('div', { style: 'display: flex; gap: 0.75rem; align-items: center; margin-top: 1rem;' }, [
          el('label', {}, [document.createTextNode('Mock Card Number: '), cardInput]),
          payBtn
        ])
      ]);

      checkoutArea.appendChild(checkoutBox);

      // Countdown timer logic
      const updateTimer = () => {
        const remaining = booking.expiresAt - Date.now();
        if (remaining <= 0) {
          clearInterval(timerInterval);
          checkoutArea.textContent = '';
          checkoutArea.appendChild(el('div', { className: 'alert-error' }, ['Booking session expired. Please select tickets again.']));
          return;
        }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerSpan.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      updateTimer();
      timerInterval = setInterval(updateTimer, 1000);
    }

    container.appendChild(titleEl);
    container.appendChild(metaEl);
    container.appendChild(tiersContainer);
    container.appendChild(checkoutArea);

  } catch (err) {
    container.textContent = 'Failed to load event details.';
    console.error(err);
  }
}
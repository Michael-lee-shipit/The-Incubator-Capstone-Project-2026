import { api } from './api.js';
import { clearSession } from './session.js';

const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const bookingsList = document.getElementById('bookings-list');
const logoutBtn = document.getElementById('logout-btn');

logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = '/login.html';
});

async function loadBookings() {
    loadingEl.style.display = 'block';
    errorEl.style.display = 'none';
    try {
        const data = await api.getBookings();
        bookingsList.innerHTML = '';
        
        if (!data.bookings || data.bookings.length === 0) {
            bookingsList.innerHTML = '<li>You have no bookings yet.</li>';
            return;
        }

        data.bookings.forEach(b => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 15px; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
            li.innerHTML = `
                <div>
                    <strong>Reference:</strong> ${b.reference}<br>
                    <strong>Status:</strong> <span style="text-transform: uppercase;">${b.status}</span><br>
                    <strong>Quantity:</strong> ${b.quantity}
                </div>
            `;
            
            if (b.status === 'pending') {
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = 'Cancel Booking';
                cancelBtn.style.cssText = 'padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;';
                cancelBtn.onclick = async () => {
                    try {
                        await api.cancelBooking(b.id || b.reference);
                        loadBookings();
                    } catch (err) {
                        alert(err.message);
                    }
                };
                li.appendChild(cancelBtn);
            }

            bookingsList.appendChild(li);
        });
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    } finally {
        loadingEl.style.display = 'none';
    }
}

loadBookings();
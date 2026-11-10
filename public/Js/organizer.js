import { api } from './api.js';
import { clearSession } from './session.js';

const eventForm = document.getElementById('create-event-form');
const eventsList = document.getElementById('events-list');
const errorEl = document.getElementById('error');
const logoutBtn = document.getElementById('logout-btn');

logoutBtn.addEventListener('click', () => {
    clearSession();
    window.location.href = '/login.html';
});

async function loadOrganizerEvents() {
    errorEl.style.display = 'none';
    try {
        const data = await api.getEvents();
        eventsList.innerHTML = '';
        
        if (!data.events || data.events.length === 0) {
            eventsList.innerHTML = '<li>No events found.</li>';
            return;
        }

        data.events.forEach(ev => {
            const li = document.createElement('li');
            li.style.cssText = 'padding: 15px; border: 1px solid #ddd; margin-bottom: 10px; border-radius: 4px; background: #fff;';
            li.innerHTML = `
                <h3>${ev.title}</h3>
                <p><strong>City:</strong> ${ev.city} | <strong>Venue:</strong> ${ev.venue}</p>
                <p><strong>Status:</strong> ${ev.published ? 'Published' : 'Draft'}</p>
                <button id="pub-${ev.id}" style="padding: 5px 10px; margin-right: 5px; cursor: pointer;">${ev.published ? 'Unpublish' : 'Publish'}</button>
                <button id="tier-${ev.id}" style="padding: 5px 10px; cursor: pointer;">Add Ticket Tier</button>
            `;
            eventsList.appendChild(li);

            document.getElementById(`pub-${ev.id}`).onclick = async () => {
                try {
                    if (ev.published) {
                        await api.unpublishEvent(ev.id);
                    } else {
                        await api.publishEvent(ev.id);
                    }
                    loadOrganizerEvents();
                } catch (err) {
                    alert(err.message);
                }
            };

            document.getElementById(`tier-${ev.id}`).onclick = async () => {
                const name = prompt('Tier Name (e.g., VIP, Regular):');
                const priceStr = prompt('Price in cents (e.g., 2000 for $20):');
                const capacityStr = prompt('Total Capacity:');
                
                if (name && priceStr && capacityStr) {
                    try {
                        await api.addTier(ev.id, {
                            name,
                            price: Number(priceStr),
                            capacity: Number(capacityStr)
                        });
                        alert('Tier added successfully!');
                        loadOrganizerEvents();
                    } catch (err) {
                        alert(err.message);
                    }
                }
            };
        });
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
}

eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const title = document.getElementById('title').value;
    const city = document.getElementById('city').value;
    const venue = document.getElementById('venue').value;
    const date = document.getElementById('date').value;

    try {
        await api.createEvent({ title, city, venue, date });
        eventForm.reset();
        loadOrganizerEvents();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
    }
});

loadOrganizerEvents();
import { api, requireSession } from './api.js';
import { clearSession } from './session.js';
import { el, formatPrice } from './ui.js';

const eventForm = document.getElementById('create-event-form');
const eventList = document.getElementById('events-list');
const error = document.getElementById('error');
const loading = document.getElementById('events-loading');
const pageStatus = document.getElementById('page-status');
const createButton = document.getElementById('create-event-button');

document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  window.location.assign('/login.html');
});

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function field(labelText, type, { min, step, required = true } = {}) {
  const input = el('input', { type, required });
  if (min !== undefined) input.min = String(min);
  if (step !== undefined) input.step = String(step);
  return el('label', {}, [labelText, input]);
}

async function loadEvents() {
  loading.textContent = 'Loading your events…';
  eventList.replaceChildren();
  try {
    const { events } = await api.getMyEvents();
    loading.textContent = events.length ? '' : 'You have not created any events yet.';
    for (const event of events) eventList.append(renderEvent(event));
  } catch (requestError) {
    loading.textContent = '';
    showError(requestError.message);
  }
}

function renderEvent(event) {
  const heading = el('div', {}, [
    el('h3', {}, [event.title]),
    el('p', {}, [`${event.city} · ${event.venue} · ${new Date(event.startsAt).toLocaleString()}`]),
    el('p', {}, [`Status: ${event.status}`]),
  ]);
  const tierList = el('ul', { className: 'tier-list' }, event.tiers.map((tier) =>
    el('li', {}, [`${tier.name} — ${formatPrice(tier.priceCents)}, ${tier.seatsLeft} of ${tier.capacity} left`]),
  ));
  const card = el('article', { className: 'panel' }, [heading, tierList]);

  const tierForm = el('form', { className: 'form-grid tier-form' }, [
    field('Tier name', 'text'),
    field('Price (kobo / cents)', 'number', { min: 0, step: 1 }),
    field('Capacity', 'number', { min: 1, step: 1 }),
    el('button', { className: 'btn btn-secondary', type: 'submit' }, ['Add tier']),
  ]);
  tierForm.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault();
    error.hidden = true;
    const [name, price, capacity] = tierForm.querySelectorAll('input');
    const button = tierForm.querySelector('button');
    button.disabled = true;
    try {
      await api.addTier(event.id, {
        name: name.value,
        priceCents: Number(price.value),
        capacity: Number(capacity.value),
      });
      await loadEvents();
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      button.disabled = false;
    }
  });
  card.append(tierForm);

  const publishButton = el('button', { className: 'btn', type: 'button' }, [
    event.status === 'published' ? 'Unpublish' : 'Publish',
  ]);
  publishButton.addEventListener('click', async () => {
    error.hidden = true;
    publishButton.disabled = true;
    try {
      if (event.status === 'published') await api.unpublishEvent(event.id);
      else await api.publishEvent(event.id);
      await loadEvents();
    } catch (requestError) {
      showError(requestError.message);
      publishButton.disabled = false;
    }
  });
  card.append(publishButton);
  return card;
}

eventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  createButton.disabled = true;
  createButton.textContent = 'Creating…';
  try {
    const startsAt = new Date(document.getElementById('starts-at').value);
    await api.createEvent({
      title: document.getElementById('title').value,
      city: document.getElementById('city').value,
      venue: document.getElementById('venue').value,
      startsAt: startsAt.toISOString(),
    });
    eventForm.reset();
    await loadEvents();
  } catch (requestError) {
    showError(requestError.message);
  } finally {
    createButton.disabled = false;
    createButton.textContent = 'Create draft';
  }
});

const user = await requireSession('organizer');
if (user) {
  pageStatus.textContent = `Signed in as ${user.email}`;
  await loadEvents();
}

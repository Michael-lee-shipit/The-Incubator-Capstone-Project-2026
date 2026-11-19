# API examples (Build 7)

Start the server with a signing secret set in the environment. Keep the secret
private and do not commit it:

```powershell
$env:JWT_SECRET = "replace-with-a-long-random-secret"
npm start
```

The API listens at `http://localhost:3000`; interactive docs are at
http://localhost:3000/docs.

## 1. Create accounts and sign in

Signup creates an attendee unless a role is specified. The supported roles are
`attendee`, `organizer` and `staff`.

```bash
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"organizer@example.test","password":"a-long-password","role":"organizer"}'
```

The response includes a signed `token` and public `user` details. Copy the
token and use it as a bearer token on protected calls:

```bash
ORGANIZER_TOKEN=paste-the-token-here
curl -s http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $ORGANIZER_TOKEN"
```

Create an attendee account the same way, omitting `role` or setting it to
`attendee`. Log in to an existing account with `POST /api/auth/login` and the
same email/password body. Passwords are stored as scrypt hashes and are never
included in responses.

## 2. Create an event (organizer)

```bash
curl -s -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ORGANIZER_TOKEN" \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Landmark Centre","startsAt":"2026-12-05T17:00:00Z"}'
```

`201` returns a draft event. Copy its id:

```bash
EVENT_ID=paste-the-id-here
```

Organizers can list only their own drafts and published events at
`GET /api/events/mine`.

## 3. Add a ticket tier and publish

`priceCents` is a whole number of the smallest currency unit; `500000` is
5,000.00.

```bash
curl -s -X POST "http://localhost:3000/api/events/$EVENT_ID/tiers" \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ORGANIZER_TOKEN" \
  -d '{"name":"General","priceCents":500000,"capacity":100}'
TIER_ID=paste-the-tier-id-here

curl -s -X POST "http://localhost:3000/api/events/$EVENT_ID/publish" \
  -H "Authorization: Bearer $ORGANIZER_TOKEN"
```

An event without tiers cannot be published (`409 INVALID_STATE`). Use
`POST /api/events/{id}/unpublish` to take an event off the public list.

## 4. Search and view events (anyone)

Search filters are optional: `q`, `city`, `from`, `to`, `maxPriceCents`,
`onlyAvailable=true`, and `sort` = `date` (default), `price` or `availability`.
A date-only `to` includes the whole day.

```bash
curl -s 'http://localhost:3000/api/events?city=lagos&maxPriceCents=600000&sort=price'
curl -s "http://localhost:3000/api/events/$EVENT_ID"
```

Draft events are not public. Only their owning organizer can view them.

## 5. Book and pay (attendee)

Create an attendee account and use its token:

```bash
ATTENDEE_TOKEN=paste-the-attendee-token-here
curl -s -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ATTENDEE_TOKEN" \
  -d "{\"tierId\":\"$TIER_ID\",\"quantity\":2}"
```

`201` returns a pending booking. The mock payment accepts tokens, not card
numbers: `tok_success` pays and `tok_declined` declines.

```bash
REF=paste-the-reference-here
curl -s -X POST "http://localhost:3000/api/bookings/$REF/pay" \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $ATTENDEE_TOKEN" \
  -d '{"paymentToken":"tok_success"}'
```

List only the signed-in attendee's bookings with `GET /api/bookings`, or view
one with `GET /api/bookings/{reference}`. A different attendee receives
`404 NOT_FOUND` when requesting the reference, so the API does not reveal
whether another person's booking exists.

Cancel a pending booking and release its seats:

```bash
curl -s -X POST "http://localhost:3000/api/bookings/$REF/cancel" \
  -H "Authorization: Bearer $ATTENDEE_TOKEN"
```

Paid-booking refunds arrive in Build 8.

## Errors and health check

Every error has the same shape:

```json
{ "error": { "code": "SOLD_OUT", "message": "Only 1 ticket(s) left in General" } }
```

`UNAUTHENTICATED` means a bearer token is missing, edited or expired.
`FORBIDDEN` means the role cannot perform the operation. Booking references
belonging to another attendee return `NOT_FOUND`.

```bash
curl -s http://localhost:3000/health
```

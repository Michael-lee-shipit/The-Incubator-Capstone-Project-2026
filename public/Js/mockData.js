// public/js/mockData.js

export const mockDatabase = {
  events: [
    {
      id: "evt_1",
      title: "Lagos Tech Summit 2026",
      city: "Lagos",
      venue: "Eko Hotel & Suites",
      date: "2026-06-15T09:00:00Z",
      published: true,
      tiers: [
        { id: "tier_1", name: "Regular", price: 1500000, capacity: 100, sold: 20 },
        { id: "tier_2", name: "VIP", price: 5000000, capacity: 20, sold: 19 }, // 1 seat left!
        { id: "tier_3", name: "VVIP", price: 12000000, capacity: 5, sold: 5 }   // Sold out!
      ]
    },
    {
      id: "evt_2",
      title: "Afrobeats Live in Abuja",
      city: "Abuja",
      venue: "Velodrome National Stadium",
      date: "2026-07-20T18:00:00Z",
      published: true,
      tiers: [
        { id: "tier_4", name: "General Admission", price: 1000000, capacity: 500, sold: 150 },
        { id: "tier_5", name: "Front Row", price: 3500000, capacity: 50, sold: 10 }
      ]
    },
    {
      id: "evt_3",
      title: "Port Harcourt Startup Meetup",
      city: "Port Harcourt",
      venue: "Genesis Cinema Hall",
      date: "2026-08-10T10:00:00Z",
      published: true,
      tiers: [
        { id: "tier_6", name: "Standard", price: 500000, capacity: 80, sold: 40 }
      ]
    }
  ],
  bookings: []
};
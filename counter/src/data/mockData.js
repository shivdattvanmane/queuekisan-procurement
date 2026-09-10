/* ============================================================
   KrushiDarpan ACC — Mock Data for SIH Prototype
   Replace with real API calls and Socket.IO in production.
   ============================================================ */

export const QUEUE_DATA = [
  {
    id: 'q-001',
    token: 'A021',
    farmerId: 'f-001',
    farmerName: 'Suresh Jadhav',
    crop: 'Onion',
    quantity: '250 kg',
    slot: '09:00 AM',
    checkIn: 'checked-in',
    queueStatus: 'completed',
    village: 'Sinnar',
    mobile: '9800000001',
    bookingId: 'BK-20260828-001',
  },
  {
    id: 'q-002',
    token: 'A022',
    farmerId: 'f-002',
    farmerName: 'Meena Pawar',
    crop: 'Tomato',
    quantity: '180 kg',
    slot: '09:30 AM',
    checkIn: 'checked-in',
    queueStatus: 'completed',
    village: 'Igatpuri',
    mobile: '9800000002',
    bookingId: 'BK-20260828-002',
  },
  {
    id: 'q-003',
    token: 'A023',
    farmerId: 'f-003',
    farmerName: 'Rajesh Patil',
    crop: 'Wheat',
    quantity: '400 kg',
    slot: '10:30 AM',
    checkIn: 'checked-in',
    queueStatus: 'serving',
    village: 'Dindori',
    mobile: '9800000003',
    bookingId: 'BK-20260828-003',
  },
  {
    id: 'q-004',
    token: 'A024',
    farmerId: 'f-004',
    farmerName: 'Anita Deshmukh',
    crop: 'Soybean',
    quantity: '320 kg',
    slot: '11:00 AM',
    checkIn: 'checked-in',
    queueStatus: 'waiting',
    village: 'Nashik Road',
    mobile: '9800000004',
    bookingId: 'BK-20260828-004',
  },
  {
    id: 'q-005',
    token: 'A025',
    farmerId: 'f-005',
    farmerName: 'Vikram Shinde',
    crop: 'Sugarcane',
    quantity: '1200 kg',
    slot: '11:30 AM',
    checkIn: 'pending',
    queueStatus: 'waiting',
    village: 'Peth',
    mobile: '9800000005',
    bookingId: 'BK-20260828-005',
  },
  {
    id: 'q-006',
    token: 'A026',
    farmerId: 'f-006',
    farmerName: 'Sunita Gaikwad',
    crop: 'Grapes',
    quantity: '150 kg',
    slot: '12:00 PM',
    checkIn: 'pending',
    queueStatus: 'waiting',
    village: 'Ozar',
    mobile: '9800000006',
    bookingId: 'BK-20260828-006',
  },
  {
    id: 'q-007',
    token: 'A027',
    farmerId: 'f-007',
    farmerName: 'Ramesh More',
    crop: 'Pomegranate',
    quantity: '200 kg',
    slot: '12:30 PM',
    checkIn: 'pending',
    queueStatus: 'waiting',
    village: 'Trimbak',
    mobile: '9800000007',
    bookingId: 'BK-20260828-007',
  },
  {
    id: 'q-008',
    token: 'A028',
    farmerId: 'f-008',
    farmerName: 'Kavita Bhosale',
    crop: 'Bajra',
    quantity: '300 kg',
    slot: '01:00 PM',
    checkIn: 'pending',
    queueStatus: 'waiting',
    village: 'Deolali',
    mobile: '9800000008',
    bookingId: 'BK-20260828-008',
  },
]

/** Derive summary stats from queue data */
export function getQueueStats(queue) {
  const total = queue.length
  const waiting = queue.filter((q) => q.queueStatus === 'waiting').length
  const serving = queue.find((q) => q.queueStatus === 'serving') || null
  const completed = queue.filter((q) => q.queueStatus === 'completed').length
  const skipped = queue.filter((q) => q.queueStatus === 'skipped').length
  const noShow = queue.filter((q) => q.queueStatus === 'no-show').length

  const nextInQueue = queue.find(
    (q) => q.queueStatus === 'waiting' && q.checkIn === 'checked-in'
  ) || queue.find((q) => q.queueStatus === 'waiting') || null

  /* Estimate ~12 min per farmer */
  const estimatedWaitMinutes = waiting * 12
  const pendingPayments = queue.filter((q) => q.paymentStatus && q.paymentStatus !== 'completed').length

  return {
    total,
    waiting,
    serving,
    completed,
    skipped,
    noShow,
    nextInQueue,
    estimatedWaitMinutes,
    pendingPayments,
  }
}

export const NOTIFICATIONS = [
  { id: 'n-1', text: 'Farmer Anita Deshmukh checked in for token A024', time: '2 min ago', read: false },
  { id: 'n-2', text: 'Procurement completed for token A022 — Meena Pawar', time: '18 min ago', read: false },
  { id: 'n-3', text: 'Payment pending for token A021 — Suresh Jadhav', time: '35 min ago', read: true },
  { id: 'n-4', text: 'New booking: Vikram Shinde — Sugarcane (11:30 AM)', time: '1 hr ago', read: true },
]

export const listPages = [
  {
    name: 'Bookings',
    path: '/bookings',
    expectedHeaders: ['Service ID/Name', 'Customer', 'Status'],
  },
  {
    name: 'Customers',
    path: '/customers',
    expectedHeaders: [/ID\/T[eê]n kh[aá]ch h[aà]ng/i, /S[oố]\s*[dđ]i[eệ]n tho[aạ]i\/Email/i],
  },
  {
    name: 'Partners',
    path: '/workers',
    expectedHeaders: ['Collaborator ID/Name', 'Phone Number', 'Status'],
  },
  {
    name: 'Jobs',
    path: '/jobs',
    expectedHeaders: ['ID/Service Name', /Kh[aá]ch h[aà]ng/i, /Tr[aạ]ng th[aá]i/i],
  },
  {
    name: 'Vouchers',
    path: '/promotions',
    expectedHeaders: ['ID', 'Name', /Tr[aạ]ng th[aá]i/i],
  },
  {
    name: 'Upcoming Jobs',
    path: '/upcomingjobs',
    expectedHeaders: ['Job ID', /Kh[aá]ch h[aà]ng/i, /T[eê]n d[iị]ch v[uụ]/i],
  },
];

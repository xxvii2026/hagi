// The app opens without a wallet. Anything that needs an account asks for one through these events,
// and the app shell answers by opening the connect window or the tour.
export const CONNECT_EVENT = 'hagi-connect'
export const TOUR_EVENT = 'hagi-tour'
export const askConnect = () => dispatchEvent(new Event(CONNECT_EVENT))
export const startTour = () => dispatchEvent(new Event(TOUR_EVENT))

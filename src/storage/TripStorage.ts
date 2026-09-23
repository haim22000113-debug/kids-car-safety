import { StorageKeys } from './storageKeys';
import { getItem, setItem, removeItem } from './StorageService';
import { Trip } from '../models';

async function getAllTrips(): Promise<Trip[]> {
  const trips = await getItem<Trip[]>(StorageKeys.TRIPS);
  return trips ?? [];
}

export async function getTripHistory(): Promise<Trip[]> {
  const trips = await getAllTrips();
  // הנסיעה האחרונה קודם (Trip History - סעיף 18).
  return [...trips].sort((a, b) => (a.startTime < b.startTime ? 1 : -1));
}

/** הנסיעה הפעילה כרגע, אם יש (status שונה מ-CONFIRMED). */
export async function getActiveTrip(): Promise<Trip | null> {
  const trips = await getAllTrips();
  return trips.find((t) => t.status !== 'CONFIRMED') ?? null;
}

export async function getTripById(id: string | undefined): Promise<Trip | null> {
  if (!id) return null;
  const trips = await getAllTrips();
  return trips.find((t) => t.id === id) ?? null;
}

export async function saveTrip(trip: Trip): Promise<boolean> {
  const trips = await getAllTrips();
  const index = trips.findIndex((t) => t.id === trip.id);
  if (index >= 0) {
    trips[index] = trip;
  } else {
    trips.push(trip);
  }
  return setItem<Trip[]>(StorageKeys.TRIPS, trips);
}

/** מוחק את כל היסטוריית הנסיעות (Settings -> איפוס נתונים, סעיף 19). */
export async function clearAllTrips(): Promise<void> {
  await removeItem(StorageKeys.TRIPS);
}
